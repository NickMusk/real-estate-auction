import { describe, expect, it } from "vitest";

import { runSpainBoeAggregation } from "../src/services/runSpainBoeAggregation.js";
import { createTestDatabase } from "../src/storage/createTestDatabase.js";

describe("Feature: spain-boe-vertical-slice", () => {
  /**
   * GOAL: Lock the first full aggregation contract for Spain BOE before implementation starts.
   *
   * WHY: The operator workflow now depends on more than scan output. We need
   *      stable guarantees for saved source links and the persisted "best deals"
   *      analysis block that the UI will render.
   *
   * EXPECTED FLOW:
   *   1. Execute a Spain BOE aggregation against a deterministic fixture source.
   *   2. Persist both the raw listing and the normalized lot.
   *   3. Save source links for each lot.
   *   4. Persist an analysis snapshot that highlights the best deals.
   */
  it("stores source links and an AI-style best-deals snapshot", async () => {
    const database = createTestDatabase();

    const result = await runSpainBoeAggregation({
      database,
      now: new Date("2026-03-25T08:00:00.000Z")
    });

    expect(result.status).toBe("completed");
    expect(result.scan.importedCount).toBe(2);

    const lots = database.listLots();
    expect(lots).toHaveLength(2);
    expect(lots[0]).toMatchObject({
      id: "ES-BOE-SUB-JA-2026-241891",
      country: "ES",
      source: "subastas.boe.es",
      assetType: "residential",
      propertySubtype: "apartment",
      pricing: {
        assessedValue: 180000,
        startingPrice: 126000,
        depositRequired: 8820,
        currency: "EUR"
      },
      sourceUrl: "https://subastas.boe.es/ds.php?id=SUB-JA-2026-241891",
      computed: {
        discountPct: 30,
        pricePerSqm: 1326
      }
    });

    const rawListings = database.listRawListings();
    expect(rawListings).toHaveLength(2);

    const latestAnalysis = database.getLatestAnalysisSnapshot();
    expect(latestAnalysis).not.toBeNull();
    if (latestAnalysis === null) {
      throw new Error("Expected an analysis snapshot to be stored");
    }
    expect(latestAnalysis).toMatchObject({
      source: "subastas.boe.es",
      model: "heuristic-local"
    });
    expect(latestAnalysis.topDeals[0]).toMatchObject({
      lotId: "ES-BOE-SUB-JA-2026-241891",
      title: "Valencia apartment",
      sourceUrl: "https://subastas.boe.es/ds.php?id=SUB-JA-2026-241891"
    });
    expect(latestAnalysis.summary).toContain("Valencia apartment");
  });

  /**
   * GOAL: Prevent duplicate lots when the same source lot is seen again.
   *
   * WHY: Auction portals are incremental by nature, so reruns must update the
   *      existing lot instead of producing duplicate rows and noisy digests.
   *
   * EXPECTED FLOW:
   *   1. Run the same aggregation twice against the same fixture payload.
   *   2. Detect that the source identifiers already exist.
   *   3. Keep the lot count stable while recording a new scan run and a fresh analysis snapshot.
   */
  it("deduplicates lots across repeated BOE aggregations", async () => {
    const database = createTestDatabase();

    await runSpainBoeAggregation({
      database,
      now: new Date("2026-03-25T08:00:00.000Z")
    });

    const rerun = await runSpainBoeAggregation({
      database,
      now: new Date("2026-03-26T08:00:00.000Z")
    });

    expect(rerun.scan.importedCount).toBe(0);
    expect(rerun.scan.updatedCount).toBe(2);
    expect(database.listLots()).toHaveLength(2);
    expect(database.listScanRuns()).toHaveLength(2);
    expect(database.listAnalysisSnapshots()).toHaveLength(2);
  });
});
