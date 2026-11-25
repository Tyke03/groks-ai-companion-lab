import { PIPELINE_CONFIG } from "../config/pipeline";
import { INJECTION_GUARD } from "../context/assembler";
import { countTokens } from "../context/budgets";
import type { Card, FieldName } from "../domain/card";
import { fieldText, isEmptyValue } from "../domain/card";
import { writeField } from "../domain/create";
import { LOCK_AFTER_STAGE, STAGE_ORDER } from "../domain/fields";
import { buildRequest, complete } from "../llm/client";
import { parseModelJson, type LlmClient } from "../llm/types";
import { STAGE_PROMPTS } from "../prompts/load";
import { CostGuard } from "../router/cost";
import { escalationBudget } from "../router/escalate";
import { routeFor } from "../router/stages";
import { emit, fnv } from "../telemetry/events";
import { validateQuotes, type QuotePair } from "../validators/quotes";
import { validateSchema } from "../validators/schema";
import { generateField, repairField, type FieldWriteResult, type WriteEnv } from "./generateField";
import { shouldGenerate, shouldKeepDerived, walkStages } from "./dag";

export interface GenerateResult {
  card: Card;
  outcomes: { field: FieldName; status: FieldWriteResult["status"]; provider?: string }[];
  directives: string[];
  aborted: boolean;
  costAborted: boolean;
  costUSD: number;
}

const EMPTY_PLAN = { ownership: {}, contradictions: [], directives: [] as string[] };

async function runPlan(card: Card, env: WriteEnv): Promise<string[]> {
  const digest = STAGE_ORDER.map((name) => {
    const text = fieldText(card.fields[name].value).trim();
    if (!text) return "";
    return `<<SOURCE field="${name}">>\n${text}\n<<END_SOURCE>>`;
  }).filter(Boolean);
  const user = [INJECTION_GUARD, STAGE_PROMPTS.plan, env.brief ? `<<BRIEF>>\n${env.brief}\n<<END_BRIEF>>` : "", ...digest]
    .filter(Boolean)
    .join("\n\n");
  if (env.cost.exhausted || env.control?.aborted) return [];
  try {
    const req = buildRequest({
      route: routeFor("plan"),
      stage: "plan",
      user,
      cardId: env.cardId,
      attempt: 1,
    });
    emit("stage.start", { stage: "plan", field: "plan" });
    const res = await complete(env.llm, req);
    env.cost.add(res.costUSD);
    emit("stage.done", { stage: "plan", field: "plan", tokens: res.inputTokens + res.outputTokens, cost: Number(res.costUSD.toFixed(6)), ms: 0 });
    const parsed = parseModelJson(res.content);
    if (!validateSchema("plan", parsed).pass) return [];
    const directives = (parsed as { directives?: string[] }).directives ?? [];
    return directives.filter((d) => typeof d === "string" && d.trim());
  } catch {
    return EMPTY_PLAN.directives;
  }
}

async function runAudit(card: Card, env: WriteEnv): Promise<void> {
  let cycles = 0;
  while (cycles < PIPELINE_CONFIG.auditCyclesPerCard) {
    cycles += 1;
    if (env.cost.exhausted || env.control?.aborted) return;
    const digest = STAGE_ORDER.map((name) => {
      const text = fieldText(card.fields[name].value).trim();
      if (!text) return "";
      return `<<SOURCE field="${name}">>\n${text}\n<<END_SOURCE>>`;
    }).filter(Boolean);
    const user = [INJECTION_GUARD, STAGE_PROMPTS.audit, ...digest].join("\n\n");
    let parsed: { findings?: QuotePair[] };
    try {
      const req = buildRequest({ route: routeFor("audit"), stage: "audit", user, cardId: env.cardId, attempt: cycles });
      emit("stage.start", { stage: "audit", field: "audit" });
      const res = await complete(env.llm, req);
      env.cost.add(res.costUSD);
      emit("stage.done", { stage: "audit", field: "audit", tokens: res.inputTokens + res.outputTokens, cost: Number(res.costUSD.toFixed(6)), ms: 0 });
      parsed = parseModelJson(res.content) as { findings?: QuotePair[] };
    } catch {
      return;
    }
    if (!validateSchema("audit", parsed).pass) return;
    const findings = parsed.findings ?? [];
    if (findings.length === 0) return;
    const quotes = validateQuotes(card, findings);
    if (quotes.pass) return;
    for (const finding of quotes.findings) {
      emit("validator.fail", {
        validator: "quotes",
        field: finding.field,
        kind: "quotes",
        quoteHash: fnv(finding.quoteA ?? finding.message),
      });
    }
    for (const finding of quotes.findings) {
      const field = finding.field as FieldName;
      if (!card.fields[field]) continue;
      const repaired = await repairField(card, field, finding, env);
      if (repaired === "cost" || repaired === "aborted") return;
    }
    const again = validateQuotes(card, findings);
    if (again.pass) return;
    const stillFake = again.findings.length === findings.length;
    if (stillFake) return;
  }
}

function applyDerived(card: Card, field: "creator" | "character_version", creatorHandle: string): void {
  if (shouldKeepDerived(card, field)) return;
  const value = field === "creator" ? creatorHandle : "1.0.0";
  writeField(card, field, value, { locked: true, useAsContext: false, origin: "manual" });
  card.fields[field].tokens = countTokens(value);
}

export async function generateCard(
  card: Card,
  opts: {
    llm: LlmClient;
    cardId?: string;
    brief?: string;
    creatorHandle?: string;
    planMode?: "always" | "off";
    control?: { aborted: boolean };
    onFieldStart?: (field: FieldName) => void;
    onFieldDone?: (field: FieldName, status: FieldWriteResult["status"], provider?: string) => void;
  },
): Promise<GenerateResult> {
  const env: WriteEnv = {
    llm: opts.llm,
    cardId: opts.cardId ?? "card",
    brief: opts.brief,
    directives: [],
    cost: new CostGuard(),
    escalations: escalationBudget(),
    control: opts.control,
  };
  const outcomes: GenerateResult["outcomes"] = [];
  let aborted = false;
  let costAborted = false;
  const handle = opts.creatorHandle || "companionhub";

  if ((opts.planMode ?? "always") === "always") {
    env.directives = await runPlan(card, env);
    if (env.cost.exhausted) costAborted = true;
  }

  for (const stage of walkStages(card)) {
    if (aborted || costAborted) break;
    if (env.control?.aborted) {
      aborted = true;
      break;
    }
    if (stage === "plan") continue;
    if (stage === "audit") {
      await runAudit(card, env);
      if (env.cost.exhausted) costAborted = true;
      continue;
    }
    const field = stage;
    if (field === "creator" || field === "character_version") {
      applyDerived(card, field, handle);
      outcomes.push({ field, status: "filled" });
      continue;
    }
    if (!shouldGenerate(card, field)) {
      outcomes.push({ field, status: "skipped" });
      continue;
    }
    if (isEmptyValue(card.fields[field].value) && card.fields[field].policy.locked) {
      outcomes.push({ field, status: "skipped" });
      continue;
    }
    opts.onFieldStart?.(field);
    const result = await generateField(card, field, env);
    if (result.status === "filled" && LOCK_AFTER_STAGE.has(field)) {
      card.fields[field].policy.locked = true;
      card.fields[field].policy.useAsContext = true;
    }
    outcomes.push({ field, status: result.status, provider: result.provider });
    opts.onFieldDone?.(field, result.status, result.provider);
    if (result.status === "cost" || env.cost.exhausted) costAborted = true;
    if (env.control?.aborted) aborted = true;
  }

  return {
    card,
    outcomes,
    directives: env.directives,
    aborted,
    costAborted,
    costUSD: env.cost.spent,
  };
}
