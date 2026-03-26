import { describe, expect, it } from "vitest";

import { createMvpProviders } from "../src/services/createMvpProviders.js";

describe("Feature: create-mvp-providers", () => {
  /**
   * GOAL: Protect the source-provider selection rules for local, live, and
   *       recovery scenarios before changing the live scan path.
   *
   * WHY: We need an explicit way to force the direct BOE live source even when
   *      Apify credentials are present, otherwise the app keeps choosing a
   *      broken upstream path.
   *
   * EXPECTED FLOW:
   *   1. Read the configured source mode from env.
   *   2. Prefer the direct BOE website source when explicitly requested.
   *   3. Preserve the analyzer and delivery provider selection behavior.
   */
  it("prefers the direct BOE website source when source mode is set to website", () => {
    const providers = createMvpProviders({
      APIFY_TOKEN: "apify-token",
      APIFY_SPAIN_BOE_ACTOR_ID: "actor-id",
      OPENAI_API_KEY: "",
      SPAIN_BOE_SOURCE_MODE: "website"
    });

    expect(providers.providerState.source).toBe("boe-website-live");
  });

  it("keeps the deterministic sample source when source mode is set to sample", () => {
    const providers = createMvpProviders({
      APIFY_TOKEN: "apify-token",
      APIFY_SPAIN_BOE_ACTOR_ID: "actor-id",
      OPENAI_API_KEY: "",
      SPAIN_BOE_SOURCE_MODE: "sample"
    });

    expect(providers.providerState.source).toBe("sample-boe-source");
  });
});
