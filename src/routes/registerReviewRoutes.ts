import { renderHomePage } from "../ui/renderHomePage.js";

import type { FastifyInstance } from "fastify";
import type { AggregationResult, RuntimeProviderState, SchedulerState } from "../domain/types.js";
import type { AuctionDatabase } from "../storage/AuctionDatabase.js";

/**
 * GOAL: Expose a review surface for the Spain BOE aggregation flow that shows
 *       scan state, saved source links, best-deals analysis, and timer status.
 *
 * WHY: The operator needs one local page that proves both manual runs and the
 *      hourly automation are wired into the same persisted system state.
 *
 * EXPECTED FLOW:
 *   1. Operator opens the home page and sees scan, analysis, and scheduler state.
 *   2. Operator triggers the sample aggregation from the page.
 *   3. The server runs the aggregation and redirects back to the review UI.
 *   4. The page renders updated lots, source links, and the latest best deals.
 */
export async function registerReviewRoutes(
  app: FastifyInstance,
  runtime: {
    database: AuctionDatabase;
    runAggregation: () => Promise<AggregationResult>;
    getSchedulerState: () => SchedulerState;
    getProviderState: () => RuntimeProviderState;
  }
): Promise<void> {
  app.get("/", async (_request, reply) => {
    const html = renderHomePage({
      lots: runtime.database.listLots(),
      scanRuns: runtime.database.listScanRuns(),
      latestAnalysis: runtime.database.getLatestAnalysisSnapshot(),
      latestDelivery: runtime.database.getLatestDeliveryRun(),
      schedulerState: runtime.getSchedulerState(),
      providerState: runtime.getProviderState()
    });

    reply.type("text/html; charset=utf-8");
    return html;
  });

  app.post("/scans/spain-boe", async (_request, reply) => {
    await runtime.runAggregation();
    reply.code(303);
    return reply.redirect("/");
  });
}
