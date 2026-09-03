import { describe, it, expect } from "vitest";
import { normalizeForSearch, isOrderedSubsequence } from "@/lib/search";

describe("normalizeForSearch", () => {
  it("lowercases and strips punctuation and spacing", () => {
    expect(normalizeForSearch("Character.AI")).toBe("characterai");
    expect(normalizeForSearch("Tavern AI!")).toBe("tavernai");
    expect(normalizeForSearch("  CrushOn.AI  ")).toBe("crushonai");
  });

  it("keeps alphanumerics only", () => {
    expect(normalizeForSearch("V1/V2/V3 PNG + JSON")).toBe("v1v2v3pngjson");
    expect(normalizeForSearch("Mistral Le Chat")).toBe("mistrallechat");
  });
});

describe("isOrderedSubsequence", () => {
  it('retains TavernAI, RisuAI, and Agnaistic for query "ai"', () => {
    expect(isOrderedSubsequence("ai", "TavernAI")).toBe(true);
    expect(isOrderedSubsequence("ai", "RisuAI")).toBe(true);
    expect(isOrderedSubsequence("ai", "Agnaistic")).toBe(true);
  });

  it('excludes SillyTavern for query "ai"', () => {
    expect(isOrderedSubsequence("ai", "SillyTavern")).toBe(false);
  });

  it("matches characters that are not adjacent", () => {
    expect(isOrderedSubsequence("sly", "SillyTavern")).toBe(true);
    expect(isOrderedSubsequence("ta", "TavernAI")).toBe(true);
  });

  it("is case-insensitive and ignores punctuation/spacing", () => {
    expect(isOrderedSubsequence("CHARACTER", "Character.AI")).toBe(true);
    expect(isOrderedSubsequence("crushon", "CrushOn.AI")).toBe(true);
  });

  it("returns true for an empty query", () => {
    expect(isOrderedSubsequence("", "SillyTavern")).toBe(true);
  });

  it("returns false when a character is missing entirely", () => {
    expect(isOrderedSubsequence("xyz", "SillyTavern")).toBe(false);
  });

  it("returns false when characters appear out of order", () => {
    // "ai" matches TavernAI, but the reversed query "ia" must not.
    expect(isOrderedSubsequence("ia", "TavernAI")).toBe(false);
  });
});
