import { describe, it, expect } from "vitest";
import {
  estimateCardTokens,
  characterBookChars,
  CHARS_PER_TOKEN,
} from "@/lib/cardTokens";
import {
  emptyCardData,
  emptyPreserved,
  type CardData,
  type PreservedData,
} from "@/lib/cardTypes";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return { ...emptyCardData(), ...overrides };
}

function makePreserved(overrides: Partial<PreservedData> = {}): PreservedData {
  return { ...emptyPreserved(), ...overrides };
}

describe("estimateCardTokens", () => {
  it("returns zero for an empty card", () => {
    const estimate = estimateCardTokens(makeCard(), makePreserved());
    expect(estimate.total).toBe(0);
    expect(estimate.totalChars).toBe(0);
    expect(estimate.fields).toEqual([]);
  });

  it("counts each relevant text field as ceil(chars / 4)", () => {
    const card = makeCard({
      name: "abcd", // 4 chars -> 1 token
      description: "x".repeat(9), // 9 chars -> ceil(9/4) = 3
      personality: "", // empty -> no contribution
    });
    const estimate = estimateCardTokens(card, makePreserved());
    // total chars = 4 + 9 = 13; ceil(13/4) = 4
    expect(estimate.totalChars).toBe(13);
    expect(estimate.total).toBe(Math.ceil(13 / CHARS_PER_TOKEN));
    expect(estimate.fields.map((f) => f.key)).toEqual(["name", "description"]);
  });

  it("counts list fields (alternate greetings) and populated optional fields", () => {
    const greetings = ["hello", "hi there"];
    const systemPrompt = "You are a helpful assistant.";
    const card = makeCard({
      alternate_greetings: greetings,
      system_prompt: systemPrompt,
      post_history_instructions: "", // empty -> excluded
    });
    const estimate = estimateCardTokens(card, makePreserved());
    const keys = estimate.fields.map((f) => f.key);
    expect(keys).toContain("alternate_greetings");
    expect(keys).toContain("system_prompt");
    expect(keys).not.toContain("post_history_instructions");
    const expectedChars =
      greetings.reduce((sum, g) => sum + g.length, 0) + systemPrompt.length;
    expect(estimate.totalChars).toBe(expectedChars);
  });

  it("handles unicode and newlines without crashing", () => {
    const card = makeCard({
      name: "héllo wörld",
      description: "line one\nline two\n日本語テキスト 🔥",
    });
    const estimate = estimateCardTokens(card, makePreserved());
    expect(estimate.total).toBeGreaterThan(0);
    expect(estimate.totalChars).toBe(
      "héllo wörld".length + "line one\nline two\n日本語テキスト 🔥".length,
    );
  });

  it("excludes opaque unknown fields, extensions, and preserved assets", () => {
    const card = makeCard({ name: "test" });
    const preserved = makePreserved({
      extensions: { huge: "x".repeat(5000) },
      unknownDataFields: { opaque: "y".repeat(5000) },
      preservedAssets: [{ anything: "z".repeat(5000) }],
    });
    const estimate = estimateCardTokens(card, preserved);
    expect(estimate.totalChars).toBe(4); // only name
    expect(estimate.excluded.length).toBeGreaterThan(0);
  });

  it("includes character-book text only when available locally", () => {
    const without = estimateCardTokens(
      makeCard({ name: "test" }),
      makePreserved(), // character_book undefined
    );
    expect(without.fields.some((f) => f.key === "character_book")).toBe(false);

    const withBook = estimateCardTokens(
      makeCard({ name: "test" }),
      makePreserved({
        character_book: {
          name: "Book",
          description: "The world guide",
          entries: [
            { content: "Entry body text", keys: "keyword" },
            { content: "Second entry" },
          ],
        },
      }),
    );
    const bookField = withBook.fields.find((f) => f.key === "character_book");
    expect(bookField).toBeDefined();
    // name + description + contents + keys
    expect(withBook.totalChars).toBe(4 + "Book".length + "The world guide".length + "Entry body text".length + "keyword".length + "Second entry".length);
  });

  it("does not count character book when its payload has no extractable text", () => {
    const estimate = estimateCardTokens(
      makeCard({ name: "test" }),
      makePreserved({ character_book: { entries: [{}] } }),
    );
    expect(estimate.fields.some((f) => f.key === "character_book")).toBe(false);
    expect(estimate.totalChars).toBe(4);
  });

  it("is deterministic and does not mutate inputs", () => {
    const card = makeCard({ name: "test", description: "Some description." });
    const preserved = makePreserved({
      character_book: { name: "Book", entries: [{ content: "hi" }] },
    });
    const snapshotCard = JSON.stringify(card);
    const snapshotPreserved = JSON.stringify(preserved);

    const a = estimateCardTokens(card, preserved);
    const b = estimateCardTokens(card, preserved);

    expect(a).toEqual(b);
    expect(JSON.stringify(card)).toBe(snapshotCard);
    expect(JSON.stringify(preserved)).toBe(snapshotPreserved);
  });
});

describe("characterBookChars", () => {
  it("returns 0 for non-object payloads", () => {
    expect(characterBookChars(undefined)).toBe(0);
    expect(characterBookChars(null)).toBe(0);
    expect(characterBookChars(42)).toBe(0);
    expect(characterBookChars([1, 2])).toBe(0);
  });

  it("counts a plain string payload", () => {
    expect(characterBookChars("hello world")).toBe(11);
  });
});
