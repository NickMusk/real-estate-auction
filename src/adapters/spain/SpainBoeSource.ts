import type { RawSpainBoeLot } from "../../domain/types.js";

export interface SpainBoeSource {
  providerId: string;
  loadLots(): Promise<RawSpainBoeLot[]>;
}
