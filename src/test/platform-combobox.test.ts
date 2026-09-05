import { describe, it, expect } from "vitest";
import { filterPlatformsByName } from "@/lib/platformCombobox";

const sample = [
  { name: "Character.AI", slug: "character-ai" },
  { name: "NovelAI", slug: "novelai" },
  { name: "SillyTavern", slug: "sillytavern" },
  { name: "Chub", slug: "chub" },
];

describe("filterPlatformsByName", () => {
  it("matches case-insensitive substring on name", () => {
    const hits = filterPlatformsByName(sample, "AI");
    expect(hits.map((h) => h.name).sort()).toEqual(["Character.AI", "NovelAI"]);
  });

  it("drops names that do not contain the query", () => {
    expect(filterPlatformsByName(sample, "AI").some((h) => h.name === "SillyTavern")).toBe(false);
  });

  it("returns all platforms when query is empty/whitespace", () => {
    expect(filterPlatformsByName(sample, "  ")).toHaveLength(sample.length);
    expect(filterPlatformsByName(sample, "")).toHaveLength(sample.length);
  });
});
