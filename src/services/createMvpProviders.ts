import { ApifySpainBoeSource } from "../adapters/spain/ApifySpainBoeSource.js";
import { BoeWebsiteSpainBoeSource } from "../adapters/spain/BoeWebsiteSpainBoeSource.js";
import { SampleSpainBoeSource } from "../adapters/spain/sampleBoeSource.js";
import { PreviewDigestDeliveryProvider, TelegramDigestDeliveryProvider } from "./DigestDeliveryProvider.js";
import { HeuristicAuctionAnalyzer } from "./HeuristicAuctionAnalyzer.js";
import { OpenAIAuctionAnalyzer } from "./OpenAIAuctionAnalyzer.js";

import type { RuntimeProviderState } from "../domain/types.js";
import type { SpainBoeSource } from "../adapters/spain/SpainBoeSource.js";
import type { DigestDeliveryProvider } from "./DigestDeliveryProvider.js";
import type { AuctionAnalyzer } from "./HeuristicAuctionAnalyzer.js";

function parseActorInput(rawValue: string | undefined): Record<string, unknown> {
  if (!rawValue) {
    return {};
  }

  return JSON.parse(rawValue) as Record<string, unknown>;
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

/**
 * GOAL: Build the runtime provider set for the MVP from environment-based
 *       configuration while keeping safe local fallbacks.
 *
 * WHY: The app needs to switch between sample/local mode and live mode without
 *      changing the orchestration or UI code.
 *
 * EXPECTED FLOW:
 *   1. Prefer live Apify source when configured, otherwise use sample data.
 *   2. Prefer live OpenAI analyzer when configured, otherwise use heuristics.
 *   3. Prefer Telegram delivery when configured, otherwise use digest preview.
 */
export function createMvpProviders(env: NodeJS.ProcessEnv): {
  source: SpainBoeSource;
  analyzer: AuctionAnalyzer;
  delivery: DigestDeliveryProvider;
  providerState: RuntimeProviderState;
} {
  const sourceMode = env.SPAIN_BOE_SOURCE_MODE?.trim().toLowerCase();
  const topDealsLimit = parsePositiveInteger(env.TOP_DEALS_LIMIT, 10);
  const source =
    sourceMode === "sample"
      ? new SampleSpainBoeSource()
      : sourceMode === "website"
      ? new BoeWebsiteSpainBoeSource({
          maxResults: parsePositiveInteger(env.SPAIN_BOE_LIVE_MAX_RESULTS, 100),
          provinceCode: env.SPAIN_BOE_PROVINCE_CODE ?? null
        })
      : env.APIFY_TOKEN && env.APIFY_SPAIN_BOE_ACTOR_ID
      ? new ApifySpainBoeSource({
          actorId: env.APIFY_SPAIN_BOE_ACTOR_ID,
          token: env.APIFY_TOKEN,
          actorInput: parseActorInput(env.APIFY_SPAIN_BOE_INPUT_JSON)
        })
      : new SampleSpainBoeSource();

  const analyzer =
    env.OPENAI_API_KEY
      ? new OpenAIAuctionAnalyzer({
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL ?? "gpt-4.1-mini",
          maxTopDeals: topDealsLimit
        })
      : new HeuristicAuctionAnalyzer({
          maxTopDeals: topDealsLimit
        });

  const delivery =
    env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
      ? new TelegramDigestDeliveryProvider({
          botToken: env.TELEGRAM_BOT_TOKEN,
          chatId: env.TELEGRAM_CHAT_ID
        })
      : new PreviewDigestDeliveryProvider();

  return {
    source,
    analyzer,
    delivery,
    providerState: {
      source: source.providerId,
      analyzer: analyzer.providerId,
      delivery: delivery.providerId
    }
  };
}
