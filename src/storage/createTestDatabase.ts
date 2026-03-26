import { AuctionDatabase } from "./AuctionDatabase.js";

export function createTestDatabase(): AuctionDatabase {
  return new AuctionDatabase(":memory:");
}
