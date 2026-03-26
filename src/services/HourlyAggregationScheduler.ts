import type { SchedulerOutcome, SchedulerState } from "../domain/types.js";

/**
 * GOAL: Run the aggregation flow on a fixed hourly cadence without allowing
 *       overlapping intervals to stampede the app.
 *
 * WHY: The app now has a background aggregator. Even in-process automation
 *      needs explicit runtime state so the operator can trust what happened.
 *
 * EXPECTED FLOW:
 *   1. Start the scheduler and expose the next planned run time.
 *   2. Trigger the aggregation every configured interval.
 *   3. Skip the interval if the previous run is still in flight.
 *   4. Publish runtime state for the review UI.
 */
export class HourlyAggregationScheduler {
  private readonly intervalMs: number;
  private readonly runAggregation: () => Promise<unknown>;
  private readonly now: () => Date;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: SchedulerState;

  constructor(params: {
    intervalMs: number;
    runAggregation: () => Promise<unknown>;
    now?: () => Date;
  }) {
    this.intervalMs = params.intervalMs;
    this.runAggregation = params.runAggregation;
    this.now = params.now ?? (() => new Date());
    this.state = {
      enabled: false,
      intervalMinutes: Math.round(this.intervalMs / 60_000),
      isRunning: false,
      nextRunAt: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastOutcome: null,
      totalRuns: 0,
      skippedRuns: 0
    };
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.state.enabled = true;
    this.state.nextRunAt = this.createNextRunAt();
    this.timer = setInterval(() => {
      void this.handleIntervalTick();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.state.enabled = false;
    this.state.nextRunAt = null;
  }

  getState(): SchedulerState {
    return { ...this.state };
  }

  private createNextRunAt(): string {
    return new Date(this.now().getTime() + this.intervalMs).toISOString();
  }

  private async handleIntervalTick(): Promise<void> {
    this.state.nextRunAt = this.createNextRunAt();

    if (this.state.isRunning) {
      this.state.skippedRuns += 1;
      return;
    }

    this.state.isRunning = true;
    this.state.lastStartedAt = this.now().toISOString();

    let outcome: SchedulerOutcome = "completed";

    try {
      await this.runAggregation();
      this.state.totalRuns += 1;
    } catch {
      outcome = "failed";
      this.state.totalRuns += 1;
    } finally {
      this.state.isRunning = false;
      this.state.lastOutcome = outcome;
      this.state.lastFinishedAt = this.now().toISOString();
    }
  }
}
