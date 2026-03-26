import { mapApifyDatasetItemToRawLot } from "./mapApifyDatasetItemToRawLot.js";

import type { RawSpainBoeLot } from "../../domain/types.js";
import type { SpainBoeSource } from "./SpainBoeSource.js";
import type { ApifyDatasetItem } from "./mapApifyDatasetItemToRawLot.js";

/**
 * GOAL: Load live Spain BOE lots from an Apify actor using the official
 *       actor run-sync dataset endpoint.
 *
 * WHY: The MVP should be able to switch from sample data to real BOE inventory
 *      without changing the downstream normalization and delivery flow.
 *
 * EXPECTED FLOW:
 *   1. Trigger the configured Apify actor with the provided input.
 *   2. Receive dataset items from the synchronous run endpoint.
 *   3. Map those items into the shared raw lot contract.
 */
export class ApifySpainBoeSource implements SpainBoeSource {
  readonly providerId = "apify-spain-boe";

  constructor(
    private readonly config: {
      actorId: string;
      token: string;
      actorInput: Record<string, unknown>;
    }
  ) {}

  async loadLots(): Promise<RawSpainBoeLot[]> {
    const url = new URL(`https://api.apify.com/v2/acts/${this.config.actorId}/run-sync-get-dataset-items`);
    url.searchParams.set("token", this.config.token);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(this.config.actorInput)
    });

    if (!response.ok) {
      throw new Error(`Apify Spain BOE source failed with status ${response.status}`);
    }

    const datasetItems = (await response.json()) as ApifyDatasetItem[];
    return datasetItems.map((item) => mapApifyDatasetItemToRawLot(item));
  }
}
