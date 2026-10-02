import { describe, it, expect } from "vitest";
import {
  parsePopulateCardJson,
  unwrapCardFields,
  mapCardFieldsToVariables,
  formatCardContextLabeled,
} from "@/lib/workbenchCardContext";
import { emptyCardData } from "@/lib/cardTypes";
import { detectCardFormat, importCard } from "@/lib/cardCodec";
import {
  cachePortrait,
  getCachedPortrait,
  __clearPortraitMemoryForTests,
  __portraitMemorySizeForTests,
} from "@/lib/portraitStorage";

describe("workbench card populate parsing", () => {
  it("accepts chara_card_v2 envelopes", () => {
    const fields = parsePopulateCardJson(
      JSON.stringify({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: { name: "Luna", personality: "witty", description: "sorceress" },
      }),
    );
    expect(fields?.name).toBe("Luna");
    expect(fields?.personality).toBe("witty");
  });

  it("accepts chub_2 envelopes as V2-compatible", () => {
    const fields = unwrapCardFields({
      spec: "chub_2",
      data: { name: "Riley", scenario: "office", first_mes: "Hi" },
    });
    expect(fields?.name).toBe("Riley");
    expect(fields?.scenario).toBe("office");
  });

  it("accepts V3 envelopes", () => {
    const fields = unwrapCardFields({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Nova", nickname: "N", description: "pilot" },
    });
    expect(fields?.name).toBe("Nova");
    expect(fields?.nickname).toBe("N");
  });

  it("accepts near-valid flat cards without envelope", () => {
    const fields = parsePopulateCardJson(
      JSON.stringify({ name: "Flat", description: "ok", personality: "calm" }),
    );
    expect(fields?.name).toBe("Flat");
  });

  it("maps fields into prompt variables", () => {
    const mapped = mapCardFieldsToVariables(
      { name: "Maya", personality: "bold", scenario: "cafe", first_mes: "Hey" },
      ["character_name", "personality_traits", "setting", "greeting_dialogue"],
    );
    expect(mapped.character_name).toBe("Maya");
    expect(mapped.personality_traits).toBe("bold");
    expect(mapped.setting).toBe("cafe");
    expect(mapped.greeting_dialogue).toBe("Hey");
  });

  it("formats labeled context for raw inject", () => {
    const card = emptyCardData();
    card.name = "Echo";
    card.personality = "curious";
    const text = formatCardContextLabeled(card, "Echo");
    expect(text).toContain("# Workbench card: Echo");
    expect(text).toContain("## personality");
    expect(text).toContain("curious");
  });

  it("formats full labeled card context without compact truncation", () => {
    const card = emptyCardData();
    card.name = "Nova";
    card.description = "D".repeat(2000);
    card.personality = "bold";
    card.scenario = "station";
    card.first_mes = "Hello";
    card.tags = "sci-fi, pilot";
    card.mes_example = "<START>\n{{user}}: Hi\n{{char}}: Hello";
    card.creator_notes = "author notes stay in full context";
    const text = formatCardContextLabeled(card, "Nova");
    expect(text).toContain("# Workbench card: Nova");
    expect(text).toContain("## description");
    expect(text).toContain("D".repeat(2000));
    expect(text).toContain("## mes_example");
    expect(text).toContain("{{char}}: Hello");
    expect(text).toContain("## creator_notes");
    expect(text).toContain("author notes stay in full context");
    expect(text).not.toContain("…");
  });
});

describe("cardCodec chub_2 / alias detect", () => {
  it("detects chub_2 as v2", () => {
    expect(detectCardFormat({ spec: "chub_2", data: { name: "A" } })).toBe("v2");
  });

  it("imports chub_2 without throwing", () => {
    const result = importCard({
      spec: "chub_2",
      spec_version: "2.0",
      data: {
        name: "Chubby",
        description: "from hub",
        personality: "warm",
        scenario: "bar",
        first_mes: "hello",
        mes_example: "",
      },
    });
    expect(result.format).toBe("v2");
    expect(result.data.name).toBe("Chubby");
  });
});

describe("portrait keep (session cache)", () => {
  it("keeps current PNG per card id in memory cache", () => {
    __clearPortraitMemoryForTests();
    const file = new File([new Uint8Array([137, 80, 78, 71])], "keep.png", { type: "image/png" });
    cachePortrait("card-a", file);
    expect(getCachedPortrait("card-a")?.name).toBe("keep.png");
    expect(__portraitMemorySizeForTests()).toBe(1);
    // Switching away does not wipe the cached portrait for card-a
    cachePortrait("card-b", new File([new Uint8Array([1])], "other.png", { type: "image/png" }));
    expect(getCachedPortrait("card-a")?.name).toBe("keep.png");
    __clearPortraitMemoryForTests();
  });
});
