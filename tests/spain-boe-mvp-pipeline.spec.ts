import { describe, expect, it, vi } from "vitest";

import { runSpainBoeAggregation } from "../src/services/runSpainBoeAggregation.js";
import { createTestDatabase } from "../src/storage/createTestDatabase.js";

import type { AuctionAnalyzer } from "../src/services/HeuristicAuctionAnalyzer.js";
import type { DigestDeliveryProvider } from "../src/services/DigestDeliveryProvider.js";

describe("Feature: spain-boe-mvp-pipeline", () => {
  /**
   * GOAL: Protect the MVP orchestration flow from live-source scan through
   *       AI analysis lineage and digest delivery persistence.
   *
   * WHY: The MVP is not just a scan anymore. We need confidence that one run
   *      creates traceable analysis and a digest artifact that can be reviewed
   *      or delivered to Telegram.
   *
   * EXPECTED FLOW:
   *   1. Scan and upsert Spain BOE lots.
   *   2. Prefilter eligible lots before analysis.
   *   3. Persist an analysis snapshot linked to the scan run.
   *   4. Compose and store a digest delivery record linked to the analysis.
   */
  it("stores analysis lineage and a delivery preview for each aggregation run", async () => {
    const database = createTestDatabase();
    const deliveryProvider: DigestDeliveryProvider = {
      providerId: "preview-local",
      deliverDigest: vi.fn(async ({ message }) => ({
        providerId: "preview-local",
        status: "previewed" as const,
        externalId: null,
        previewText: message
      }))
    };

    const result = await runSpainBoeAggregation({
      database,
      now: new Date("2026-03-25T08:00:00.000Z"),
      deliveryProvider
    });

    expect(result.scan.id).toBeGreaterThan(0);
    expect(result.analysis.scanRunId).toBe(result.scan.id);
    expect(result.delivery).toMatchObject({
      providerId: "preview-local",
      status: "previewed",
      analysisSnapshotId: result.analysis.id
    });
    expect(result.delivery.previewText).toContain("Valencia apartment");
    expect(result.delivery.previewText).toContain("https://subastas.boe.es/ds.php?id=SUB-JA-2026-241891");
    expect(database.listDeliveryRuns()).toHaveLength(1);
  });

  /**
   * GOAL: Enforce prefilter and cap guardrails before expensive analysis.
   *
   * WHY: Live AI costs should scale with opportunity quality, not raw lot count.
   *
   * EXPECTED FLOW:
   *   1. Scan multiple lots into storage.
   *   2. Apply discount/status rules and max-analyzed-lots cap.
   *   3. Send only the shortlisted lots into the analyzer.
   */
  it("filters and caps the analyzed shortlist before passing lots to the analyzer", async () => {
    const database = createTestDatabase();
    const analyzerSpy = vi.fn(async ({ lots }: { lots: Array<{ id: string }> }) => ({
      model: "test-analyzer",
      summary: `Received ${lots.length} shortlisted lots`,
      topDeals: lots.map((lot, index) => ({
        lotId: lot.id,
        title: `Lot ${index + 1}`,
        sourceUrl: "https://example.test/lot",
        score: 80 - index,
        verdict: "worth reviewing",
        summary: "Test summary",
        reasons: ["Test reason"]
      }))
    }));

    const analyzer: AuctionAnalyzer = {
      providerId: "test-analyzer",
      analyzeLots: analyzerSpy
    };

    await runSpainBoeAggregation({
      database,
      now: new Date("2026-03-25T08:00:00.000Z"),
      analyzer,
      prefilter: {
        minDiscountPct: 25,
        allowedStatuses: ["active"],
        maxAnalyzedLots: 1
      }
    });

    expect(analyzerSpy).toHaveBeenCalledTimes(1);
    expect(analyzerSpy.mock.calls[0]?.[0].lots).toHaveLength(1);
    expect(analyzerSpy.mock.calls[0]?.[0].lots[0]?.id).toBe("ES-BOE-SUB-JA-2026-241891");
  });

  /**
   * GOAL: Keep the persisted best-deals block aligned with the new operator
   *       expectation of reviewing a top 10 shortlist.
   *
   * WHY: If the analyzer result gets truncated back to 3, the UI will still
   *      hide most of the ranked opportunities even after we fetch more lots.
   *
   * EXPECTED FLOW:
   *   1. Analyzer returns more than 10 ranked deals.
   *   2. Aggregation persists only the top 10 insights.
   *   3. The UI can render a stable top 10 block from that snapshot.
   */
  it("persists up to 10 ranked deals in the analysis snapshot", async () => {
    const database = createTestDatabase();
    const deliveryProvider: DigestDeliveryProvider = {
      providerId: "preview-local",
      deliverDigest: vi.fn(async ({ message }) => ({
        providerId: "preview-local",
        status: "previewed" as const,
        externalId: null,
        previewText: message
      }))
    };

    const analyzer: AuctionAnalyzer = {
      providerId: "test-analyzer",
      analyzeLots: vi.fn(async () => ({
        model: "test-analyzer",
        summary: "Top 10 generated",
        topDeals: Array.from({ length: 12 }, (_, index) => ({
          lotId: `lot-${index + 1}`,
          title: `Lot ${index + 1}`,
          sourceUrl: `https://example.test/lot-${index + 1}`,
          score: 99 - index,
          verdict: "worth reviewing",
          summary: `Summary ${index + 1}`,
          reasons: ["Reason A", "Reason B", "Reason C", "Reason D"]
        }))
      }))
    };

    const result = await runSpainBoeAggregation({
      database,
      analyzer,
      deliveryProvider,
      now: new Date("2026-03-25T08:00:00.000Z")
    });

    expect(result.analysis.topDeals).toHaveLength(10);
    expect(result.analysis.topDeals[0]?.title).toBe("Lot 1");
    expect(result.analysis.topDeals[9]?.title).toBe("Lot 10");
  });
});
