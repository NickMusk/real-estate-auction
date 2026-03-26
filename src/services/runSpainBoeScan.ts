import { createHash } from "node:crypto";

import { normalizeBoeLot } from "../adapters/spain/normalizeBoeLot.js";
import { SampleSpainBoeSource } from "../adapters/spain/sampleBoeSource.js";

import type { ScanResult } from "../domain/types.js";
import type { SpainBoeSource } from "../adapters/spain/SpainBoeSource.js";
import type { AuctionDatabase } from "../storage/AuctionDatabase.js";

/**
 * GOAL: Execute the first production-shaped Spain BOE ingestion flow for the
 *       project using a deterministic sample source.
 *
 * WHY: We need one end-to-end slice that proves the system can ingest raw lots,
 *      normalize them, persist both raw and normalized views, and surface the
 *      result to the operator UI before adding more countries or scoring layers.
 *
 * EXPECTED FLOW:
 *   1. Load raw Spain BOE lots from the configured source.
 *   2. Hash and persist the raw payload for auditability and replay.
 *   3. Normalize each lot into the shared schema and upsert it into storage.
 *   4. Record scan-run status and counts for the review UI.
 */
export async function runSpainBoeScan(params: {
  database: AuctionDatabase;
  source?: SpainBoeSource;
  now?: Date;
}): Promise<ScanResult> {
  const source = params.source ?? new SampleSpainBoeSource();
  const now = params.now ?? new Date();
  const startedAt = now.toISOString();
  const scanRunId = params.database.beginScanRun("subastas.boe.es", startedAt);

  let importedCount = 0;
  let updatedCount = 0;

  try {
    const rawLots = await source.loadLots();

    for (const rawLot of rawLots) {
      const sourceHash = createHash("sha256").update(JSON.stringify(rawLot)).digest("hex");

      params.database.upsertRawListing({
        source: "subastas.boe.es",
        sourceId: rawLot.id,
        payload: rawLot,
        sourceHash,
        seenAt: startedAt
      });

      const normalizedLot = normalizeBoeLot(rawLot, now);
      const upsertResult = params.database.upsertLot({
        lot: normalizedLot,
        sourceHash,
        seenAt: startedAt
      });

      if (upsertResult.inserted) {
        importedCount += 1;
      } else if (upsertResult.updated) {
        updatedCount += 1;
      }
    }

    params.database.finishScanRun({
      id: scanRunId,
      status: "completed",
      finishedAt: now.toISOString(),
      importedCount,
      updatedCount
    });

    return {
      id: scanRunId,
      status: "completed",
      importedCount,
      updatedCount
    };
  } catch (error) {
    params.database.finishScanRun({
      id: scanRunId,
      status: "failed",
      finishedAt: new Date().toISOString(),
      importedCount,
      updatedCount,
      errorMessage: error instanceof Error ? error.message : "Unknown BOE scan failure"
    });

    throw error;
  }
}
