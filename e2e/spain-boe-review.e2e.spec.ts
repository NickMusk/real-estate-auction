import { expect, test } from "@playwright/test";

test.describe("Feature: spain-boe-vertical-slice", () => {
  /**
   * GOAL: Verify the operator can trigger the first Spain BOE sample scan
   *       and review the normalized lots, source links, AI summary, and timer state.
   *
   * WHY: Playwright should protect the integrated flow we care about most:
   *      a working local app that turns a scan trigger into visible review data
   *      plus the hourly automation context the operator depends on.
   */
  test("should run the scan and show a top-10 shortlist plus all fetched lots", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Spain BOE Review" })).toBeVisible();
    await expect(page.getByText("No scan runs yet.")).toBeVisible();
    await expect(page.getByTestId("scheduler-status")).toContainText("Every 60 minutes");
    await expect(page.getByTestId("provider-status")).toContainText("Source");
    await expect(page.getByTestId("digest-preview")).toContainText("No digest has been generated yet.");

    await page.getByRole("button", { name: "Run Spain BOE scan" }).click();

    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText("2 lots synced")).toBeVisible();
    await expect(page.getByText("Top 10 current opportunities")).toBeVisible();
    await expect(page.getByText("All fetched lots")).toBeVisible();
    const normalizedLots = page.getByLabel("Normalized lots");
    await expect(normalizedLots.getByRole("heading", { name: "Valencia apartment" })).toBeVisible();
    await expect(normalizedLots.getByRole("heading", { name: "Malaga development land" })).toBeVisible();
    await expect(page.getByTestId("ai-best-deals")).toBeVisible();
    await expect(page.getByTestId("ai-best-deals")).toContainText("Valencia apartment");
    await expect(page.getByTestId("digest-preview")).toContainText("Valencia apartment");
    await expect(page.getByTestId("digest-preview")).toContainText("preview-local");
    await expect(page.getByRole("link", { name: "Open Valencia apartment source" })).toHaveAttribute(
      "href",
      "https://subastas.boe.es/ds.php?id=SUB-JA-2026-241891"
    );
  });
});
