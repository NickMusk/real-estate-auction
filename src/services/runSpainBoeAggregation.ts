import { PreviewDigestDeliveryProvider, composeDigestMessage } from "./DigestDeliveryProvider.js";
import { HeuristicAuctionAnalyzer } from "./HeuristicAuctionAnalyzer.js";
import { defaultAggregationPrefilter, prefilterLots } from "./prefilterLots.js";
import { runSpainBoeScan } from "./runSpainBoeScan.js";

import type { AggregationPrefilter, AggregationResult } from "../domain/types.js";
import type { SpainBoeSource } from "../adapters/spain/SpainBoeSource.js";
import type { AuctionDatabase } from "../storage/AuctionDatabase.js";
import type { DigestDeliveryProvider } from "./DigestDeliveryProvider.js";
import type { AuctionAnalyzer } from "./HeuristicAuctionAnalyzer.js";

/**
 * GOAL: Execute the MVP aggregation pipeline from source scan to digest
 *       delivery with analysis lineage and prefilter guardrails.
 *
 * WHY: The MVP is only complete when one run can ingest live-ready inventory,
 *      shortlist it, analyze it, and create a delivery artifact.
 *
 * EXPECTED FLOW:
 *   1. Scan and persist BOE lots.
 *   2. Prefilter the active shortlist before analysis.
 *   3. Persist an analysis snapshot tied to the scan run.
 *   4. Compose and deliver a digest, storing the delivery outcome.
 */
export async function runSpainBoeAggregation(params: {
  database: AuctionDatabase;
  source?: SpainBoeSource;
  analyzer?: AuctionAnalyzer;
  deliveryProvider?: DigestDeliveryProvider;
  trigger?: "manual" | "scheduled";
  now?: Date;
  prefilter?: AggregationPrefilter;
}): Promise<AggregationResult> {
  const now = params.now ?? new Date();
  const analyzer = params.analyzer ?? new HeuristicAuctionAnalyzer();
  const deliveryProvider = params.deliveryProvider ?? new PreviewDigestDeliveryProvider();
  const scan = await runSpainBoeScan(
    params.source
      ? {
          database: params.database,
          source: params.source,
          now
        }
      : {
          database: params.database,
          now
        }
  );

  const allLots = params.database.listLots();
  const shortlistedLots = prefilterLots(allLots, params.prefilter ?? defaultAggregationPrefilter);
  const analysisDraft = await analyzer.analyzeLots({
    lots: shortlistedLots,
    now
  });

  const analysis = params.database.insertAnalysisSnapshot({
    source: "subastas.boe.es",
    model: analysisDraft.model,
    scanRunId: scan.id,
    createdAt: now.toISOString(),
    analyzedLotIds: shortlistedLots.map((lot) => lot.id),
    summary: analysisDraft.summary,
    topDeals: analysisDraft.topDeals
  });

  const digestMessage = composeDigestMessage({
    analysis,
    lots: allLots
  });

  const delivery = await (async () => {
    try {
      const receipt = await deliveryProvider.deliverDigest({
        analysis,
        lots: allLots,
        message: digestMessage,
        now
      });

      return params.database.insertDeliveryRun({
        analysisSnapshotId: analysis.id,
        providerId: receipt.providerId,
        status: receipt.status,
        createdAt: now.toISOString(),
        previewText: receipt.previewText,
        externalId: receipt.externalId
      });
    } catch (error) {
      return params.database.insertDeliveryRun({
        analysisSnapshotId: analysis.id,
        providerId: deliveryProvider.providerId,
        status: "failed",
        createdAt: now.toISOString(),
        previewText: digestMessage,
        externalId: null,
        errorMessage: error instanceof Error ? error.message : "Unknown delivery failure"
      });
    }
  })();

  return {
    status: "completed",
    trigger: params.trigger ?? "manual",
    scan,
    analysis,
    delivery,
    shortlistedCount: shortlistedLots.length
  };
}
