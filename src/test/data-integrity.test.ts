import { describe, it, expect } from "vitest";
import { chatbots, platformFilterFacts } from "@/data/chatbots";
import { platformDocs } from "@/data/documentation";

describe("directory data contracts", () => {
  it("has unique slugs matching the platform count", () => {
    const slugs = chatbots.map((bot) => bot.slug);
    expect(new Set(slugs).size).toBe(chatbots.length);
    expect(chatbots.length).toBeGreaterThan(0);
  });

  it("every filter-facts key is a real platform slug", () => {
    const slugs = new Set(chatbots.map((bot) => bot.slug));
    for (const key of Object.keys(platformFilterFacts)) {
      expect(slugs.has(key)).toBe(true);
    }
  });

  it("docsAvailable is true only when a guide exists", () => {
    for (const bot of chatbots) {
      if (bot.docsAvailable) {
        expect(platformDocs[bot.slug], `${bot.slug} marked docsAvailable without a guide`).toBeTruthy();
      }
    }
  });

  it("every platformDocs key matches a directory slug", () => {
    const slugs = new Set(chatbots.map((bot) => bot.slug));
    for (const slug of Object.keys(platformDocs)) {
      expect(slugs.has(slug)).toBe(true);
    }
  });
});
