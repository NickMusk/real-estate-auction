import type { AnalysisDraft, BestDealInsight, NormalizedLot } from "../domain/types.js";

export interface AuctionAnalyzer {
  providerId: string;
  analyzeLots(params: { lots: NormalizedLot[]; now: Date }): Promise<AnalysisDraft>;
}

interface RankedLot {
  lot: NormalizedLot;
  insight: BestDealInsight;
}

function includesKeyword(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function buildInsight(lot: NormalizedLot): BestDealInsight {
  let score = lot.computed.discountPct;
  const reasons: string[] = [];

  if (lot.assetType === "residential") {
    score += 22;
    reasons.push("residential inventory is easier to review and liquidate");
  } else if (lot.assetType === "commercial") {
    score += 14;
    reasons.push("commercial profile can still justify review");
  } else {
    score += 8;
    reasons.push("land deals can be attractive but usually require a longer hold");
  }

  if (includesKeyword(lot.rawDescription, ["centro historico", "historic"])) {
    score += 12;
    reasons.push("historic-center location improves renter and resale appeal");
  }

  if (includesKeyword(lot.rawDescription, ["balcon", "balcony"])) {
    score += 6;
    reasons.push("balcony or outdoor feature adds marketability");
  }

  if (includesKeyword(lot.rawDescription, ["habitable", "habitable"])) {
    score += 8;
    reasons.push("already-habitable condition lowers near-term renovation risk");
  }

  if (includesKeyword(lot.rawDescription, ["sin ocupantes", "vacant", "no occupants"])) {
    score += 10;
    reasons.push("no known occupants reduces execution friction");
  }

  if (lot.computed.pricePerSqm !== null && lot.computed.pricePerSqm <= 1500) {
    score += 6;
    reasons.push("price per square meter is still competitive for a first-pass shortlist");
  }

  if (lot.assetType === "land") {
    score -= 4;
  }

  const boundedScore = Math.max(0, Math.min(99, Math.round(score)));
  const verdict =
    boundedScore >= 80 ? "high conviction" : boundedScore >= 65 ? "worth reviewing" : "monitor for updates";
  const summary =
    lot.assetType === "residential"
      ? `${lot.title} stands out as a cleaner near-term acquisition with visible demand signals and a manageable risk profile.`
      : `${lot.title} stays interesting for a longer-cycle strategy, but it needs more execution patience than the top residential lot.`;

  return {
    lotId: lot.id,
    title: lot.title,
    sourceUrl: lot.sourceUrl,
    score: boundedScore,
    verdict,
    summary,
    reasons: reasons.slice(0, 3)
  };
}

function buildSummary(topDeals: RankedLot[]): string {
  const [firstDeal, secondDeal] = topDeals;

  if (!firstDeal) {
    return "No active Spain BOE lots are available for analysis yet.";
  }

  if (!secondDeal) {
    return `${firstDeal.lot.title} is the only active lot on the board and currently defines the shortlist on its own.`;
  }

  return `${firstDeal.lot.title} leads the current shortlist because it combines discount depth with better liquidity signals. ${secondDeal.lot.title} still makes the list, but it looks more execution-heavy and should stay behind the lead deal.`;
}

/**
 * GOAL: Produce a deterministic best-deals block that behaves like an AI
 *       shortlist while keeping local tests stable and cheap.
 *
 * WHY: The UI now needs an "AI analysis" section, but the repo requires
 *      reproducible red/green cycles before we wire a live model provider.
 *
 * EXPECTED FLOW:
 *   1. Score active lots using explicit heuristics over normalized fields.
 *   2. Rank the shortlist and produce operator-readable reasons.
 *   3. Persist the resulting summary as an analysis snapshot for the UI.
 */
export class HeuristicAuctionAnalyzer implements AuctionAnalyzer {
  readonly providerId = "heuristic-local";

  async analyzeLots(params: { lots: NormalizedLot[]; now: Date }): Promise<AnalysisDraft> {
    const rankedLots = params.lots
      .filter((lot) => lot.auction.status === "active" || lot.auction.status === "upcoming")
      .map((lot) => ({
        lot,
        insight: buildInsight(lot)
      }))
      .sort((left, right) => right.insight.score - left.insight.score)
      .slice(0, 3);

    return {
      model: "heuristic-local",
      summary: buildSummary(rankedLots),
      topDeals: rankedLots.map((entry) => entry.insight)
    };
  }
}
