import type {
  AnalysisSnapshotRecord,
  DeliveryStatus,
  NormalizedLot
} from "../domain/types.js";

export interface DeliveryResult {
  providerId: string;
  status: DeliveryStatus;
  externalId: string | null;
  previewText: string;
  errorMessage?: string;
}

export interface DigestDeliveryProvider {
  providerId: string;
  deliverDigest(params: {
    analysis: AnalysisSnapshotRecord;
    lots: NormalizedLot[];
    message: string;
    now: Date;
  }): Promise<DeliveryResult>;
}

function buildLotMap(lots: NormalizedLot[]): Map<string, NormalizedLot> {
  return new Map(lots.map((lot) => [lot.id, lot]));
}

/**
 * GOAL: Produce one operator-readable digest message that can be previewed
 *       locally or sent to Telegram without changing the aggregation flow.
 *
 * WHY: Delivery providers should receive a ready-to-send message instead of
 *      rebuilding business formatting rules in multiple places.
 *
 * EXPECTED FLOW:
 *   1. Read the top deals from the latest analysis snapshot.
 *   2. Enrich them with normalized lot pricing/location data.
 *   3. Return a compact digest with source links and ranking context.
 */
export function composeDigestMessage(params: {
  analysis: AnalysisSnapshotRecord;
  lots: NormalizedLot[];
}): string {
  const lotMap = buildLotMap(params.lots);
  const lines = ["Spain BOE digest", "", params.analysis.summary, ""];

  params.analysis.topDeals.forEach((deal, index) => {
    const lot = lotMap.get(deal.lotId);
    const price = lot ? `€${lot.pricing.startingPrice.toLocaleString("en-IE")}` : "n/a";
    const location = lot ? `${lot.location.municipality}, ${lot.location.province}` : "Unknown location";

    lines.push(`${index + 1}. ${deal.title} — ${deal.score}/100`);
    lines.push(`${location} • Start ${price}`);
    lines.push(deal.summary);
    lines.push(deal.sourceUrl);
    lines.push("");
  });

  return lines.join("\n").trim();
}

/**
 * GOAL: Provide a default delivery provider that keeps the full digest visible
 *       in local development and tests without external credentials.
 *
 * WHY: The project still needs a complete end-to-end delivery artifact even
 *      when Telegram is not configured.
 *
 * EXPECTED FLOW:
 *   1. Receive a composed digest message.
 *   2. Return it unchanged as a preview artifact.
 *   3. Let storage/UI persist and display that preview.
 */
export class PreviewDigestDeliveryProvider implements DigestDeliveryProvider {
  readonly providerId = "preview-local";

  async deliverDigest(params: {
    analysis: AnalysisSnapshotRecord;
    lots: NormalizedLot[];
    message: string;
    now: Date;
  }): Promise<DeliveryResult> {
    return {
      providerId: this.providerId,
      status: "previewed",
      externalId: null,
      previewText: params.message
    };
  }
}

/**
 * GOAL: Send the latest digest to Telegram using the Bot API.
 *
 * WHY: Telegram is the MVP delivery channel described in the concept, so the
 *      aggregation pipeline needs a real external delivery path when configured.
 *
 * EXPECTED FLOW:
 *   1. Post the digest message to the configured chat via sendMessage.
 *   2. Record the returned message id when successful.
 *   3. Bubble up a typed failure if Telegram rejects the request.
 */
export class TelegramDigestDeliveryProvider implements DigestDeliveryProvider {
  readonly providerId = "telegram-bot";

  constructor(
    private readonly config: {
      botToken: string;
      chatId: string;
    }
  ) {}

  async deliverDigest(params: {
    analysis: AnalysisSnapshotRecord;
    lots: NormalizedLot[];
    message: string;
    now: Date;
  }): Promise<DeliveryResult> {
    const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: this.config.chatId,
        text: params.message,
        disable_web_page_preview: true
      })
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };

    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.description ?? `Telegram delivery failed with status ${response.status}`);
    }

    return {
      providerId: this.providerId,
      status: "delivered",
      externalId: payload.result?.message_id ? String(payload.result.message_id) : null,
      previewText: params.message
    };
  }
}
