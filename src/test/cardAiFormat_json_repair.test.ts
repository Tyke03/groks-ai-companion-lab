import { describe, expect, it } from "vitest";
import {
  parseWholeCardJson,
  stripThinkingBlocks,
  repairJsonString,
  extractCardFieldsFuzzy,
  normalizeWholeCardToHub,
} from "@/lib/cardAiFormat";

describe("stripThinkingBlocks", () => {
  it("removes <think>...</think> blocks", () => {
    const raw = "<think>\nThinking about Roxy...\n</think>\n{\n  \"name\": \"Roxy\"\n}";
    expect(stripThinkingBlocks(raw)).toBe('{\n  "name": "Roxy"\n}');
  });

  it("removes unclosed <think> blocks at the end", () => {
    const raw = "Output text<think>partial reasoning...";
    expect(stripThinkingBlocks(raw)).toBe("Output text");
  });
});

describe("repairJsonString", () => {
  it("repairs literal newlines inside JSON string values", () => {
    const badJson = '{\n  "name": "Roxy",\n  "description": "Line 1\nLine 2"\n}';
    const repaired = repairJsonString(badJson);
    const parsed = JSON.parse(repaired);
    expect(parsed.name).toBe("Roxy");
    expect(parsed.description).toBe("Line 1\nLine 2");
  });

  it("repairs unescaped dialogue double quotes inside strings", () => {
    const badJson = '{\n  "name": "Roxy",\n  "first_mes": "*smiles* "Hello there!" *she winks*"\n}';
    const repaired = repairJsonString(badJson);
    const parsed = JSON.parse(repaired);
    expect(parsed.name).toBe("Roxy");
    expect(parsed.first_mes).toContain('"Hello there!"');
  });

  it("removes trailing commas before closing braces and brackets", () => {
    const badJson = '{\n  "name": "Roxy",\n  "tags": "fun, sassy",\n  "alternate_greetings": ["Hi", "Hey",],\n}';
    const repaired = repairJsonString(badJson);
    const parsed = JSON.parse(repaired);
    expect(parsed.name).toBe("Roxy");
    expect(parsed.alternate_greetings).toEqual(["Hi", "Hey"]);
  });

  it("auto-closes truncated JSON objects", () => {
    const truncated = '{\n  "name": "Roxy",\n  "description": "A very long description that got cut';
    const repaired = repairJsonString(truncated);
    const parsed = JSON.parse(repaired);
    expect(parsed.name).toBe("Roxy");
    expect(parsed.description).toContain("A very long description");
  });
});

describe("parseWholeCardJson with multi-tier repair", () => {
  it("successfully parses JSON wrapped in <think> tags with literal newlines in mes_example", () => {
    const rawLLMOutput = `<think>
I should create a card for Roxy Vane.
Here is the plan:
- name: Roxy Vane
- mes_example: 3 blocks
</think>
\`\`\`json
{
  "name": "Roxy Vane",
  "description": "Roxy is a college student.\\nShe lives nearby.",
  "personality": "Sassy, confident",
  "scenario": "A quiet cafe.",
  "first_mes": "*Roxy smirks* \\"What took you so long?\\"",
  "mes_example": "<START>\\n{{user}}: Hey\\n{{char}}: Hey yourself.",
  "system_prompt": "Portray {{char}} as requested.",
  "alternate_greetings": ["Hey", "Hi there", "Welcome"],
  "tags": "college, rival",
  "creator_notes": "Enjoy the card!"
}
\`\`\`
Hope this helps!`;

    const { card, parseError } = parseWholeCardJson(rawLLMOutput);
    expect(parseError).toBe(false);
    expect(card).not.toBeNull();
    if (!card) return;

    const flat = normalizeWholeCardToHub(card);
    expect(flat.name).toBe("Roxy Vane");
    expect(flat.personality).toBe("Sassy, confident");
    expect(String(flat.first_mes)).toContain("What took you so long?");
    expect(String(flat.mes_example)).toContain("<START>");
    expect(flat.alternate_greetings).toEqual(["Hey", "Hi there", "Welcome"]);
  });

  it("salvages fields via fuzzy extractor when outer JSON is severely damaged", () => {
    const broken = `
Here is the card:
"name": "Roxy Vane",
"description": "A talented rebel who defies rules.",
"personality": "Rebellious, witty",
"scenario": "Late night in the library.",
"first_mes": "*Roxy taps her desk* Ready?",
"system_prompt": "Portray {{char}}."
`;

    const { card, parseError } = parseWholeCardJson(broken);
    expect(parseError).toBe(false);
    expect(card).not.toBeNull();
    if (!card) return;

    expect(card.name).toBe("Roxy Vane");
    expect(card.personality).toBe("Rebellious, witty");
  });

  it("handles complex playground dialect with unescaped quotes in dialogue and personality array", () => {
    const playgroundBlob = `
<think>
Step 1: Extract personality
Step 2: Generate greetings
</think>
{
  "spec_version": 2.5,
  "spec": "character_card",
  "character_card": {
    "name": "Roxy Vane",
    "description": "Roxy is a college student.\nShe lives off-campus.",
    "personality": ["Addictive risk-taking", "Gaslighting", "rebellious"],
    "scenario": "A party downtown.",
    "first_mes": "*she turns around* "Didn't expect to see you here," *she says with a smirk.*",
    "mes_example": "<START>\n{{user}}: What are you doing?\n{{char}}: *laughs* "Having fun. What does it look like?"\n\n<START>\n{{user}}: Let's go home.\n{{char}}: *crosses arms* "Make me."",
    "system_prompt": "Portray {{char}} with an edge.",
    "alternate_greetings": [
      "*she waves* "Hey!"",
      "*she ignores {{user}}*",
      "*she winks* "Catch me if you can."",
    ],
    "tags": ["college", "rebel"],
  },
}
`;

    const { card, parseError } = parseWholeCardJson(playgroundBlob);
    expect(parseError).toBe(false);
    expect(card).not.toBeNull();
    if (!card) return;

    const flat = normalizeWholeCardToHub(card);
    expect(flat.name).toBe("Roxy Vane");
    expect(flat.personality).toBe("Addictive risk-taking, Gaslighting, rebellious");
    expect(String(flat.first_mes)).toContain("Didn't expect to see you here");
    expect(String(flat.mes_example)).toContain("<START>");
    expect(Array.isArray(flat.alternate_greetings)).toBe(true);
    expect((flat.alternate_greetings as string[]).length).toBe(3);
  });
});


