import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { buildContext } from "../context/assembler";
import { budgetPasses, countTokens, textOfTokenLength } from "../context/budgets";
import { parseItems, serializeItems } from "../context/format";
import { createEmptyCard, writeField } from "../domain/create";
import { FIELD_NAMES, fieldText, isEmptyValue, type FieldName } from "../domain/card";
import { assertRegistryCoversAll, FIELD_REGISTRY, STAGE_ORDER } from "../domain/fields";
import { buildRequest, withMeasuredCost } from "../llm/client";
import { createMockLlm } from "../llm/mock";
import type { LlmRequest } from "../llm/types";
import { convertCharacter, sniff } from "./convertCharacter";
import { dryRun, targetIsExcluded } from "./dryRun";
import { exportCard } from "./export";
import { generateCard } from "./generateCard";
import { generateField, repairField } from "./generateField";
import { CostGuard, priceUSD } from "../router/cost";
import { escalatedRoute, escalationBudget } from "../router/escalate";
import { routeFor } from "../router/stages";
import { balanceMarkdown } from "../validators/markdown";
import { validateBleed } from "../validators/bleed";
import { validateWrittenField } from "../validators/fieldGate";
import { compileAll, validateSchema } from "../validators/schema";
import { clearEvents, readEvents } from "../telemetry/events";

const fixture = (name: string) => readFileSync(resolve(__dirname, "../fixtures", name), "utf8");

function lockAll(card: ReturnType<typeof createEmptyCard>) {
  for (const name of FIELD_NAMES) {
    card.fields[name].policy.locked = true;
    if (isEmptyValue(card.fields[name].value)) {
      card.fields[name].value = Array.isArray(card.fields[name].value) ? ["kept"] : "kept";
    }
  }
}

function envFor(llm: ReturnType<typeof createMockLlm>) {
  return {
    llm,
    cardId: "budget",
    directives: [] as string[],
    ownership: {} as Record<string, string>,
    contradictions: [] as { a: string; b: string; quoteA: string; quoteB: string }[],
    cost: new CostGuard(),
    escalations: escalationBudget(),
    systemCacheHit: false,
  };
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
    const fields = {
      description: cand("Short black coat, a scar through the left brow."),
      personality: cand("She trusts nobody and counts exits."),
      scenario: cand("Rain on the pier, a crate between them."),
      first_mes: cand("The crate sits between them. She waits."),
      mes_example: cand("<START>\n{{user}}: Who?\n{{char}}: Count the exits."),
      system_prompt: cand("Play her wary."),
      post_history_instructions: cand("Keep her wary."),
      creator_notes: cand("Intended user: noir players."),
    };
    const llm = createMockLlm({
      extract: JSON.stringify({ fields: { ...fields, name: cand("Lina Kade") } }),
      plan: JSON.stringify({ ownership: { name: "Lina Kade" }, contradictions: [], directives: ["Keep the scar in description."] }),
    });
    const card = await convertCharacter(blob, llm);
    expect(card.fields.description.policy.origin).toBe("imported_raw");
    expect(card.fields.personality.policy.origin).toBe("imported_raw");
    expect(card.fields.description.policy.locked).toBe(false);
    expect(fieldText(card.fields.description.value)).toBe("Short black coat, a scar through the left brow.");
    expect(fieldText(card.fields.description.value)).not.toContain("[character");
    expect(fieldText(card.fields.description.value)).not.toBe(blob.trim());
    expect(fieldText(card.fields.name.value)).toBe("Lina Kade");
    expect(card.meta.plan?.directives).toContain("Keep the scar in description.");
    expect(card.meta.plan?.ownership.name).toBe("Lina Kade");

    const hostile = createMockLlm({
      extract: JSON.stringify({ fields: { ...fields, description: cand(blob) } }),
      plan: JSON.stringify({ ownership: {}, contradictions: [], directives: [] }),
    });
    const trapped = await convertCharacter(blob, hostile);
    expect(fieldText(trapped.fields.description.value)).not.toContain("[character");
    expect(fieldText(trapped.fields.personality.value)).toBe("She trusts nobody and counts exits.");

    const fromJson = createMockLlm({
      extract: JSON.stringify({ fields }),
      plan: JSON.stringify({ ownership: {}, contradictions: [], directives: [] }),
    });
    const v2 = await convertCharacter(fixture("blob_v2.json"), fromJson);
    expect(fieldText(v2.fields.name.value)).toBe("Mara Voss");
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

  it("9 a fabricated audit quote fails quotes and is dropped", async () => {
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
    expect(calls).not.toContain("repair");
    expect(readEvents().some((e) => e.name === "validator.fail" && e.payload.validator === "quotes")).toBe(true);
  });

  it("audit repairs a contradiction when both quotes are real", async () => {
    const card = createEmptyCard();
    lockAll(card);
    writeField(card, "scenario", "The dock is quiet at 3am.", { locked: true, useAsContext: true, origin: "manual" });
    writeField(card, "first_mes", "Noon sun glares off the water.", { locked: true, useAsContext: true, origin: "manual" });
    let audits = 0;
    const calls: string[] = [];
    const llm = createMockLlm({
      plan: JSON.stringify({ ownership: {}, contradictions: [], directives: [] }),
      audit: () => {
        audits += 1;
        if (audits > 1) return JSON.stringify({ findings: [] });
        return JSON.stringify({
          findings: [{
            a: "scenario",
            b: "first_mes",
            kind: "timeline",
            quoteA: "3am",
            quoteB: "Noon sun",
            fix: "move the dock to noon",
          }],
        });
      },
      repair: () => {
        calls.push("repair");
        return JSON.stringify({
          field: "scenario",
          patchedText: "The dock is quiet at noon.",
          changed: true,
        });
      },
    });
    await generateCard(card, { llm });
    expect(calls).toContain("repair");
    expect(fieldText(card.fields.scenario.value)).toBe("The dock is quiet at noon.");
    expect(readEvents().some((e) => e.name === "validator.fail" && e.payload.validator === "quotes")).toBe(false);
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
    const result = await generateField(card, "description", envFor(llm));
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
    expect(compileAll()).toHaveLength(7);
    expect(validateSchema("greetings", { items: ["hi"] }).pass).toBe(true);
    expect(validateSchema("greetings", { items: [1] }).pass).toBe(false);
    expect(validateSchema("plan", {}).pass).toBe(false);
    expect(validateSchema("card", { spec: "chara_card_v3", spec_version: "3.0", data: {} }).pass).toBe(false);
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

  it("cold start generates name, nickname, and tags, and keeps the plan", async () => {
    const card = createEmptyCard();
    const control = { aborted: false };
    const stages: string[] = [];
    const llm = createMockLlm({
      plan: JSON.stringify({
        ownership: { description: "the scar" },
        contradictions: [{ a: "scenario", b: "first_mes", kind: "timeline", quoteA: "3am", quoteB: "noon" }],
        directives: ["Keep the scar in description."],
      }),
      name: () => {
        stages.push("name");
        return "Mara Voss";
      },
      nickname: () => {
        stages.push("nickname");
        return "Mara";
      },
      tags: () => {
        stages.push("tags");
        return JSON.stringify({ tags: ["noir", "pier"], character_version: "9.9.9" });
      },
      description: (req) => {
        stages.push("description");
        const user = req.messages.map((m) => m.content).join("\n");
        expect(user).toContain("OWNERSHIP:");
        expect(user).toContain("the scar");
        expect(user).toContain("<<PLAN>>");
        expect(user).toContain("3am");
        control.aborted = true;
        return "A scar through the left brow.";
      },
    });
    const result = await generateCard(card, { llm, control });
    expect(stages).toEqual(["name", "nickname", "tags", "description"]);
    expect(fieldText(result.card.fields.name.value)).toBe("Mara Voss");
    expect(fieldText(result.card.fields.nickname.value)).toBe("Mara");
    expect(result.card.fields.tags.value).toEqual(["noir", "pier"]);
    expect(result.card.fields.name.policy.locked).toBe(true);
    expect(result.card.fields.tags.policy.locked).toBe(true);
    expect(result.directives).toContain("Keep the scar in description.");
    expect(result.aborted).toBe(true);
  });

  it("greeting budget is per item and array repair keeps paragraphs", async () => {
    const card = createEmptyCard();
    const item = textOfTokenLength(200);
    writeField(card, "alternate_greetings", [item, item, item], { locked: false, useAsContext: true, origin: "generated" });
    const gate = validateWrittenField(card, "alternate_greetings", countTokens(fieldText(card.fields.alternate_greetings.value)));
    expect(gate.findings.some((f) => f.validator === "budget")).toBe(false);
    writeField(card, "alternate_greetings", [textOfTokenLength(301)], { locked: false, useAsContext: true, origin: "generated" });
    const over = validateWrittenField(card, "alternate_greetings", 301);
    expect(over.findings.some((f) => f.validator === "budget")).toBe(true);

    const patched = "<<ITEM 1>>\nRain on the pier.\n\nShe waits by the crate.\n<<ITEM 2>>\nNoon sun. She does not wave.";
    const llm = createMockLlm({
      repair: JSON.stringify({ field: "alternate_greetings", patchedText: patched, changed: true }),
    });
    const repaired = await repairField(card, "alternate_greetings", {
      validator: "audit",
      field: "alternate_greetings",
      blocking: true,
      message: "split the greetings",
    }, envFor(llm));
    expect(repaired).toBe(true);
    const items = card.fields.alternate_greetings.value as string[];
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("Rain on the pier.");
    expect(items[0]).toContain("She waits by the crate.");
  });

  it("plan digest serializes arrays with item markers", async () => {
    const card = createEmptyCard();
    lockAll(card);
    writeField(card, "alternate_greetings", ["Rain on the pier.\n\nShe waits.", "Noon sun."], {
      locked: true,
      useAsContext: true,
      origin: "manual",
    });
    let user = "";
    const llm = createMockLlm({
      plan: (req) => {
        user = req.messages.map((m) => m.content).join("\n");
        return JSON.stringify({ ownership: {}, contradictions: [], directives: [] });
      },
      audit: JSON.stringify({ findings: [] }),
    });
    await generateCard(card, { llm });
    expect(user).toContain("<<ITEM 1>>");
    expect(user).toContain("Rain on the pier.");
    expect(user).toContain("She waits.");
    expect(user).not.toContain("Rain on the pier.\n\nShe waits.\nNoon sun.");
  });

  it("still over budget after regenerate is truncated instead of blocked", async () => {
    const budget = FIELD_REGISTRY.description.budgetTokens;
    const over = textOfTokenLength(Math.ceil(budget * 1.01));
    const card = createEmptyCard();
    const llm = createMockLlm({
      description: () => over,
      repair: JSON.stringify({ field: "description", patchedText: over, changed: false }),
    });
    const result = await generateField(card, "description", envFor(llm));
    expect(result.status).toBe("filled");
    expect(countTokens(fieldText(card.fields.description.value))).toBeLessThanOrEqual(budget);
  });

  it("prices fresh input at $0.165 and does not cache the system prompt on the first call", () => {
    expect(priceUSD(1_000_000, 0, 0)).toBeCloseTo(0.165);
    expect(priceUSD(0, 1_000_000, 0)).toBeCloseTo(0.55);
    expect(priceUSD(1_000_000, 0, 1_000_000)).toBeCloseTo(0.033);
    const req = buildRequest({
      route: routeFor("name"),
      stage: "name",
      user: "Name the archivist.",
      cardId: "cost",
      attempt: 1,
    });
    const res = { content: "Mara", provider: "venice", inputTokens: 0, outputTokens: 0, cachedTokens: 99, costUSD: 0 };
    const first = withMeasuredCost({ ...req, systemCacheHit: false }, res);
    const second = withMeasuredCost({ ...req, systemCacheHit: true }, res);
    expect(first.cachedTokens).toBe(0);
    expect(second.cachedTokens).toBeGreaterThan(0);
    expect(first.costUSD).toBeGreaterThan(second.costUSD);
  });

  it("escalation keeps DeepSeek reasoning on", () => {
    const route = escalatedRoute(routeFor("description"));
    expect(route?.model).toBe("deepseek-v4-1-flash-1017-uncensored");
    expect(route?.temperature).toBe(0.35);
    expect(route?.reasoningEffort).toBe("high");
  });

  it("export requires a name and a schema-valid card", () => {
    const empty = createEmptyCard();
    const blocked = exportCard(empty);
    expect(blocked.blocked).toBe(true);
    expect(blocked.reasons.some((r) => r.field === "name")).toBe(true);

    const card = createEmptyCard();
    writeField(card, "name", "Mara Voss", { locked: true, useAsContext: true, origin: "manual" });
    writeField(card, "creator_notes", "Intended user: adults who want a slow scene.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    const ok = exportCard(card);
    expect(ok.blocked).toBe(false);
    expect(ok.envelope?.data.name).toBe("Mara Voss");

    writeField(card, "character_version", "nope", { locked: true, useAsContext: false, origin: "manual" });
    const badVersion = exportCard(card);
    expect(badVersion.blocked).toBe(true);
    expect(badVersion.reasons.some((r) => r.validator === "semver")).toBe(true);
  });

  it("description jargon lint blocks a UI label", () => {
    const card = createEmptyCard();
    writeField(card, "description", "Press the New Chat button to meet her.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    const gate = validateWrittenField(card, "description", countTokens("Press the New Chat button to meet her."));
    expect(gate.pass).toBe(false);
    expect(gate.findings.some((f) => f.validator === "jargon")).toBe(true);
  });
});
