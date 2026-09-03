import { describe, expect, it } from "vitest";
import {
  normalizeLocalTemplate,
  promptTemplates,
  renderPromptTemplate,
} from "@/data/promptTemplates";

describe("prompt template metadata", () => {
  it("keeps all 18 templates and classifies only SillyTavern Author's Note as platform-specific", () => {
    expect(promptTemplates).toHaveLength(18);
    expect(new Set(promptTemplates.map((template) => template.id)).size).toBe(18);

    const verified = promptTemplates.filter((template) => template.compatibility[0]?.lane === "verified-platform");
    expect(verified.map((template) => template.id)).toEqual(["sillytavern-authors-note"]);
    expect(verified[0].compatibility[0]).toMatchObject({
      target: "SillyTavern",
      artifactType: "authors-note",
      format: "platform-native",
      confidence: "Verified",
      runtimeMacros: ["{{user}}"],
    });
    expect(verified[0].compatibility[0].evidence.length).toBeGreaterThan(0);
    expect(verified[0].compatibility[0].pasteInstructions).toMatch(/Options menu.*Author's Note/i);
  });

  it("keeps every other template Universal plain text without runtime macros", () => {
    for (const template of promptTemplates.filter((item) => item.id !== "sillytavern-authors-note")) {
      const compatibility = template.compatibility[0];
      expect(compatibility.lane).toBe("universal");
      expect(compatibility.target).toBe("Universal");
      expect(compatibility.format).toBe("plain-text");
      expect(compatibility.runtimeMacros).toEqual([]);
      expect(compatibility.evidence).toEqual([]);
    }
  });

  it("uses bracket placeholders for authors and preserves only the verified runtime macro", () => {
    for (const template of promptTemplates) {
      for (const variable of template.variables) {
        expect(variable.kind).toBe("author-placeholder");
        expect(variable.token).toBe(`[${variable.label}]`);
        expect(template.template).toContain(variable.token);
        expect(template.template).not.toContain(`{{${variable.name}}}`);
      }
    }

    const sillyTavern = promptTemplates.find((template) => template.id === "sillytavern-authors-note");
    expect(sillyTavern?.template).toContain("{{user}}");
    expect(promptTemplates.find((template) => template.id === "api-system-prompt")?.template).not.toContain("{{user}}");
  });

  it("renders author fields without substituting runtime macros", () => {
    const template = promptTemplates.find((item) => item.id === "sillytavern-authors-note");
    expect(template).toBeDefined();
    expect(renderPromptTemplate(template!, { tone: "warm", pacing: "steady", continuity: "the west gate" })).toBe(
      "[Author's Note: warm. Pacing: steady. Keep continuity with: the west gate. Do not narrate {{user}}'s choices.]",
    );
  });
});

describe("legacy local template normalization", () => {
  it("converts legacy curly fields and defaults local templates to Universal plain text", () => {
    const normalized = normalizeLocalTemplate({
      id: "custom-legacy",
      name: "Legacy",
      category: "Custom",
      description: "Old local template",
      template: "Use {{topic}} with {{character_name}}.",
      variables: [],
    });

    expect(normalized).toMatchObject({
      id: "custom-legacy",
      userCreated: true,
      compatibility: [{ lane: "universal", target: "Universal", format: "plain-text", confidence: "Not applicable" }],
    });
    expect(normalized?.template).toBe("Use [Topic] with [Character Name].");
    expect(normalized?.variables.map((variable) => variable.name)).toEqual(["topic", "character_name"]);
  });

  it("does not trust legacy platform fields or compatibility metadata", () => {
    const normalized = normalizeLocalTemplate({
      id: "custom-platform-claim",
      name: "Claimed Platform",
      category: "Custom",
      description: "User text",
      template: "[Tone]",
      variables: [{ name: "tone", placeholder: "quiet", description: "Tone" }],
      compatibility: [{ target: "SillyTavern", confidence: "Verified" }],
    });

    expect(normalized?.compatibility[0].lane).toBe("universal");
    expect(normalized?.compatibility[0].target).toBe("Universal");
    expect(normalized?.compatibility[0].confidence).toBe("Not applicable");
  });
});
