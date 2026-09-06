import { describe, it, expect } from "vitest";
import {
  normalizeAiMultiline,
  parseAiStringList,
  countMesExampleStarts,
  MES_EXAMPLE_FORMAT_RULES,
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
      '*She grins* "Hello, friend, welcome."\n*She bows* "Another opening, with commas."\n*She waves* "Third greeting."',
      { max: 3 },
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("Hello, friend, welcome.");
  });

  it("accepts JSON array alternate greetings", () => {
    const items = parseAiStringList(['First greeting', 'Second, with comma', 'Third'], { max: 3 });
    expect(items).toEqual(['First greeting', 'Second, with comma', 'Third']);
  });
});
