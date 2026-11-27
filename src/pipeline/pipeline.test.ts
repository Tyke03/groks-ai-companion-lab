import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { buildContext } from "../context/assembler";
import { TOKEN_BUDGETS } from "../config/budgets";
import { budgetPasses, countTokens, textOfTokenLength } from "../context/budgets";
import { evaluatorBudgets } from "../eval/evaluateCard";
import { parseItems, serializeItems } from "../context/format";
import { createEmptyCard, writeField } from "../domain/create";
import { FIELD_NAMES, fieldText, isEmptyValue, type FieldName, type PlanRecord } from "../domain/card";
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

function planJson(extra: Partial<PlanRecord> = {}): string {
  return JSON.stringify({
    ownership: {},
    tells: ["a glance toward the door", "a pause before the answer", "one hand kept on the rail"],
    beats: { inciting: "the crate shifts between them", opening: "she waits for the first word" },
    voice_rules: ["short sentences", "no comfort offered", "name the object in hand"],
    contradictions: [],
    directives: [],
    ...extra,
  });
}

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
    ownership: {} as PlanRecord["ownership"],
    tells: [] as string[],
    beats: { inciting: "", opening: "" },
    voice_rules: [] as string[],
    contradictions: [] as PlanRecord["contradictions"],
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
    const fromEval = evaluatorBudgets();
    for (const name of FIELD_NAMES) {
      expect(FIELD_REGISTRY[name].budgetTokens).toBe(TOKEN_BUDGETS[name]);
      expect(fromEval[name]).toBe(TOKEN_BUDGETS[name]);
    }
    expect(STAGE_ORDER.indexOf("first_mes")).toBeLessThan(STAGE_ORDER.indexOf("scenario"));
    expect(STAGE_ORDER).toEqual([
      "name",
      "nickname",
      "tags",
      "description",
      "personality",
      "first_mes",
      "scenario",
      "alternate_greetings",
      "group_only_greetings",
      "mes_example",
      "system_prompt",
      "post_history_instructions",
      "creator_notes",
      "creator",
      "character_version",
    ]);
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
      plan: planJson({ ownership: { name: "Lina Kade" }, directives: ["Keep the scar in description."] }),
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
      plan: planJson(),
    });
    const trapped = await convertCharacter(blob, hostile);
    expect(fieldText(trapped.fields.description.value)).not.toContain("[character");
    expect(fieldText(trapped.fields.personality.value)).toBe("She trusts nobody and counts exits.");

    const fromJson = createMockLlm({
      extract: JSON.stringify({ fields }),
      plan: planJson(),
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
      plan: planJson(),
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
      plan: planJson(),
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
      plan: planJson(),
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
        return planJson();
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
    expect(printed.description).toContain("MUST COVER:");
    expect(printed.description).toContain("MUST NOT:");
    expect(printed.description).toContain("LENGTH:");
    expect(printed.description).toContain("POV:");
    expect(printed.description).toContain("BUDGET:");
    expect(printed.description).toContain("body, wardrobe, habitual mannerisms, history, current life circumstances");
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
        return planJson();
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
      plan: planJson({
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
        expect(user).toContain("MUST COVER: the scar");
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
    expect(result.status).toBe("ok");
  });

  it("retries a bad plan once, then aborts plan-failed without writing fields", async () => {
    const card = createEmptyCard();
    const stages: string[] = [];
    let plans = 0;
    const llm = createMockLlm({
      plan: () => {
        plans += 1;
        stages.push("plan");
        return "{";
      },
      name: () => {
        stages.push("name");
        return "Mara";
      },
    });
    const failed = await generateCard(card, { llm });
    expect(plans).toBe(2);
    expect(stages).toEqual(["plan", "plan"]);
    expect(failed.status).toBe("plan-failed");
    expect(failed.aborted).toBe(true);
    expect(isEmptyValue(failed.card.fields.name.value)).toBe(true);

    let retry = 0;
    const control = { aborted: false };
    const second = createMockLlm({
      plan: () => {
        retry += 1;
        return retry === 1 ? "not json" : planJson();
      },
      name: () => {
        control.aborted = true;
        return "Mara Voss";
      },
    });
    const written = await generateCard(createEmptyCard(), { llm: second, control });
    expect(retry).toBe(2);
    expect(written.status).toBe("ok");
    expect(fieldText(written.card.fields.name.value)).toBe("Mara Voss");
  });

  it("injects tells, beats, and voice rules into the field that owns them", async () => {
    const card = createEmptyCard();
    const seen: Record<string, string> = {};
    const capture = (field: string) => (req: LlmRequest) => {
      seen[field] = req.messages.map((m) => m.content).join("\n");
      const bodies: Record<string, string> = {
        personality: "She keeps answers short and watches the door.",
        first_mes: "She sets the crate down.\n\n\"State the hour.\"",
        scenario: "The pier is empty at dusk and the crate sits between them.",
        system_prompt: "Speak in short sentences. Offer no comfort. Name the object in hand.",
        post_history_instructions: "Keep the sentences short.\nLeave the next move open.\nDo not restate the scene.",
      };
      return bodies[field];
    };
    const llm = createMockLlm({
      personality: capture("personality"),
      first_mes: capture("first_mes"),
      scenario: capture("scenario"),
      system_prompt: capture("system_prompt"),
      post_history_instructions: capture("post_history_instructions"),
    });
    const env = {
      ...envFor(llm),
      tells: ["watches the door", "answers in five words", "touches the crate"],
      beats: { inciting: "the crate shifts", opening: "she asks for the hour" },
      voice_rules: ["short sentences", "no comfort", "name the object"],
      ownership: { personality: "she trusts slowly" } as PlanRecord["ownership"],
    };
    await generateField(card, "personality", env);
    await generateField(card, "first_mes", env);
    await generateField(card, "scenario", env);
    await generateField(card, "system_prompt", env);
    await generateField(card, "post_history_instructions", env);
    expect(seen.personality).toContain("TELL INVENTORY (use all of these):\nwatches the door\nanswers in five words\ntouches the crate");
    expect(seen.personality).toContain("MUST COVER: she trusts slowly");
    expect(seen.first_mes).toContain("BEAT:\nthe crate shifts\nshe asks for the hour");
    expect(seen.scenario).toContain("ALREADY WRITTEN — DO NOT RESTAGE:\nthe crate shifts");
    expect(seen.scenario).not.toContain("she asks for the hour");
    expect(seen.system_prompt).toContain("VOICE RULES (tells live in personality; do not restate them):\nshort sentences\nno comfort\nname the object");
    expect(seen.post_history_instructions).toContain("VOICE RULES (tells live in personality; do not restate them):");
    const named = createMockLlm({
      name: (req) => {
        seen.name = req.messages.map((m) => m.content).join("\n");
        return "Mara";
      },
    });
    await generateField(createEmptyCard(), "name", envFor(named));
    expect(seen.name).toContain("MUST COVER: the character's display name");
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
        return planJson();
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
    writeField(card, "description", "A wool coat, a scar through one brow, and a habit of counting exits.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    writeField(card, "personality", "Wary, patient, and slow to trust.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    writeField(card, "scenario", "Rain hits an empty pier at dusk, with a crate between two figures.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    writeField(card, "first_mes", "She sets one hand on the crate.\n\n\"State the hour.\"", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    writeField(card, "mes_example", "<START>\n{{user}}: Who waits?\n{{char}}: Count the exits.\n<START>\n{{user}}: The hour is late.\n{{char}}: Then start with the date.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
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

  it("description does not run the jargon denylist", () => {
    const card = createEmptyCard();
    writeField(card, "description", "Press the New Chat button to meet her.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    const gate = validateWrittenField(card, "description", countTokens("Press the New Chat button to meet her."));
    expect(gate.findings.some((f) => f.validator === "jargon")).toBe(false);
  });

  it("personality allows when, and blocks you", () => {
    const card = createEmptyCard();
    writeField(card, "personality", "She waits when the room goes quiet.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    expect(validateWrittenField(card, "personality", 20).pass).toBe(true);
    writeField(card, "personality", "She tells you to wait.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    const blocked = validateWrittenField(card, "personality", 20);
    expect(blocked.findings.some((f) => f.validator === "agency")).toBe(true);
  });

  it("structural gates catch a name, second person, an empty ref, overlap, repeated phrasing, and a long reminder", () => {
    const card = createEmptyCard();
    writeField(card, "name", "Relay", { locked: true, useAsContext: true, origin: "manual" });
    writeField(card, "description", "Relay keeps a copper coil in one pocket.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    expect(validateWrittenField(card, "description", 20).findings.some((f) => f.validator === "macro")).toBe(true);

    writeField(card, "description", "{{user}}: Relay keeps the coil.\nA copper coil sits in one pocket.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    expect(validateWrittenField(card, "description", 20).findings.some((f) => f.validator === "macro")).toBe(false);

    writeField(card, "scenario", "You stand in the bay.", { locked: false, useAsContext: true, origin: "generated" });
    expect(validateWrittenField(card, "scenario", 20).findings.some((f) => f.validator === "pov")).toBe(true);

    writeField(card, "first_mes", "She looks up. \"You dropped the coil.\"", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    expect(validateWrittenField(card, "first_mes", 20).findings.some((f) => f.validator === "pov")).toBe(false);
    writeField(card, "first_mes", "She looks up. You dropped the coil.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    expect(validateWrittenField(card, "first_mes", 20).findings.some((f) => f.validator === "pov")).toBe(true);

    writeField(card, "system_prompt", "Use the personality field for temper.", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    expect(validateWrittenField(card, "system_prompt", 20).findings.some((f) => f.validator === "refs")).toBe(true);

    const shared = "The copper coil hums beside the open hatch.";
    writeField(card, "first_mes", shared, { locked: false, useAsContext: true, origin: "generated" });
    writeField(card, "scenario", shared, { locked: false, useAsContext: true, origin: "generated" });
    expect(validateWrittenField(card, "scenario", 20).findings.some((f) => f.validator === "overlap")).toBe(true);

    const phrase = "alpha bravo charlie delta echo foxtrot";
    writeField(card, "description", phrase, { locked: false, useAsContext: true, origin: "generated" });
    writeField(card, "personality", phrase, { locked: false, useAsContext: true, origin: "generated" });
    expect(validateWrittenField(card, "personality", 20).findings.some((f) => f.validator === "ngram")).toBe(true);

    writeField(card, "post_history_instructions", "one\ntwo\nthree\nfour\nfive", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    expect(validateWrittenField(card, "post_history_instructions", 20).findings.some((f) => f.validator === "phi")).toBe(true);
    writeField(card, "post_history_instructions", "- one\n- two\n- three\n- four", {
      locked: false,
      useAsContext: true,
      origin: "generated",
    });
    expect(validateWrittenField(card, "post_history_instructions", 20).findings.some((f) => f.validator === "phi")).toBe(true);
  });

  it("keeps the last attempt when a field stays blocked", async () => {
    const card = createEmptyCard();
    writeField(card, "name", "Relay", { locked: true, useAsContext: true, origin: "manual" });
    const llm = createMockLlm({
      description: "Relay stands beside the hatch.",
      repair: JSON.stringify({ field: "description", patchedText: "Relay stands beside the hatch.", changed: false }),
    });
    const result = await generateField(card, "description", envFor(llm));
    expect(result.status).toBe("blocked");
    expect(fieldText(card.fields.description.value)).toContain("stands beside the hatch");
  });
});

const COLD_FIXTURES = {
  relay: {
    name: "Relay",
    nickname: "Rel",
    fact: "a spare cable loops at one hip",
    tells: ["taps the hatch glass", "hides worry behind procedure", "names the failing part", "checks the seal twice"],
    beats: { inciting: "pressure drops in bay seven", opening: "ask for the fault code" },
    voice: ["short diagnostics", "name the failing part", "no comfort"],
    directive: "Keep the cable in the dossier.",
    tags: ["android", "diagnostic", "orbital", "gantry", "terse", "maintenance", "night-shift", "protocol", "machine", "solo", "pressure", "technical"],
    description: "Copper coils line a humming bulkhead. A glass visor fogs, then clears. Spare cable loops at one hip.",
    personality: "Curious about faults, terse with passengers, and quick to hide worry behind procedure.",
    first_mes: "One gloved hand taps the hatch glass.\n\n\"State the fault code.\"",
    scenario: "Midnight on an orbital gantry. Pressure drops in bay seven. A lone maintenance unit waits by the sealed door.",
    greetings: [
      "A status lamp flips from amber to red.\n\n\"Bay seven is losing air.\"",
      "The visor clears.\n\n\"Hold the rail. The gantry is slick.\"",
    ],
    mes_example: "<START>\n{{user}}: The lamp is red.\n{{char}}: Bay seven is open to vacuum.\n<START>\n{{user}}: What failed?\n{{char}}: The seal, not the coil.",
    system_prompt: "Answer as a maintenance unit. Prefer short diagnostics. Name the failing part. Leave the next action to the visitor.",
    post_history_instructions: "Log the fault before any reply.\nKeep answers under two sentences.\nLeave the next diagnostic open.",
    creator_notes: "Intended user: readers who want a terse machine partner.\nThe unit starts already on duty.",
  },
  isolde: {
    name: "Isolde",
    nickname: "Iss",
    fact: "a locket that stays cold",
    tells: ["sets a teacup down", "will not admit the house feels occupied", "offers one memory", "leaves no dust"],
    beats: { inciting: "frost coats the parlour window", opening: "say the corridor was not empty" },
    voice: ["soft complete sentences", "memory rather than advice", "stop when the question is answered"],
    directive: "Keep the locket in the dossier.",
    tags: ["ghost", "mourning", "manor", "gaslight", "polite", "widow", "frost", "parlour", "victorian", "haunting", "quiet", "lace"],
    description: "Grey silk, lace cuffs, and a locket that stays cold. Footsteps leave no dust on the rug.",
    personality: "Polite in company, grieving in private, and unwilling to admit the house still feels occupied.",
    first_mes: "A pale hand sets a teacup on the saucer.\n\n\"The corridor was not empty.\"",
    scenario: "Gaslight flickers in a locked parlour after midnight. Frost coats the inside of the window. One chair faces the hearth.",
    greetings: [
      "The locket clicks open, then shut.\n\n\"Someone walked the east stair.\"",
      "Frost spreads across the pane.\n\n\"Stay by the hearth.\"",
    ],
    mes_example: "<START>\n{{user}}: Who walked the stair?\n{{char}}: A guest who never arrived.\n<START>\n{{user}}: Is the parlour safe?\n{{char}}: The chair is, if one sits quietly.",
    system_prompt: "Speak softly and in complete sentences. Offer memory rather than advice. Stop once the question is answered.",
    post_history_instructions: "Keep the voice soft.\nOffer one memory, then wait.\nStop before a second death.",
    creator_notes: "Intended user: readers who want a quiet haunting.\nThe figure is already in the parlour.",
  },
  kenji: {
    name: "Kenji",
    nickname: "Ken",
    fact: "a scuffed bag on the desk",
    tells: ["snaps the notebook shut", "insults before helping", "shows embarrassment when noticed", "pulls one earbud out"],
    beats: { inciting: "club hours end on the roof", opening: "tell the newcomer to sit elsewhere" },
    voice: ["barb first", "help on the second beat", "no speech"],
    directive: "Keep the bag in the dossier.",
    tags: ["tsundere", "classmate", "rooftop", "modern", "prickly", "school", "banter", "loyal", "city", "after-club", "blazer", "sharp"],
    description: "A wrinkled shirt under a school blazer, one earbud in, a scuffed bag dropped on the desk.",
    personality: "Insults first, help second, and visible embarrassment when either one is noticed.",
    first_mes: "A notebook snaps shut.\n\n\"Sit somewhere else.\"",
    scenario: "A rooftop garden after club hours. Wind lifts the laundry lines. One student pretends to read.",
    greetings: [
      "The bag hits the bench.\n\n\"This spot was empty a minute ago.\"",
      "Earbuds come out.\n\n\"Chapter four is the one that matters.\"",
    ],
    mes_example: "<START>\n{{user}}: Is this seat free?\n{{char}}: It was.\n<START>\n{{user}}: Chapter four is confusing.\n{{char}}: Then read the example, not the notes.",
    system_prompt: "Snap first, then help. Keep the barbs short. Explain the kindness only after a second ask.",
    post_history_instructions: "Barb first.\nHelp on the second beat.\nStop before a speech.",
    creator_notes: "Intended user: readers who want prickly classmate banter.\nThe student is already on the roof.",
  },
} as const;

function coldReplies(key: keyof typeof COLD_FIXTURES, repairs: string[]) {
  const card = COLD_FIXTURES[key];
  return {
    plan: planJson({
      ownership: { description: card.fact },
      tells: [...card.tells],
      beats: card.beats,
      voice_rules: [...card.voice],
      directives: [card.directive],
    }),
    name: card.name,
    nickname: card.nickname,
    tags: JSON.stringify({ tags: [...card.tags], character_version: "1.0.0" }),
    description: card.description,
    personality: card.personality,
    first_mes: card.first_mes,
    scenario: card.scenario,
    alternate_greetings: JSON.stringify({ items: [...card.greetings] }),
    mes_example: card.mes_example,
    system_prompt: card.system_prompt,
    post_history_instructions: card.post_history_instructions,
    creator_notes: card.creator_notes,
    audit: JSON.stringify({ findings: [] }),
    repair: (req: LlmRequest) => {
      repairs.push(req.messages.map((message) => message.content).join("\n"));
      return JSON.stringify({ field: "description", patchedText: card.description, changed: false });
    },
  };
}

describe("one-shot cold fixtures", () => {
  for (const key of ["relay", "isolde", "kenji"] as const) {
    it(`${key} passes every gate on the first attempt`, async () => {
      const repairs: string[] = [];
      const result = await generateCard(createEmptyCard(), { llm: createMockLlm(coldReplies(key, repairs)) });
      expect(repairs, repairs.join("\n\n")).toEqual([]);
      expect(result.status).toBe("ok");
      const failed = result.outcomes.filter((outcome) => outcome.status === "blocked" || outcome.status === "cost");
      expect(failed).toEqual([]);
      for (const name of FIELD_NAMES) {
        if (isEmptyValue(result.card.fields[name].value)) continue;
        const gate = validateWrittenField(result.card, name, result.card.fields[name].tokens);
        expect(gate.findings, `${name}: ${gate.findings.map((f) => f.message).join("; ")}`).toEqual([]);
      }
      expect(validateBleed(result.card).pass).toBe(true);
    });

    it(`${key} exports with no blocks and no repairs`, async () => {
      const repairs: string[] = [];
      const result = await generateCard(createEmptyCard(), { llm: createMockLlm(coldReplies(key, repairs)) });
      const exported = exportCard(result.card, { costUSD: result.costUSD });
      expect(repairs, repairs.join("\n\n")).toEqual([]);
      expect(exported.reasons).toEqual([]);
      expect(exported.blocked).toBe(false);
    });
  }
});
