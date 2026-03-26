import { afterEach, describe, expect, it, vi } from "vitest";

import { HourlyAggregationScheduler } from "../src/services/HourlyAggregationScheduler.js";

function createRunGate(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe("Feature: spain-boe-hourly-scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * GOAL: Guarantee that hourly automation runs on schedule without overlapping
   *       an already running aggregation.
   *
   * WHY: The app now supports a timer-driven aggregator. If overlapping runs are
   *      allowed, scan state and best-deals analysis can become inconsistent.
   *
   * EXPECTED FLOW:
   *   1. Start the scheduler with a one-hour interval.
   *   2. Let the first run begin and remain in flight.
   *   3. Advance another interval and verify the scheduler skips the overlap.
   *   4. Finish the first run and confirm the runtime state is updated cleanly.
   */
  it("starts hourly runs and skips overlapping intervals", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T08:00:00.000Z"));

    const startedRuns: string[] = [];
    const runGate = createRunGate();

    const scheduler = new HourlyAggregationScheduler({
      intervalMs: 60 * 60 * 1000,
      runAggregation: async () => {
        startedRuns.push(new Date().toISOString());
        await runGate.promise;
      }
    });

    scheduler.start();

    expect(scheduler.getState()).toMatchObject({
      enabled: true,
      intervalMinutes: 60,
      isRunning: false,
      skippedRuns: 0
    });

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(startedRuns).toHaveLength(1);
    expect(scheduler.getState().isRunning).toBe(true);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(startedRuns).toHaveLength(1);
    expect(scheduler.getState().skippedRuns).toBe(1);

    runGate.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);

    expect(scheduler.getState()).toMatchObject({
      isRunning: false,
      totalRuns: 1,
      lastOutcome: "completed"
    });

    scheduler.stop();
  });
});
