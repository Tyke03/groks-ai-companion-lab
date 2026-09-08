import { describe, expect, it } from "vitest";
import { normalizeWholeCardToHub, applyGenerateFieldResult } from "@/lib/cardAiFormat";
import { importCard } from "@/lib/cardCodec";

const playgroundDialect = {
  spec_version: 2.5,
  spec: "character_card",
  spec_url: "https://example.com/spec.yaml",
  character_card: {
    name: "Roxy Vane",
    description: "Golden girl facade.",
    personality: ["Addictive risk-taking", "Gaslighting", "rebellious"],
    scenario: "Family estate.",
    first_mes: "Oh, hi.",
    mes_example:
      "<START>\n{{user}}: Hey\n\n<START>\nRoxy: *smirks* Don't stare.\n\n<START>\n{{user}}: Leave\n\n<START>\nRoxy: Fine.",
    system_prompt: "You are Roxy.",
    lore: ["Wealthy family"],
    tags: ["incest", "teasing"],
    alternate_greetings: ["Roxy: Breakfast?", "Hey again"],
    creator_notes: "Friction.",
    post_history_instructions: "Stay in character.",
  },
};

describe("normalizeWholeCardToHub", () => {
  it("unwraps character_card dialect into flat Hub keys", () => {
    const flat = normalizeWholeCardToHub(playgroundDialect as unknown as Record<string, unknown>);
    expect(flat.name).toBe("Roxy Vane");
    expect(flat.personality).toBe("Addictive risk-taking, Gaslighting, rebellious");
    expect(flat.tags).toBe("incest, teasing");
    expect(flat).not.toHaveProperty("lore");
    expect(flat).not.toHaveProperty("character_card");
    expect(String(flat.mes_example)).toContain("{{char}}:");
    expect(String(flat.mes_example)).not.toMatch(/\nRoxy:/);
  });

  it("slices a single field from a foreign whole-card object", () => {
    const { value, slicedFromWholeCard } = applyGenerateFieldResult(
      "personality",
      playgroundDialect,
    );
    expect(slicedFromWholeCard).toBe(true);
    expect(value).toBe("Addictive risk-taking, Gaslighting, rebellious");
  });
});

describe("importCard character_card unwrap", () => {
  it("imports playground-style character_card envelopes as V1 flat", () => {
    const result = importCard(playgroundDialect);
    expect(result.data.name).toBe("Roxy Vane");
    expect(result.data.personality).toContain("Gaslighting");
  });
});
