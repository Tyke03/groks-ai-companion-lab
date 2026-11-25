import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { buildContext } from "../context/assembler";
import { budgetPasses, countTokens, textOfTokenLength } from "../context/budgets";
import { parseItems, serializeItems } from "../context/format";
import { createEmptyCard, writeField } from "../domain/create";
import { FIELD_NAMES, fieldText, type FieldName } from "../domain/card";
import { assertRegistryCoversAll, FIELD_REGISTRY, STAGE_ORDER } from "../domain/fields";
import { createMockLlm } from "../llm/mock";
import type { LlmRequest } from "../llm/types";
import { convertCharacter, sniff } from "./convertCharacter";
import { dryRun, targetIsExcluded } from "./dryRun";
import { exportCard } from "./export";
import { generateCard } from "./generateCard";
import { generateField } from "./generateField";
import { CostGuard } from "../router/cost";
import { escalationBudget } from "../router/escalate";
import { balanceMarkdown } from "../validators/markdown";
import { validateBleed } from "../validators/bleed";
import { compileAll } from "../validators/schema";
import { clearEvents, readEvents } from "../telemetry/events";

const fixture = (name: string) => readFileSync(resolve(__dirname, "../fixtures", name), "utf8");

function lockAll(card: ReturnType<typeof createEmptyCard>) {
  for (const name of FIELD_NAMES) card.fields[name].policy.locked = true;
}

describe("ccv3 authoring pipeline", () => {
  beforeEach(() => clearEvents());

  it("registry covers every field", () => {
    assertRegistryCoversAll();
    expect(STAGE_ORDER).toHaveLength(15);
  });

  it("1–3 assembler hides the target, keeps later anchors, drops future seeds", () => {
    const card = createEmptyCard();
    writeField(card, "name", "Mara Voss", { locked: true, useAsContext: true, origin: "manual" });
    writeField(card, "mes_example", "<START>\n{{user}}: Hi\n{{char}}: Evening.", {
      locked: true,
      useAsContext: true,
      origin: "manual",
    });
    writeField(card, "personality", "She counts exits before she speaks.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    for (const field of STAGE_ORDER) {
      if (field === "creator" || field === "character_version") continue;
      const ctx = buildContext(field, card);
      expect(targetIsExcluded(ctx, field)).toBe(true);
    }
    const description = buildContext("description", card);
    expect(description).toContain("<<TIER_A>>");
    expect(description).toContain("### mes_example");
    expect(description).toContain("### name");
    expect(description.split("<<FIELD_CONTRACT>>")[0]).not.toContain("### personality");
    const scenario = buildContext("scenario", card);
    expect(scenario).toContain("### personality");
    expect(scenario).toContain("## RAW SEED");
  });

  it("4–5 item codec round-trips four greetings and does not merge blank lines", () => {
    const items = ["alpha", "beta", "gamma", "delta"];
    expect(parseItems(serializeItems(items))).toEqual(items);
    const merged = fixture("array_merge.json");
    const blob = JSON.parse(merged).alternate_greetings[0] as string;
    expect(parseItems(blob)).toHaveLength(2);
  });

  it("6 blob import sets imported_raw and does not trap the blob in description", async () => {
    const blob = fixture("blob_wpp.txt");
    expect(sniff(blob)).toBe("wpp");
    expect(sniff(fixture("blob_v1.json"))).toBe("v1");
    expect(sniff(fixture("blob_v2.json"))).toBe("v2");
    expect(sniff(fixture("blob_malformed.json"))).toBe("raw");
    const cand = (value: string) => ({ value, confidence: 0.9 });
    const llm = createMockLlm({
      extract: JSON.stringify({
        fields: {
          description: cand("Short black coat, a scar through the left brow."),
          personality: cand("She trusts nobody and counts exits."),
          scenario: cand("Rain on the pier, a crate between them."),
          first_mes: cand("The crate sits between them. She waits."),
          mes_example: cand("<START>\n{{user}}: Who?\n{{char}}: Count the exits."),
          system_prompt: cand("Play her wary."),
          post_history_instructions: cand("Keep her wary."),
          creator_notes: cand("Intended user: noir players."),
        },
      }),
    });
    const card = await convertCharacter(blob, llm);
    expect(card.fields.description.policy.origin).toBe("imported_raw");
    expect(card.fields.personality.policy.origin).toBe("imported_raw");
    expect(card.fields.description.policy.locked).toBe(false);
    expect(fieldText(card.fields.description.value)).not.toContain("[character");
    expect(fieldText(card.fields.description.value)).not.toBe(blob.trim());
  });

  it("7 overwrite leaves creator and character_version untouched", async () => {
    const card = createEmptyCard();
    lockAll(card);
    writeField(card, "creator", "Ada", { locked: true, useAsContext: false, origin: "manual" });
    writeField(card, "character_version", "2.3.1", { locked: true, useAsContext: false, origin: "manual" });
    const llm = createMockLlm({
      plan: JSON.stringify({ ownership: {}, contradictions: [], directives: [] }),
      audit: JSON.stringify({ findings: [] }),
    });
    const result = await generateCard(card, { llm, planMode: "always" });
    expect(fieldText(result.card.fields.creator.value)).toBe("Ada");
    expect(fieldText(result.card.fields.character_version.value)).toBe("2.3.1");
  });

  it("8 bleed catches a duplicated stage ladder", () => {
    const card = createEmptyCard();
    const line = "Stage 1: she draws the knife and waits by the door tonight.";
    writeField(card, "scenario", line, { locked: false, useAsContext: true, origin: "generated" });
    writeField(card, "system_prompt", line, { locked: false, useAsContext: true, origin: "generated" });
    const gate = validateBleed(card);
    expect(gate.pass).toBe(false);
    expect(gate.findings[0].validator).toBe("bleed");
  });

  it("9 a fabricated audit quote fails quotes and triggers repair", async () => {
    const card = createEmptyCard();
    lockAll(card);
    writeField(card, "scenario", "The dock is quiet at noon.", { locked: true, useAsContext: true, origin: "manual" });
    writeField(card, "first_mes", "Noon sun glares off the water.", { locked: true, useAsContext: true, origin: "manual" });
    const calls: string[] = [];
    const llm = createMockLlm({
      plan: JSON.stringify({ ownership: {}, contradictions: [], directives: [] }),
      audit: JSON.stringify({
        findings: [{
          a: "scenario",
          b: "first_mes",
          kind: "timeline",
          quoteA: "3am",
          quoteB: "noon",
          fix: "align the clock",
        }],
      }),
      repair: (req: LlmRequest) => {
        calls.push(req.stage);
        expect(req.messages.map((m) => m.content).join("\n")).not.toContain("<<TIER_A>>");
        return JSON.stringify({
          field: "scenario",
          patchedText: "The dock is quiet at noon.",
          changed: true,
        });
      },
    });
    await generateCard(card, { llm });
    expect(calls).toContain("repair");
    expect(readEvents().some((e) => e.name === "validator.fail" && e.payload.validator === "quotes")).toBe(true);
  });

  it("10 budget at 100% passes and 101% regenerates", async () => {
    const budget = FIELD_REGISTRY.description.budgetTokens;
    const exact = textOfTokenLength(budget);
    expect(countTokens(exact)).toBe(budget);
    expect(budgetPasses(countTokens(exact), budget)).toBe(true);
    const over = textOfTokenLength(Math.ceil(budget * 1.01));
    expect(countTokens(over) / budget).toBeGreaterThan(1);
    expect(budgetPasses(countTokens(over), budget)).toBe(false);

    const card = createEmptyCard();
    const calls: string[] = [];
    const llm = createMockLlm({
      description: (req) => {
        calls.push(req.messages.map((m) => m.content).join("\n"));
        const joined = calls[calls.length - 1];
        return joined.includes("tighten") ? "A tired archivist keeps one brass key." : over;
      },
      repair: JSON.stringify({ field: "description", patchedText: over, changed: false }),
    });
    const result = await generateField(card, "description", {
      llm,
      cardId: "budget",
      directives: [],
      cost: new CostGuard(),
      escalations: escalationBudget(),
    });
    expect(result.status).toBe("filled");
    expect(calls.some((c) => c.includes("tighten"))).toBe(true);
    expect(countTokens(fieldText(card.fields.description.value))).toBeLessThanOrEqual(budget);
  });

  it("11 balancer closes an odd star at the clause end", () => {
    expect(balanceMarkdown(fixture("markdown_broken.txt").trim())).toBe("She *leans in and waits*.");
  });

  it("12 export blocks a UI label in creator_notes", () => {
    const card = createEmptyCard();
    writeField(
      card,
      "creator_notes",
      "Intended user: adults who want a slow scene.\nPress the New Chat button to begin.",
      { locked: false, useAsContext: true, origin: "generated" },
    );
    const result = exportCard(card);
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => r.validator === "jargon" && r.field === "creator_notes")).toBe(true);
    expect(result.envelope).toBeUndefined();
    expect(readEvents().some((e) => e.name === "export.blocked")).toBe(true);
    const payload = JSON.stringify(readEvents());
    expect(payload).not.toContain("New Chat button");
  });

  it("13 skips group_only_greetings when groupCard is false", async () => {
    const card = createEmptyCard({ groupCard: false });
    lockAll(card);
    const stages: string[] = [];
    const llm = createMockLlm({
      plan: (req) => {
        stages.push(req.stage);
        return JSON.stringify({ ownership: {}, contradictions: [], directives: [] });
      },
      audit: (req) => {
        stages.push(req.stage);
        return JSON.stringify({ findings: [] });
      },
      group_only_greetings: () => {
        stages.push("group_only_greetings");
        return JSON.stringify({ items: ["hi"] });
      },
    });
    await generateCard(card, { llm });
    expect(stages).not.toContain("group_only_greetings");
    expect(JSON.parse(fixture("group_card.json")).meta.groupCard).toBe(true);
  });

  it("compiles every schema strict and dry-run prints a contract per stage", () => {
    expect(compileAll().length).toBe(7);
    const card = createEmptyCard();
    writeField(card, "name", "Mara", { locked: true, useAsContext: true, origin: "manual" });
    const printed = dryRun(card);
    expect(printed.description).toContain("TARGET: description");
    expect(printed.description).toContain("BUDGET:");
    for (const [field, text] of Object.entries(printed)) {
      expect(targetIsExcluded(text, field as FieldName)).toBe(true);
    }
  });

  it("cost cap stops the walk", async () => {
    const card = createEmptyCard();
    lockAll(card);
    card.fields.description.policy.locked = false;
    card.fields.personality.policy.locked = false;
    const stages: string[] = [];
    const llm = createMockLlm({
      plan: (req) => {
        stages.push(req.stage);
        return JSON.stringify({ ownership: {}, contradictions: [], directives: [] });
      },
      description: (req) => {
        stages.push(req.stage);
        return "A short coat and a scar through one brow.";
      },
      personality: (req) => {
        stages.push(req.stage);
        return "She counts exits and trusts slowly.";
      },
      audit: (req) => {
        stages.push(req.stage);
        return JSON.stringify({ findings: [] });
      },
    }, 0.05);
    const result = await generateCard(card, { llm });
    expect(result.costAborted).toBe(true);
    expect(result.costUSD).toBeGreaterThan(0.06);
    expect(stages).not.toContain("personality");
  });
});
