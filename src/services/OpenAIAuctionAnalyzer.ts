import type { AnalysisDraft, BestDealInsight, NormalizedLot } from "../domain/types.js";
import type { AuctionAnalyzer } from "./HeuristicAuctionAnalyzer.js";

interface OpenAIResponsePayload {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
}

interface OpenAIAnalyzerResult {
  summary: string;
  topDeals: BestDealInsight[];
}

function buildPrompt(lots: NormalizedLot[], maxTopDeals: number): string {
  return [
    "You are an expert analyst for distressed real-estate auctions.",
    "Review the shortlisted Spain BOE lots and return JSON only.",
    "Return an object with keys: summary, topDeals.",
    `topDeals must be an array of up to ${maxTopDeals} items with: lotId, title, sourceUrl, score, verdict, summary, reasons.`,
    "Use concise English output.",
    "",
    JSON.stringify(lots, null, 2)
  ].join("\n");
}

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (payload.output_text && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  const maybeText = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();

  if (!maybeText) {
    throw new Error("OpenAI analyzer returned no text output");
  }

  return maybeText;
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  const unfenced = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (unfenced.startsWith("{")) {
    return unfenced;
  }

  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return unfenced.slice(start, end + 1);
  }

  return unfenced;
}

function normalizeResult(parsed: OpenAIAnalyzerResult, model: string, maxTopDeals: number): AnalysisDraft {
  return {
    model: `openai-live:${model}`,
    summary: parsed.summary,
    topDeals: parsed.topDeals.slice(0, maxTopDeals).map((deal) => ({
      ...deal,
      reasons: deal.reasons.slice(0, 3)
    }))
  };
}

/**
 * GOAL: Support a live LLM-backed auction analyzer for the MVP while keeping
 *       the rest of the pipeline independent from OpenAI API details.
 *
 * WHY: The concept explicitly calls for AI scoring and summaries; a provider
 *      adapter lets us add that capability without coupling the app to one API.
 *
 * EXPECTED FLOW:
 *   1. Serialize the shortlisted lots into a focused prompt.
 *   2. Request a JSON-only analysis from the OpenAI Responses API.
 *   3. Parse the returned text into the shared analysis draft contract.
 */
export class OpenAIAuctionAnalyzer implements AuctionAnalyzer {
  readonly providerId = "openai-responses";

  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      baseUrl?: string;
      maxTopDeals?: number;
    }
  ) {}

  async analyzeLots(params: { lots: NormalizedLot[]; now: Date }): Promise<AnalysisDraft> {
    const response = await fetch(`${this.config.baseUrl ?? "https://api.openai.com"}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        input: buildPrompt(params.lots, this.config.maxTopDeals ?? 10)
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI analyzer failed with status ${response.status}`);
    }

    const payload = (await response.json()) as OpenAIResponsePayload;
    const outputText = extractOutputText(payload);
    const parsed = JSON.parse(extractJsonObject(outputText)) as OpenAIAnalyzerResult;
    return normalizeResult(parsed, this.config.model, this.config.maxTopDeals ?? 10);
  }
}
