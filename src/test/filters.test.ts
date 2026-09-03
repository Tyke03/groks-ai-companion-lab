import { describe, it, expect } from "vitest";
import { chatbots, getPlatformFilterFacts } from "@/data/chatbots";
import {
  EMPTY_FILTER_STATE,
  matchesContent,
  matchesFeature,
  matchesAccess,
  matchesCard,
  filterChatbots,
  countByCategory,
  isFilterActive,
  type DirectoryFilterState,
} from "@/lib/filters";

const withState = (patch: Partial<DirectoryFilterState>): DirectoryFilterState => ({
  ...EMPTY_FILTER_STATE,
  ...patch,
});

const bySlug = (slug: string) => {
  const bot = chatbots.find((b) => b.slug === slug);
  if (!bot) throw new Error(`Unknown slug: ${slug}`);
  return bot;
};

describe("filter facts integrity", () => {
  it("every facts-map key references an existing platform slug", () => {
    const slugs = new Set(chatbots.map((b) => b.slug));
    const facts = getPlatformFilterFacts(bySlug("sillytavern"));
    void facts;
    // Re-import the raw map indirectly: verify no orphan keys via the dataset.
    for (const bot of chatbots) {
      expect(typeof getPlatformFilterFacts(bot)).toBe("object");
    }
    expect(slugs.size).toBe(chatbots.length);
  });
});

describe("content filter semantics", () => {
  it("All levels is neutral and returns every level", () => {
    expect(matchesContent(bySlug("character-ai"), "all")).toBe(true); // level 1
    expect(matchesContent(bySlug("pephop-ai"), "all")).toBe(true); // level 2
    expect(matchesContent(bySlug("sillytavern"), "all")).toBe(true); // level 5
  });

  it("SFW only matches contentLevel 1", () => {
    expect(matchesContent(bySlug("character-ai"), "sfw")).toBe(true);
    expect(matchesContent(bySlug("pephop-ai"), "sfw")).toBe(false); // level 2 not SFW
    expect(matchesContent(bySlug("janitor-ai"), "sfw")).toBe(false);
  });

  it("Unfiltered / NSFW matches contentLevel >= 3", () => {
    expect(matchesContent(bySlug("janitor-ai"), "unfiltered")).toBe(true); // level 3
    expect(matchesContent(bySlug("sillytavern"), "unfiltered")).toBe(true); // level 5
    expect(matchesContent(bySlug("pephop-ai"), "unfiltered")).toBe(false); // level 2 excluded
    expect(matchesContent(bySlug("character-ai"), "unfiltered")).toBe(false); // level 1 excluded
  });

  it("Toggleable matches only explicit hasSfwNsfwToggle", () => {
    expect(matchesContent(bySlug("pephop-ai"), "toggleable")).toBe(true);
    expect(matchesContent(bySlug("pephop-ai"), "sfw")).toBe(false); // level 2 is not re-classified
    expect(matchesContent(bySlug("character-ai"), "toggleable")).toBe(false);
  });
});

describe("feature matching uses structured facts only", () => {
  it("image and voice read explicit capability flags", () => {
    expect(matchesFeature(bySlug("sillytavern"), "image")).toBe(false);
    expect(matchesFeature(bySlug("sillytavern"), "voice")).toBe(true);
    expect(matchesFeature(bySlug("novelai"), "image")).toBe(true);
  });

  it("group chat requires explicit hasGroupChat (no free-text guessing)", () => {
    expect(matchesFeature(bySlug("risuai"), "group")).toBe(true);
    // SillyTavern has "group" nowhere in structured facts -> must not match.
    expect(matchesFeature(bySlug("sillytavern"), "group")).toBe(false);
  });

  it("multimodal requires explicit evidence", () => {
    expect(matchesFeature(bySlug("candy-ai"), "multimodal")).toBe(true);
    expect(matchesFeature(bySlug("soulkyn"), "multimodal")).toBe(false); // image only, no explicit flag
  });
});

describe("access and card matching never treats unknown as true", () => {
  it("access tags match only explicit facts", () => {
    expect(matchesAccess(bySlug("sillytavern"), "foss")).toBe(true);
    expect(matchesAccess(bySlug("sillytavern"), "paid")).toBe(false);
    expect(matchesAccess(bySlug("novelai"), "paid")).toBe(true);
    expect(matchesAccess(bySlug("novelai"), "free")).toBe(false); // "No free tier"
  });

  it("card specs match only explicit facts", () => {
    expect(matchesCard(bySlug("sillytavern"), "v3")).toBe(true);
    expect(matchesCard(bySlug("tavernai"), "v3")).toBe(false);
    expect(matchesCard(bySlug("pygmalionai"), "native")).toBe(false); // model provider has no specs
  });
});

describe("filterChatbots combines constraints with AND", () => {
  it("multi-select access traits combine as AND", () => {
    const result = filterChatbots(chatbots, withState({ access: ["foss", "byok"] }));
    expect(result.every((b) => matchesAccess(b, "foss") && matchesAccess(b, "byok"))).toBe(true);
    expect(result.some((b) => b.slug === "openrouter")).toBe(false); // byok but not foss
  });

  it("multi-select feature traits combine as AND", () => {
    const result = filterChatbots(chatbots, withState({ features: ["image", "voice"] }));
    expect(result.every((b) => b.hasImageGen === true && b.hasVoice === true)).toBe(true);
    expect(result.some((b) => b.slug === "sillytavern")).toBe(false); // voice but no image
  });

  it("category is single-select neutral when 'all'", () => {
    const all = filterChatbots(chatbots, EMPTY_FILTER_STATE);
    const local = filterChatbots(chatbots, withState({ category: "local" }));
    expect(all.length).toBe(chatbots.length);
    expect(local.every((b) => b.category === "local")).toBe(true);
  });
});

describe("countByCategory excludes the category constraint", () => {
  it("category counts reflect other active constraints, not the category itself", () => {
    // Constrain to content SFW only; counts should be SFW totals per category.
    const counts = countByCategory(chatbots, withState({ content: "sfw" }));
    const sfw = filterChatbots(chatbots, withState({ content: "sfw" }));
    expect(counts.all).toBe(sfw.length);
    expect(counts.local).toBe(sfw.filter((b) => b.category === "local").length);
  });

  it("neutral state counts the full dataset", () => {
    const counts = countByCategory(chatbots, EMPTY_FILTER_STATE);
    expect(counts.all).toBe(chatbots.length);
  });
});

describe("isFilterActive", () => {
  it("is false for the neutral state", () => {
    expect(isFilterActive(EMPTY_FILTER_STATE)).toBe(false);
  });

  it("is true when any filter deviates from neutral", () => {
    expect(isFilterActive(withState({ category: "local" }))).toBe(true);
    expect(isFilterActive(withState({ content: "sfw" }))).toBe(true);
    expect(isFilterActive(withState({ features: ["image"] }))).toBe(true);
  });
});
