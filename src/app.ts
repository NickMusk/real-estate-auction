import Fastify from "fastify";
import formbody from "@fastify/formbody";

import { registerReviewRoutes } from "./routes/registerReviewRoutes.js";

import type { AggregationResult, RuntimeProviderState, SchedulerState } from "./domain/types.js";
import type { AuctionDatabase } from "./storage/AuctionDatabase.js";

export async function createApp(runtime: {
  database: AuctionDatabase;
  runAggregation: () => Promise<AggregationResult>;
  getSchedulerState: () => SchedulerState;
  getProviderState: () => RuntimeProviderState;
}) {
  const app = Fastify({
    logger: false
  });

  await app.register(formbody);
  await registerReviewRoutes(app, runtime);

  return app;
}
