import type { AggregationPrefilter, NormalizedLot } from "../domain/types.js";

export const defaultAggregationPrefilter: AggregationPrefilter = {
  minDiscountPct: 15,
  allowedStatuses: ["active", "upcoming"],
  maxAnalyzedLots: 20
};

/**
 * GOAL: Apply explicit cost and relevance guardrails before the analyzer runs.
 *
 * WHY: Live AI analysis should focus on the most promising active inventory,
 *      not every lot that happens to be present in storage.
 *
 * EXPECTED FLOW:
 *   1. Filter by allowed auction status.
 *   2. Filter by minimum discount threshold.
 *   3. Sort the surviving lots by strongest discount.
 *   4. Cap the shortlist size passed to the analyzer.
 */
export function prefilterLots(lots: NormalizedLot[], config: AggregationPrefilter): NormalizedLot[] {
  return lots
    .filter((lot) => config.allowedStatuses.includes(lot.auction.status))
    .filter((lot) => lot.computed.discountPct >= config.minDiscountPct)
    .sort((left, right) => right.computed.discountPct - left.computed.discountPct)
    .slice(0, config.maxAnalyzedLots);
}
