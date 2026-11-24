import { describe, it, expect } from "vitest";
import {
  normalizeAiMultiline,
  parseAiStringList,
  serializeAiStringList,
  countMesExampleStarts,
  MES_EXAMPLE_FORMAT_RULES,
  parseWholeCardJson,
  extractCardField,
  applyGenerateFieldResult,
  normalizeCardTags,
  ensureOriginalMacro,
  replaceLiteralCharName,
  sanitizeCardMacros,
  quoteUnquotedUserLines,
} from "@/lib/cardAiFormat";

describe("cardAiFormat", () => {
  it("documents SillyTavern {{user}}/{{char}} rules in the prompt fragment", () => {
    expect(MES_EXAMPLE_FORMAT_RULES).toContain("<START>");
    expect(MES_EXAMPLE_FORMAT_RULES).toContain("{{user}}:");
    expect(MES_EXAMPLE_FORMAT_RULES).toContain("{{char}}:");
    expect(MES_EXAMPLE_FORMAT_RULES).toMatch(/THREE/i);
  });

  it("expands literal \\n so mes_example is not collapsed to one line", () => {
    const raw = "<START>\\n{{user}}: Hey\\n{{char}}: *giggles* Hi\\n\\n<START>\\n{{user}}: Next\\n{{char}}: *nods* Ok";
    const out = normalizeAiMultiline(raw);
    expect(out).toContain("\n");
    expect(out.split("\n")[0]).toBe("<START>");
    expect(countMesExampleStarts(out)).toBe(2);
  });

  it("strips markdown fences around generated dialogue", () => {
    const raw = "```\n<START>\n{{user}}: Hi\n{{char}}: *waves* Hello\n```";
    const out = normalizeAiMultiline(raw);
    expect(out.startsWith("<START>")).toBe(true);
    expect(out).not.toContain("```");
  });

  it("puts jammed <START> markers on their own lines", () => {
    const raw = "<START> {{user}}: Hi {{char}}: *smiles* Hello <START> {{user}}: Two {{char}}: *nods* Two";
    const out = normalizeAiMultiline(raw);
    expect(countMesExampleStarts(out)).toBe(2);
    expect(out).toMatch(/^<START>$/m);
  });

  it("parses alternate greetings without splitting on commas", () => {
    const items = parseAiStringList(
      '*She grins* "Hello, friend, welcome."\n\n*She bows* "Another opening, with commas."\n\n*She waves* "Third greeting."',
      { max: 3 },
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("Hello, friend, welcome.");
  });

  it("keeps internal newlines intact across three multi-line greetings (F1)", () => {
    const raw = [
      "*She steps onto the balcony.*\n\"Rough night, {{user}}?\"",
      "*She sets two mugs on the counter.*\n\"Coffee first. Questions after.\"",
      "*Rain taps against the glass.*\n\"Don't look at me like that.\"",
    ].join("\n\n");
    const items = parseAiStringList(raw, { max: 3 });
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item).toContain("\n");
    }
    expect(items[0]).toContain("Rough night");
    expect(items[1]).toContain("Coffee first");
    expect(items[2]).toContain("Don't look at me");
  });

  it("accepts JSON array alternate greetings", () => {
    const items = parseAiStringList(['First greeting', 'Second, with comma', 'Third'], { max: 3 });
    expect(items).toEqual(['First greeting', 'Second, with comma', 'Third']);
  });

  it("parses whole-card JSON from fenced AI output", () => {
    const raw = "Here you go:\n```json\n{\"name\":\"Riley\",\"personality\":\"dominant brat\",\"system_prompt\":\"Stay in character as Riley.\"}\n```\n";
    const { card, parseError } = parseWholeCardJson(raw);
    expect(parseError).toBe(false);
    expect(card?.name).toBe("Riley");
    expect(card?.personality).toBe("dominant brat");
  });

  it("extracts a single field from a whole-card object", () => {
    const card = {
      name: "Riley",
      description: "A smug CEO",
      personality: "dominant brat",
      system_prompt: "Portray Riley as a dominant brat.",
    };
    expect(extractCardField(card, "personality")).toBe("dominant brat");
    expect(extractCardField(card, "missing")).toBeUndefined();
  });

  it("applyGenerateFieldResult slices whole-card payloads to one field", () => {
    const whole = {
      name: "Riley",
      description: "desc",
      personality: "dominant brat",
      scenario: "office",
      first_mes: "hi",
      mes_example: "<START>",
      system_prompt: "instructions only",
    };
    const { value, slicedFromWholeCard } = applyGenerateFieldResult("personality", whole);
    expect(slicedFromWholeCard).toBe(true);
    expect(value).toBe("dominant brat");
  });

  it("applyGenerateFieldResult keeps plain field strings untouched", () => {
    const { value, slicedFromWholeCard } = applyGenerateFieldResult("personality", "dominant brat");
    expect(slicedFromWholeCard).toBe(false);
    expect(value).toBe("dominant brat");
  });

  it("splits <START> and === GREETING === multi-paragraph openers without chopping internal blank lines", () => {
    const startDelimited = [
      "<START>",
      "*First scene paragraph one.*\n\n\"Dialogue in paragraph two.\"",
      "<START>",
      "*Second scene paragraph one.*\n\n\"Another paragraph two.\"",
      "<START>",
      "*Third scene paragraph one.*\n\n\"Final paragraph two.\"",
    ].join("\n");
    const items = parseAiStringList(startDelimited, { max: 3 });
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("First scene paragraph one.");
    expect(items[0]).toContain("Dialogue in paragraph two.");
    expect(items[1]).toContain("Second scene paragraph one.");
    expect(items[2]).toContain("Final paragraph two.");

    const bannerDelimited = [
      "=== GREETING 1 ===",
      "Line A\n\nLine B",
      "=== GREETING 2 ===",
      "Line C\n\nLine D",
    ].join("\n");
    const bannerItems = parseAiStringList(bannerDelimited, { max: 3 });
    expect(bannerItems).toHaveLength(2);
    expect(bannerItems[0]).toContain("Line A\n\nLine B");
    expect(bannerItems[1]).toContain("Line C\n\nLine D");

    const serialized = serializeAiStringList(["Alpha\n\nBeta", "Gamma\n\nDelta"]);
    expect(parseAiStringList(serialized, { max: 3 })).toEqual(["Alpha\n\nBeta", "Gamma\n\nDelta"]);
  });

  it("normalizes tags, preserves {{original}}, replaces literal char name in meta prompts, and strips macros from creator_notes", () => {
    expect(normalizeCardTags("Succubus, slow-burn, Slow Burn, #demon_girl, succubus, fantasy")).toBe(
      "succubus, slow burn, demon girl, fantasy",
    );
    expect(ensureOriginalMacro("Stay in character.")).toBe("{{original}}\nStay in character.");
    expect(ensureOriginalMacro("{{Original}}\nStay in character.")).toBe("{{original}}\nStay in character.");
    expect(replaceLiteralCharName("You are Lila. Keep Lila's voice low.", "Lila")).toBe(
      "You are {{char}}. Keep {{char}}'s voice low.",
    );
    expect(sanitizeCardMacros("Built for {{user}}'s pacing with {{char}}.", "creator_notes", "Lila")).toBe(
      "Built for the user's pacing with Lila.",
    );
    expect(sanitizeCardMacros("Notes for the user only.", "creator_notes", "Lila")).toBe(
      "Notes for the user only.",
    );
    expect(
      quoteUnquotedUserLines(
        "<START>\n{{user}}: Walk me through it.\n{{char}}: *smiles* \"Sure.\"\n{{user}}: *nods* Already quoted",
      ),
    ).toBe(
      "<START>\n{{user}}: \"Walk me through it.\"\n{{char}}: *smiles* \"Sure.\"\n{{user}}: *nods* Already quoted",
    );
  });
});
