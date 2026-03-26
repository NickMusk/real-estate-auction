import "dotenv/config";

import { parseArgs } from "node:util";
import { resolve } from "node:path";

import { createApp } from "./app.js";
import type { AggregationPrefilter } from "./domain/types.js";
import { HourlyAggregationScheduler } from "./services/HourlyAggregationScheduler.js";
import { createMvpProviders } from "./services/createMvpProviders.js";
import { runSpainBoeAggregation } from "./services/runSpainBoeAggregation.js";
import { AuctionDatabase } from "./storage/AuctionDatabase.js";

const parsedArgs = parseArgs({
  options: {
    port: {
      type: "string",
      default: process.env.PORT ?? "3000"
    }
  }
});

const port = Number(parsedArgs.values.port);
const databasePath = process.env.AUCTION_DB_PATH ?? resolve(process.cwd(), "data/auction.sqlite");
const schedulerIntervalMs = Number(process.env.SCHEDULER_INTERVAL_MS ?? 60 * 60 * 1000);
const prefilter: AggregationPrefilter = {
  minDiscountPct: Number(process.env.MIN_DISCOUNT_PCT ?? 15),
  allowedStatuses: ["active", "upcoming"],
  maxAnalyzedLots: Number(process.env.MAX_ANALYZED_LOTS ?? 20)
};
const database = new AuctionDatabase(databasePath);
const providers = createMvpProviders(process.env);

const scheduler = new HourlyAggregationScheduler({
  intervalMs: schedulerIntervalMs,
  runAggregation: async () => {
    await runSpainBoeAggregation({
      database,
      source: providers.source,
      analyzer: providers.analyzer,
      deliveryProvider: providers.delivery,
      prefilter,
      trigger: "scheduled"
    });
  }
});

const app = await createApp({
  database,
  runAggregation: async () =>
    await runSpainBoeAggregation({
      database,
      source: providers.source,
      analyzer: providers.analyzer,
      deliveryProvider: providers.delivery,
      prefilter,
      trigger: "manual"
    }),
  getSchedulerState: () => scheduler.getState(),
  getProviderState: () => providers.providerState
});

async function start(): Promise<void> {
  scheduler.start();
  await app.listen({
    host: "0.0.0.0",
    port
  });
}

async function shutdown(signal: string): Promise<void> {
  try {
    scheduler.stop();
    await app.close();
  } finally {
    database.close();
  }

  process.exit(signal === "SIGTERM" ? 0 : 130);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await start();
