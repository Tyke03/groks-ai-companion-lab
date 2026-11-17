import { describe, expect, it } from "vitest";
import {
  sanitizeCardMacros,
  sanitizeFieldText,
  normalizeWholeCardToHub,
  MES_EXAMPLE_FORMAT_RULES,
  sanitizeCardData,
} from "@/lib/cardAiFormat";
import { emptyCardData } from "@/lib/cardTypes";

describe("sanitizeCardMacros", () => {
  it("lowercases {{User}} / {{Char}} macros", () => {
    expect(sanitizeCardMacros("Meet {{User}} and {{Char}}.")).toBe("Meet {{user}} and {{char}}.");
    expect(sanitizeCardMacros("{{USER}} with {{CHAR}}")).toBe("{{user}} with {{char}}");
  });

  it("rewrites possessives {{User's}} / {{user's}} to {{user}}'s", () => {
    expect(sanitizeCardMacros("{{User's}} hand")).toBe("{{user}}'s hand");
    expect(sanitizeCardMacros("{{user's}} coat")).toBe("{{user}}'s coat");
    expect(sanitizeCardMacros("{{Char's}} smirk")).toBe("{{char}}'s smirk");
  });

  it("rewrites The User and User: labels", () => {
    expect(sanitizeCardMacros("The User enters.")).toBe("{{user}} enters.");
    expect(sanitizeCardMacros("User: hello\nName: hi")).toBe("{{user}}: hello\n{{char}}: hi");
  });

  it("rewrites the user's / the user case-insensitively (possessive first)", () => {
    expect(sanitizeCardMacros("She is the user's little sister.")).toBe("She is {{user}}'s little sister.");
    expect(sanitizeCardMacros("THE USER'S coat")).toBe("{{user}}'s coat");
    expect(sanitizeCardMacros("When the user arrives.")).toBe("When {{user}} arrives.");
    expect(sanitizeCardMacros("The user smiles.")).toBe("{{user}} smiles.");
  });

  it("rewrites leading You are only for description/personality", () => {
    expect(sanitizeCardMacros("You are a tall mage.", "description")).toBe("{{char}} is a tall mage.");
    expect(sanitizeCardMacros("You are a tall mage.", "personality")).toBe("{{char}} is a tall mage.");
    expect(sanitizeCardMacros("You are a tall mage.", "scenario")).toBe("You are a tall mage.");
    expect(sanitizeCardMacros("You are a tall mage.")).toBe("You are a tall mage.");
  });
});

describe("sanitizeFieldText", () => {
  it("sanitizes array items", () => {
    expect(sanitizeFieldText(["{{User}} hi", "ok"], "alternate_greetings")).toEqual([
      "{{user}} hi",
      "ok",
    ]);
  });
});

describe("normalizeWholeCardToHub sanitizes macros", () => {
  it("sanitizes string fields and alternate_greetings", () => {
    const flat = normalizeWholeCardToHub({
      name: "Roxy",
      description: "You are a golden girl. {{User}} watches.",
      personality: "You are rebellious.",
      first_mes: "User: hey\nRoxy: *smirks*",
      mes_example: "{{User's}} choice\nUser: go",
      alternate_greetings: ["The User walks in.", "Hi"],
      tags: "teasing",
    });
    expect(flat.description).toBe("{{char}} is a golden girl. {{user}} watches.");
    expect(flat.personality).toBe("{{char}} is rebellious.");
    expect(String(flat.mes_example)).toContain("{{user}}'s");
    expect(String(flat.mes_example)).toContain("{{user}}:");
    expect(flat.alternate_greetings).toEqual(["{{user}} walks in.", "Hi"]);
  });
});

describe("MES_EXAMPLE_FORMAT_RULES", () => {
  it("requires three-block progression not three hellos", () => {
    expect(MES_EXAMPLE_FORMAT_RULES).toMatch(/Block1 Public\/Casual/i);
    expect(MES_EXAMPLE_FORMAT_RULES).toMatch(/Block2 Private\/Core/i);
    expect(MES_EXAMPLE_FORMAT_RULES).toMatch(/Block3 High stakes\/Vulnerability/i);
    expect(MES_EXAMPLE_FORMAT_RULES).toMatch(/NOT three hellos/i);
  });
});

describe("sanitizeCardData and mixed-case / curly apostrophe sanitization", () => {
  it("handles mixed-case macros and curly apostrophes", () => {
    expect(sanitizeCardMacros("{{uSeR}} holds {{cHaR’s}} hand as the user’s heart races.")).toBe(
      "{{user}} holds {{char}}'s hand as {{user}}'s heart races.",
    );
  });

  it("sanitizes an entire CardData object for request/export safety", () => {
    const card = emptyCardData();
    card.name = "Roxy";
    card.description = "You are the user's rival, watching {{User}}.";
    card.first_mes = "User: Hey\nRoxy: *waves at the user*";
    card.mes_example = "<START>\nUser: Test\nRoxy: Done.";
    card.alternate_greetings = ["{{Char}} greets The User."];
    const clean = sanitizeCardData(card);
    expect(clean.description).toBe("{{char}} is {{user}}'s rival, watching {{user}}.");
    expect(clean.first_mes).toBe("{{user}}: Hey\n{{char}}: *waves at {{user}}*");
    expect(clean.mes_example).toBe("<START>\n{{user}}: Test\n{{char}}: Done.");
    expect(clean.alternate_greetings).toEqual(["{{char}} greets {{user}}."]);
  });
});
