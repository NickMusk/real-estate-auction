import { sampleBoeLots } from "./sampleBoeLots.js";

import type { RawSpainBoeLot } from "../../domain/types.js";
import type { SpainBoeSource } from "./SpainBoeSource.js";

export class SampleSpainBoeSource implements SpainBoeSource {
  readonly providerId = "sample-boe-source";

  async loadLots(): Promise<RawSpainBoeLot[]> {
    return sampleBoeLots.map((lot) => ({
      ...lot,
      coordinates: lot.coordinates ? { ...lot.coordinates } : null
    }));
  }
}
