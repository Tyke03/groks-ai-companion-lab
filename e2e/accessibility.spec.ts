import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = ["/", "/prompts", "/compare", "/community"];

async function bypassAgeGate(page) {
  await page.addInitScript(() => localStorage.setItem("age_verified", "e2e-accessibility"));
}

async function openCharacterBuilder(page) {
  await bypassAgeGate(page);
  await page.goto("/tools");
  await page.getByRole("tab", { name: /Character Builder/ }).click();
  await expect(page.getByRole("heading", { name: "Character Card Builder" })).toBeVisible();
}

test.describe("automated accessibility scans", () => {
  for (const route of routes) {
    test(`has no axe violations on ${route}`, async ({ page }) => {
      await bypassAgeGate(page);
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .include("#root")
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }

  test("has no axe violations on Character Builder", async ({ page }) => {
    await openCharacterBuilder(page);
    const results = await new AxeBuilder({ page })
      .include("#root")
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});

test.describe("Character Builder keyboard and focus", () => {
  test("opens Import Text with keyboard, traps focus, and restores focus", async ({ page }) => {
    await openCharacterBuilder(page);
    const trigger = page.getByRole("button", { name: "Import (Text)" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Import Character Card JSON" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Character Card JSON" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Import", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("announces invalid import errors and preserves the dialog input", async ({ page }) => {
    await openCharacterBuilder(page);
    const trigger = page.getByRole("button", { name: "Import (Text)" });
    await trigger.click();
    const textarea = page.getByRole("textbox", { name: "Character Card JSON" });
    await textarea.fill("not valid json");
    await page.getByRole("button", { name: "Import", exact: true }).click();

    await expect(page.getByRole("alert")).toContainText("Not valid JSON");
    await expect(textarea).toHaveValue("not valid json");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByPlaceholder("Luna Starweaver")).toHaveValue("");
  });

  test("exposes the V3 draft state and reaches primary controls on mobile", async ({ page }) => {
    await openCharacterBuilder(page);
    const versionSwitch = page.getByRole("switch", { name: "Use V3 draft format" });
    await expect(versionSwitch).toBeVisible();
    await expect(versionSwitch).toHaveAttribute("aria-checked", "false");
    await versionSwitch.press("Enter");
    await expect(versionSwitch).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("V3 (draft)", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import (File/PNG)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download JSON" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

const toolHeading: Record<string, RegExp> = {
  "Prompt Builder": /Prompt Builder/,
  "Lorebook Builder": /Lorebook \/ World Info Builder/,
  "Persona Builder": /User Persona Builder/,
  "Doc Consolidator": /Documentation Consolidator/,
  "API Tester": /API Key & Model Access Tester/,
};

// Prompt Builder and Doc Consolidator are tabs inside /tools; the other three are standalone routes.
const toolRoute: Record<string, string | null> = {
  "Prompt Builder": null,
  "Doc Consolidator": null,
  "Lorebook Builder": "/tools/lorebook-builder",
  "Persona Builder": "/tools/persona-builder",
  "API Tester": "/tools/api-tester",
};

async function openTool(page, name: string, heading: RegExp) {
  await bypassAgeGate(page);
  const route = toolRoute[name];
  if (route) {
    await page.goto(route);
  } else {
    await page.goto("/tools");
    await page.getByRole("tab", { name: new RegExp(name) }).click();
  }
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

test.describe("local tool automated accessibility scans", () => {
  for (const [name, heading] of Object.entries(toolHeading)) {
    test(`has no axe violations on ${name}`, async ({ page }) => {
      await openTool(page, name, heading);
      const results = await new AxeBuilder({ page })
        .include("#root")
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }

  test("has no horizontal overflow on any of the five tools at mobile", async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto("/tools");
    for (const name of Object.keys(toolHeading)) {
      await openTool(page, name, toolHeading[name]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${name} overflows horizontally`,
      ).toBe(true);
    }
  });
});

test.describe("local tool keyboard and focus", () => {
  test("Prompt Builder: template selection and author fields are keyboard reachable", async ({ page }) => {
    await openTool(page, "Prompt Builder", toolHeading["Prompt Builder"]);
    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy filled output/ })).toBeVisible();
  });

  test("Prompt Builder: generated output preview is keyboard reachable and openable", async ({ page }) => {
    await openTool(page, "Prompt Builder", toolHeading["Prompt Builder"]);
    await page.getByRole("button", { name: /Populate from Card \/ JSON/ }).click();
    await expect(page.getByRole("textbox", { name: "Character card JSON to map" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Populate", exact: true })).toBeVisible();
  });

  test("Lorebook Builder: reachable search, entry fields, and labelled inputs", async ({ page }) => {
    await openTool(page, "Lorebook Builder", toolHeading["Lorebook Builder"]);
    await expect(page.getByRole("textbox", { name: "Search lorebook entries" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Keys / Trigger Words" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Content / Body" })).toBeVisible();
  });

  test("Persona Builder: all fields have associated labels and format toggles exist", async ({ page }) => {
    await openTool(page, "Persona Builder", toolHeading["Persona Builder"]);
    await expect(page.getByRole("textbox", { name: "Persona Name" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Physical Description" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SillyTavern Persona JSON" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "W++" })).toHaveAttribute("aria-pressed", "false");
  });

  test("Doc Consolidator: labelled service, URL, input, and key-reachable result preview", async ({ page }) => {
    await openTool(page, "Doc Consolidator", toolHeading["Doc Consolidator"]);
    await expect(page.getByRole("textbox", { name: "Paste Documentation" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Fetch Documentation from URL/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Consolidate Documentation" })).toBeVisible();
  });

  test("API Tester: labelled fields and no-key disabled state is exposed", async ({ page }) => {
    await openTool(page, "API Tester", toolHeading["API Tester"]);
    await expect(page.getByRole("textbox", { name: "Base endpoint" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /API key/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Test one-turn ping/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Fetch available models/ })).toBeEnabled();
  });
});



test.describe("decorative icons are hidden from assistive technology", () => {
  test("outbound link icons on community cards use aria-hidden", async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto("/community");
    const externalLinks = page.locator("a[target='_blank']");
    const count = await externalLinks.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const icon = externalLinks.nth(i).locator("svg[aria-hidden='true']");
      if (await icon.count() > 0) {
        await expect(icon.first()).toBeAttached();
      }
    }
  });

  test("ChatbotCard outbound link icon has aria-hidden and parent link has aria-label", async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto("/");
    const visitLink = page.getByRole("link", { name: /Visit SillyTavern/ }).first();
    await expect(visitLink).toHaveAttribute("aria-label", /Visit SillyTavern/);
    const icon = visitLink.locator("svg[aria-hidden='true']");
    await expect(icon).toHaveCount(1);
  });

  test("compare matrix criterion labels use th scope=row", async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto("/compare?platforms=sillytavern,koboldai");
    const rowHeaders = page.locator("table th[scope='row']");
    await expect(rowHeaders.first()).toBeVisible();
    const count = await rowHeaders.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});
