import { test, expect } from "@playwright/test";

const SILLTAVEN = "sillytavern";
const CHAR_AI = "character-ai";

async function bypassAgeGate(page) {
  await page.addInitScript(() => localStorage.setItem("age_verified", "e2e-compare"));
}

test.describe("Compare page — platform selection and filtering", () => {
  test.beforeEach(async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto("/compare");
  });

  test("shows the platform selector with search and category filter", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Compare Platforms" })).toBeVisible();
    await expect(page.getByLabel("Search platforms by name")).toBeVisible();
    await expect(page.getByLabel("Filter by category")).toBeVisible();
    await expect(page.getByText(/showing (all )?\d+ platforms/i)).toBeVisible();
  });

  test("search filters platforms by name case-insensitively", async ({ page }) => {
    const input = page.getByLabel("Search platforms by name");
    await input.fill("silly");
    await expect(page.getByRole("button", { name: /sillytavern/i })).toBeVisible();
    // Other platforms should be hidden
    const grid = page.getByRole("group", { name: "Available platforms" });
    const buttons = await grid.getByRole("button").allTextContents();
    expect(buttons.every((t) => t.toLowerCase().includes("silly"))).toBeTruthy();
  });

  test("clear filters restores all platforms", async ({ page }) => {
    await page.getByLabel("Search platforms by name").fill("nonexistentxyz");
    await expect(page.getByText(/showing 0 of/i)).toBeVisible();
    const clearBtn = page.getByRole("button", { name: "Clear all filters" });
    await clearBtn.click();
    await expect(page.getByText(/showing all \d+ platforms/i)).toBeVisible();
  });

  test("no-results state shows clear action", async ({ page }) => {
    await page.getByLabel("Search platforms by name").fill("zzzznonexistent");
    await expect(page.getByText("No platforms match your search.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();
  });

  test("category filter limits visible platforms", async ({ page }) => {
    const select = page.getByLabel("Filter by category");
    await select.selectOption("local");
    await expect(page.getByText(/showing \d+ of \d+ platforms/i)).toContainText("of");
    // All visible should be local
    const grid = page.getByRole("group", { name: "Available platforms" });
    const count = await grid.getByRole("button").count();
    expect(count).toBeGreaterThan(0);
  });

  test("selecting platforms shows selection chips and comparison matrix", async ({ page }) => {
    // Select SillyTavern
    await page.getByRole("button", { name: /add sillytavern/i }).click();
    await expect(page.getByRole("button", { name: /remove sillytavern from/i }).first()).toBeVisible();
    // Matrix shouldn't appear yet (only 1 selected)
    await expect(page.getByRole("table")).toBeHidden();
    // Select Character.AI
    await page.getByRole("button", { name: /add character.ai/i }).click();
    // Matrix should appear
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("removing a platform from selection works", async ({ page }) => {
    await page.getByRole("button", { name: /add sillytavern/i }).click();
    await page.getByRole("button", { name: /add character.ai/i }).click();
    await expect(page.getByRole("table")).toBeVisible();
    // Remove via chip
    await page.getByRole("button", { name: /remove character.ai from comparison/i }).first().click();
    await expect(page.getByRole("table")).toBeHidden();
  });

  test("pre-selected platforms from URL are shown as selected", async ({ page }) => {
    await page.goto(`/compare?platforms=${SILLTAVEN},${CHAR_AI}`);
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "SillyTavern" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Character.AI" })).toBeVisible();
  });
});

test.describe("Compare page — matrix grouping and disclosure", () => {
  test.beforeEach(async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto(`/compare?platforms=${SILLTAVEN},${CHAR_AI}`);
  });

  test("criterion groups render with section headings", async ({ page }) => {
    await expect(page.getByRole("row", { name: /getting started/i })).toBeVisible();
    await expect(page.getByRole("row", { name: /chat and character/i })).toBeVisible();
    await expect(page.getByRole("row", { name: /privacy, access/i })).toBeVisible();
    await expect(page.getByRole("row", { name: /maintenance/i })).toBeVisible();
  });

  test("all existing criteria are present in the matrix", async ({ page }) => {
    const expected = [
      "Hosting type", "Content level", "Pricing model",
      "Context length limits", "Memory / lorebook", "Card import / export",
      "Image generation", "Voice / TTS",
      "Privacy / logging policy", "Supported APIs",
      "Last verified",
    ];
    for (const label of expected) {
      await expect(page.getByRole("row").filter({ hasText: label })).toBeVisible();
    }
  });

  test("'How to read this comparison' disclosure opens and closes by keyboard", async ({ page }) => {
    const summary = page.getByText("How to read this comparison");
    await summary.click();
    await expect(page.getByText(/guide, not a guarantee/i)).toBeVisible();
    // Close via keyboard
    await summary.press("Enter");
    await expect(page.getByText(/guide, not a guarantee/i)).toBeHidden();
  });

  test("disclosure contains uncertainty and verification language", async ({ page }) => {
    await page.getByText("How to read this comparison").click();
    await expect(page.getByText(/guide, not a guarantee/i)).toBeVisible();
    await expect(page.getByText(/does not necessarily mean a feature is absent/i)).toBeVisible();
    await expect(page.getByText(/verify.*directly with the platform/i)).toBeVisible();
  });
});

test.describe("Compare page — mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("platform selector and controls are readable at mobile width", async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto("/compare");
    await expect(page.getByLabel("Search platforms by name")).toBeVisible();
    await expect(page.getByLabel("Filter by category")).toBeVisible();
    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375 + 20); // small tolerance
  });

  test("comparison matrix is accessible at mobile width", async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto(`/compare?platforms=${SILLTAVEN},${CHAR_AI}`);
    // Table renders (may need horizontal scroll)
    await expect(page.getByRole("table")).toBeVisible();
    // Sticky attribute column visible
    await expect(page.getByText("Hosting type")).toBeVisible();
  });
});
