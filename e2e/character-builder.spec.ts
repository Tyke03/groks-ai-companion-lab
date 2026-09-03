import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const V1_FIXTURE = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "fixtures/v1-card.json"), "utf-8"),
);
const V2_FIXTURE = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "fixtures/v2-card.json"), "utf-8"),
);
const ONE_PX_PNG = path.resolve(__dirname, "fixtures/1x1.png");

async function openCharacterBuilder(page) {
  await page.goto("/tools");
  // Click through age verification if present
  const ageButton = page.getByRole("button", { name: /18 or older/i });
  if (await ageButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await ageButton.click();
  }
  await page.getByRole("tab", { name: /Character Builder/ }).click();
  await expect(
    page.getByRole("heading", { name: "Character Card Builder" }),
  ).toBeVisible();
}

async function openTextImport(page) {
  await page.getByRole("button", { name: "Import (Text)" }).click();
  await expect(page.getByPlaceholder("Paste character data here...")).toBeVisible();
}

/* ── 1. Loading ── */

test.describe("Character Builder loading", () => {
  test("loads builder with core form and import controls", async ({ page }) => {
    await openCharacterBuilder(page);
    await expect(page.getByPlaceholder("Luna Starweaver")).toBeVisible();
    await expect(page.getByPlaceholder(/mysterious sorceress/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Confident, seductive/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Import (Text)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import (File/PNG)" })).toBeVisible();
    await expect(page.getByText("V3 (draft)")).toBeVisible();
    await expect(page.getByText("chara_card_v2 — stable")).toBeVisible();
  });
});

/* ── 2. Invalid / unrecognized input ── */

test.describe("Invalid and unrecognized text import", () => {
  test.beforeEach(async ({ page }) => {
    await openCharacterBuilder(page);
    await openTextImport(page);
  });

  test("rejects plain text", async ({ page }) => {
    const ta = page.getByPlaceholder("Paste character data here...");
    await ta.fill("not valid json");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Not valid JSON").first()).toBeVisible();
    await expect(ta).toBeVisible();
    await expect(ta).toHaveValue("not valid json");
    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("");
  });

  test('rejects {foo:bar} JSON', async ({ page }) => {
    const ta = page.getByPlaceholder("Paste character data here...");
    await ta.fill('{"foo":"bar"}');
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Not a recognizable character card").first()).toBeVisible();
    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("");
  });

  test("rejects partial {name only}", async ({ page }) => {
    const ta = page.getByPlaceholder("Paste character data here...");
    await ta.fill('{"name":"only a name"}');
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Not a recognizable character card").first()).toBeVisible();
    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("");
  });

  test("rejects non-object JSON", async ({ page }) => {
    const ta = page.getByPlaceholder("Paste character data here...");
    await ta.fill('["array"]');
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Not a recognizable character card").first()).toBeVisible();
    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("");
  });
});

/* ── 3. V1 import ── */

test.describe("V1 text import", () => {
  test("imports V1 fixture and shows upgrade notice", async ({ page }) => {
    await openCharacterBuilder(page);
    await openTextImport(page);

    const ta = page.getByPlaceholder("Paste character data here...");
    await ta.fill(JSON.stringify(V1_FIXTURE));
    await page.getByRole("button", { name: "Import", exact: true }).click();

    await expect(page.getByText("V1 card loaded").first()).toBeVisible();
    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("QA V1 Card");
    await expect(page.getByPlaceholder(/mysterious sorceress/i)).toHaveValue(
      "Synthetic QA fixture for E2E tests.",
    );
    await expect(page.getByText(/export as V2.*upgraded/i).first()).toBeVisible();
  });
});

/* ── 4. V2 import and preservation notices ── */

test.describe("V2 text import and preservation notices", () => {
  test("imports V2 fixture with preservation notices", async ({ page }) => {
    await openCharacterBuilder(page);
    await openTextImport(page);

    const ta = page.getByPlaceholder("Paste character data here...");
    await ta.fill(JSON.stringify(V2_FIXTURE));
    await page.getByRole("button", { name: "Import", exact: true }).click();

    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("QA V2 Card");
    await expect(page.getByText(/Imported as V2/i)).toBeVisible();
    await expect(page.getByText(/character.book.*preserved/i)).toBeVisible();
    await expect(page.getByText(/unsupported field/i)).toBeVisible();
  });
});

/* ── 5. V3 draft UI ── */

test.describe("V3 draft UI", () => {
  test("shows draft labels and asset editor", async ({ page }) => {
    await openCharacterBuilder(page);

    await expect(page.getByText("V3 (draft)")).toBeVisible();

    // Switch to V3
    await page.locator('button[role="switch"]').click();
    await page.waitForTimeout(300);

    await expect(page.getByText("chara_card_v3 (draft spec)")).toBeVisible();
    await expect(page.getByText("Assets (V3 draft)")).toBeVisible();

    // Add an asset
    await page.getByRole("button", { name: "Add asset declaration" }).click();

    await expect(page.getByLabel("Asset 1 type")).toBeVisible();
    await expect(page.getByLabel("Asset 1 name")).toBeVisible();
    await expect(page.getByLabel("Asset 1 URI")).toBeVisible();
    await expect(page.getByLabel("Asset 1 extension")).toBeVisible();

    // Export labels mention draft
    await expect(
      page.getByRole("button", { name: /Copy V3.*draft.*JSON/ }),
    ).toBeVisible();
  });
});

/* ── 6. V2 PNG export / download + re-import ── */

test.describe("V2 PNG export and re-import", () => {
  test("exports V2 PNG, downloads, and re-imports the card", async ({ page }) => {
    await openCharacterBuilder(page);

    // Import the V2 fixture via text
    await openTextImport(page);
    const ta = page.getByPlaceholder("Paste character data here...");
    await ta.fill(JSON.stringify(V2_FIXTURE));
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("QA V2 Card");

    // Upload a tiny PNG as the portrait
    await page.locator('input[type="file"][accept="image/png"]').setInputFiles(ONE_PX_PNG);
    // The UI shows "0 KB" for our tiny 67-byte PNG
    await expect(page.getByText(/0\s*KB/)).toBeVisible({ timeout: 3000 });

    // Start waiting for the download *before* clicking Export as PNG
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10000 }),
      page.getByRole("button", { name: "Export as PNG" }).click(),
    ]);

    // Verify download properties
    expect(download.suggestedFilename()).toMatch(/_v2\.png$/);
    // Should not contain path separators or control characters
    const name = download.suggestedFilename();
    for (const ch of name) {
      const cc = ch.charCodeAt(0);
      expect(cc).toBeGreaterThan(0x1f);
      expect(["<", ">", ":", '"', "/", "\\", "|", "?", "*"].includes(ch)).toBe(false);
    }

    const downloadBuf = await download.createReadStream();
    if (!downloadBuf) throw new Error("Download stream returned null");
    const chunks: Buffer[] = [];
    for await (const chunk of downloadBuf) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fileBytes = Buffer.concat(chunks);
    expect(fileBytes.length).toBeGreaterThan(50);

    // Must start with PNG signature
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(fileBytes.subarray(0, 8)).toEqual(sig);

    // Now re-import the downloaded PNG via the file-import input
    const downloadPath = path.resolve(__dirname, "..", "test-results", "reimport-test.png");
    fs.writeFileSync(downloadPath, fileBytes);

    await page
      .locator('input[type="file"][accept=".json,.png,.txt,.yaml,.yml"]')
      .setInputFiles(downloadPath);

    // Should recognise it as an embedded card
    await expect(page.getByText("Imported as V2")).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("QA V2 Card");
    await expect(page.getByText(/character.book.*preserved/i)).toBeVisible();
    await expect(page.getByText(/unsupported field/i)).toBeVisible();

    // Clean up
    try { fs.unlinkSync(downloadPath); } catch { /* ok */ }
  });

  test("rejects a PNG with no embedded card", async ({ page }) => {
    await openCharacterBuilder(page);

    // Import the bare 1x1 PNG as a file (no card embedded)
    await page
      .locator('input[type="file"][accept=".json,.png,.txt,.yaml,.yml"]')
      .setInputFiles(ONE_PX_PNG);

    await expect(page.getByText("No card found").first()).toBeVisible();

    // The existing card (blank) should not be overwritten
    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("");
  });
});

/* ── 7. Token estimate and chat preview ── */

test.describe("Token estimate and chat preview", () => {
  test("shows the approximate-token label and explanation", async ({ page }) => {
    await openCharacterBuilder(page);
    await expect(page.getByText("Approx. tokens")).toBeVisible();
    await expect(
      page.getByText(/Local estimate based on characters/i),
    ).toBeVisible();
  });

  test("editing description changes the visible estimate", async ({ page }) => {
    await openCharacterBuilder(page);
    const estimate = page.locator("output[aria-labelledby=\"card-token-estimate-label\"]");
    const before = Number((await estimate.textContent()) || "0");
    await page.getByPlaceholder(/mysterious sorceress/i).fill("x".repeat(400));
    await expect(estimate).not.toHaveText(String(before));
  });

  test("chat preview updates character name and first-message content", async ({ page }) => {
    await openCharacterBuilder(page);
    await page.getByRole("button", { name: "Chat bubble" }).click();
    await page.getByPlaceholder("Luna Starweaver").fill("QA Preview Card");
    await page.getByPlaceholder(/Well, well/).fill("*waves* Hello from the preview.");
    await expect(page.getByText("QA Preview Card").first()).toBeVisible();
    const chatBubble = page.locator("div.whitespace-pre-wrap");
    await expect(chatBubble.getByText("Hello from the preview.", { exact: true })).toBeVisible();
    await expect(page.getByText("Hi — tell me about yourself.")).toBeVisible();
  });

  test("empty card shows neutral preview without fabricated content", async ({ page }) => {
    await openCharacterBuilder(page);
    await page.getByRole("button", { name: "Chat bubble" }).click();
    await expect(page.getByText("Character preview")).toBeVisible();
    await expect(
      page.getByText("Add a first message to preview the opening chat bubble."),
    ).toBeVisible();
    await expect(page.getByText("Unknown", { exact: true })).toHaveCount(0);
  });
});

/* ── 8. Mobile viewport ── */

test.describe("Mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("import dialog and notices have no horizontal overflow", async ({ page }) => {
    await openCharacterBuilder(page);
    await openTextImport(page);

    const ta = page.getByPlaceholder("Paste character data here...");
    await expect(ta).toBeVisible();

    // Import V2 to trigger preservation notices
    await ta.fill(JSON.stringify(V2_FIXTURE));
    await page.getByRole("button", { name: "Import", exact: true }).click();

    await expect(page.getByText(/character.book.*preserved/i)).toBeVisible();

    // Token summary and chat preview remain readable with no horizontal overflow
    await expect(page.getByText("Approx. tokens")).toBeVisible();
    await page.getByRole("button", { name: "Chat bubble" }).click();
    await expect(page.getByText("Hi — tell me about yourself.")).toBeVisible();

    // Check no element overflows horizontally
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 2);
  });
});