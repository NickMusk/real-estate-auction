import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createTestDatabase } from "../src/storage/createTestDatabase.js";

describe("Feature: app-health", () => {
  const database = createTestDatabase();

  afterAll(() => {
    database.close();
  });

  /**
   * GOAL: Guarantee a cheap health endpoint for production deploys and uptime
   *       checks before wiring the app into Render.
   *
   * WHY: The deployment target needs a stable readiness path that does not
   *      depend on rendering the full operator UI or running a scan.
   *
   * EXPECTED FLOW:
   *   1. A platform probe calls /healthz.
   *   2. The app responds quickly with a plain JSON readiness payload.
   *   3. No scan, DB mutation, or HTML rendering is required.
   */
  it("returns a cheap readiness response from /healthz", async () => {
    const app = await createApp({
      database,
      runAggregation: async () => {
        throw new Error("not expected in health test");
      },
      getSchedulerState: () => ({
        enabled: true,
        intervalMinutes: 60,
        isRunning: false,
        nextRunAt: null,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastOutcome: null,
        totalRuns: 0,
        skippedRuns: 0
      }),
      getProviderState: () => ({
        source: "sample-boe-source",
        analyzer: "heuristic-local",
        delivery: "preview-local"
      })
    });

    const response = await app.inject({
      method: "GET",
      url: "/healthz"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
