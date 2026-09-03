import { test, expect } from "@playwright/test";

async function bypassAgeGate(page) {
  await page.addInitScript(() =>
    localStorage.setItem("age_verified", "e2e-skip-link"),
  );
}

const skipRoutes = [
  "/",
  "/prompts",
  "/tools",
  "/compare",
  "/community",
  "/docs/sillytavern",
];

/**
 * Helper: after activation, check that:
 * 1. activeElement is main#main-content
 * 2. URL has #main-content
 * 3. Next Tab does NOT land inside <nav>
 */
async function assertFocusTransferred(page: import("@playwright/test").Page) {
  // 1. activeElement is main#main-content
  const activeId = await page.evaluate(() => document.activeElement?.id);
  expect(activeId, "activeElement must be main#main-content").toBe(
    "main-content",
  );

  // 2. Focus persists after settling
  await page.waitForTimeout(300);
  const activeIdPersisted = await page.evaluate(
    () => document.activeElement?.id,
  );
  expect(activeIdPersisted, "focus must persist on main after 300ms").toBe(
    "main-content",
  );

  // 3. URL contains #main-content
  await expect(page).toHaveURL(/#main-content/);

  // 4. Next Tab must NOT land inside <nav> — must be in/after main content
  await page.keyboard.press("Tab");
  const isInNav = await page.evaluate(() => {
    const el = document.activeElement;
    const nav = document.querySelector("nav");
    if (!nav) return false;
    return nav.contains(el);
  });
  expect(
    isInNav,
    "next Tab after skip must not land in nav/header",
  ).toBe(false);
}

// ─────────────────────────────────────────────────────────────
// A. Keyboard Enter activation on all routes
// ─────────────────────────────────────────────────────────────
test.describe("skip link — keyboard Enter activation", () => {
  for (const route of skipRoutes) {
    test(`Enter on ${route}: focus moves to main and Tab continues into content`, async ({
      page,
    }) => {
      await bypassAgeGate(page);
      await page.goto(route);
      await page.waitForSelector("main#main-content", { state: "visible" });

      // First Tab must focus the skip link
      await page.keyboard.press("Tab");
      const skipLink = page.getByRole("link", { name: "Skip to main content" });
      await expect(skipLink).toBeFocused();
      await expect(skipLink).toBeVisible();

      // Enter must transfer focus to main
      await page.keyboard.press("Enter");
      await assertFocusTransferred(page);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// B. Pointer click activation
// ─────────────────────────────────────────────────────────────
test.describe("skip link — pointer click activation", () => {
  for (const route of ["/", "/compare"]) {
    test(`click on ${route}: focus moves to main`, async ({ page }) => {
      await bypassAgeGate(page);
      await page.goto(route);
      await page.waitForSelector("main#main-content", { state: "visible" });

      const skipLink = page.getByRole("link", { name: "Skip to main content" });
      await skipLink.focus();
      await skipLink.click();

      // Click must transfer focus to main
      const activeId = await page.evaluate(() => document.activeElement?.id);
      expect(activeId, "activeElement after click must be main#main-content").toBe(
        "main-content",
      );
      await expect(page).toHaveURL(/#main-content/);

      // Next Tab must continue in content
      await page.keyboard.press("Tab");
      const isInNav = await page.evaluate(() => {
        const el = document.activeElement;
        const nav = document.querySelector("nav");
        return nav?.contains(el) ?? false;
      });
      expect(isInNav, "next Tab after click must not land in nav").toBe(false);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// C. Space key must not activate or break state
// ─────────────────────────────────────────────────────────────
test.describe("skip link — Space key does not break navigation", () => {
  for (const route of ["/", "/compare"]) {
    test(`Space on ${route}: no activation, Enter still works`, async ({
      page,
    }) => {
      await bypassAgeGate(page);
      await page.goto(route);
      await page.keyboard.press("Tab");
      const skipLink = page.getByRole("link", { name: "Skip to main content" });
      await expect(skipLink).toBeFocused();

      // Space should NOT activate (native links only activate on Enter)
      await page.keyboard.press("Space");
      await expect(skipLink).toBeFocused();
      const hashAfterSpace = await page.evaluate(() => window.location.hash);
      expect(hashAfterSpace).not.toBe("#main-content");

      // Enter must still work after Space
      await page.keyboard.press("Enter");
      const activeId = await page.evaluate(() => document.activeElement?.id);
      expect(activeId, "Enter after Space must focus main").toBe("main-content");
    });
  }
});

// ─────────────────────────────────────────────────────────────
// D. First focusable element
// ─────────────────────────────────────────────────────────────
test.describe("skip link — first focusable element", () => {
  for (const route of skipRoutes) {
    test(`skip link is first Tab stop on ${route}`, async ({ page }) => {
      await bypassAgeGate(page);
      await page.goto(route);
      await page.keyboard.press("Tab");
      const skipLink = page.getByRole("link", { name: "Skip to main content" });
      await expect(skipLink).toBeFocused();
    });
  }
});

// ─────────────────────────────────────────────────────────────
// E. Not a persistent tab stop
// ─────────────────────────────────────────────────────────────
test.describe("skip link — not persistently visible", () => {
  test("skip link is not a persistent Tab stop on /", async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto("/");

    const skipLink = page.getByRole("link", { name: "Skip to main content" });

    // Focus skip link (first Tab)
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();

    // After more Tabs, focus should be past skip link
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(
      () => document.activeElement?.textContent?.trim(),
    );
    expect(focused).not.toBe("Skip to main content");

    // Skip link should not have a positive tabindex
    const isStop = await page.evaluate(() => {
      const link = document.querySelector('a[href="#main-content"]');
      return link?.getAttribute("tabindex");
    });
    expect(isStop === null || isStop === "-1").toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// F. Unique main#main-content per route
// ─────────────────────────────────────────────────────────────
test.describe("skip link — single main#main-content per route", () => {
  for (const route of skipRoutes) {
    test(`unique main#main-content on ${route}`, async ({ page }) => {
      await bypassAgeGate(page);
      await page.goto(route);
      const count = await page.locator("main#main-content").count();
      expect(count).toBe(1);

      // Confirm tabIndex={-1} is set
      const tabIndex = await page
        .locator("main#main-content")
        .getAttribute("tabindex");
      expect(tabIndex).toBe("-1");
    });
  }
});
