import { test, expect } from "@playwright/test";

/**
 * Batch 2D: evidence metadata display E2E tests.
 * Compare-page regression is already covered by e2e/compare.spec.ts.
 */

async function dismissAgeGate(page: import("@playwright/test").Page) {
  try {
    const btn = page.getByRole("button", { name: /enter|continue|yes|confirm/i }).first();
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(500);
    }
  } catch {
    // no gate present
  }
}

test.describe("Evidence metadata display", () => {
  test("platform without evidence metadata shows no Record information heading", async ({ page }) => {
    await page.goto("/docs/sillytavern");
    await dismissAgeGate(page);
    const heading = page.getByRole("heading", { name: "Record information" });
    await expect(heading).not.toBeVisible();
  });

  test("Quick Facts section renders but no metadata block when evidenceMetadata is absent", async ({ page }) => {
    await page.goto("/docs/tavernai");
    await dismissAgeGate(page);
    await expect(page.getByRole("heading", { name: "Quick Facts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Record information" })).not.toBeVisible();
  });

  test("PlatformDocs page loads and is usable", async ({ page }) => {
    await page.goto("/docs/sillytavern");
    await dismissAgeGate(page);
    await expect(page.getByRole("heading", { name: "SillyTavern" })).toBeVisible();
    await expect(page.getByRole("link", { name: /visit/i })).toBeVisible();
  });
});
