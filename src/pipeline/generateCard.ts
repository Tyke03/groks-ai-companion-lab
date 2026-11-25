import { PIPELINE_CONFIG } from "../config/pipeline";
import { INJECTION_GUARD } from "../context/assembler";
import { countTokens } from "../context/budgets";
import { renderFieldBody } from "../context/format";
import type { Card, FieldName, PlanRecord } from "../domain/card";
import { isEmptyValue } from "../domain/card";
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
import type { Finding } from "../validators/types";
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

const EMPTY_PLAN: PlanRecord = { ownership: {}, contradictions: [], directives: [] };

function digest(card: Card): string[] {
  return STAGE_ORDER.map((name) => {
    const value = card.fields[name].value;
    if (isEmptyValue(value)) return "";
    const text = renderFieldBody(value).trim();
    if (!text) return "";
    return `<<SOURCE field="${name}">>\n${text}\n<<END_SOURCE>>`;
  }).filter(Boolean);
}

function asPlan(parsed: unknown): PlanRecord {
  const body = parsed as {
    ownership?: Record<string, unknown>;
    contradictions?: QuotePair[];
    directives?: unknown[];
  };
  const ownership: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.ownership ?? {})) {
    if (typeof value === "string" && value.trim()) ownership[key] = value.trim();
  }
  const contradictions = (body.contradictions ?? []).filter(
    (item) => item && typeof item.quoteA === "string" && typeof item.quoteB === "string" && typeof item.a === "string",
  );
  const directives = (body.directives ?? []).filter((d): d is string => typeof d === "string" && d.trim().length > 0);
  return { ownership, contradictions, directives };
}

async function runPlan(card: Card, env: WriteEnv): Promise<PlanRecord> {
  const user = [INJECTION_GUARD, STAGE_PROMPTS.plan, env.brief ? `<<BRIEF>>\n${env.brief}\n<<END_BRIEF>>` : "", ...digest(card)]
    .filter(Boolean)
    .join("\n\n");
  if (env.cost.exhausted || env.control?.aborted) return EMPTY_PLAN;
  try {
    const req = buildRequest({
      route: routeFor("plan"),
      stage: "plan",
      user,
      cardId: env.cardId,
      attempt: 1,
      systemCacheHit: env.systemCacheHit,
    });
    emit("stage.start", { stage: "plan", field: "plan" });
    const res = await complete(env.llm, req);
    env.systemCacheHit = true;
    env.cost.add(res.costUSD);
    emit("stage.done", { stage: "plan", field: "plan", tokens: res.inputTokens + res.outputTokens, cost: Number(res.costUSD.toFixed(6)), ms: 0 });
    const parsed = parseModelJson(res.content);
    if (!validateSchema("plan", parsed).pass) return EMPTY_PLAN;
    return asPlan(parsed);
  } catch {
    return EMPTY_PLAN;
  }
}

async function runAudit(card: Card, env: WriteEnv): Promise<void> {
  let cycles = 0;
  while (cycles < PIPELINE_CONFIG.auditCyclesPerCard) {
    cycles += 1;
    if (env.cost.exhausted || env.control?.aborted) return;
    const user = [INJECTION_GUARD, STAGE_PROMPTS.audit, ...digest(card)].join("\n\n");
    let parsed: { findings?: QuotePair[] };
    try {
      const req = buildRequest({
        route: routeFor("audit"),
        stage: "audit",
        user,
        cardId: env.cardId,
        attempt: cycles,
        systemCacheHit: env.systemCacheHit,
      });
      emit("stage.start", { stage: "audit", field: "audit" });
      const res = await complete(env.llm, req);
      env.systemCacheHit = true;
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
    for (const finding of quotes.findings) {
      emit("validator.fail", {
        validator: "quotes",
        field: finding.field,
        kind: "quotes",
        quoteHash: fnv(finding.quoteA ?? finding.message),
      });
    }
    const valid = findings.filter((finding) => !quotes.findings.some((quoted) => quoted.quoteA === finding.quoteA));
    if (!valid.length) return;
    for (const finding of valid) {
      const field = finding.a as FieldName;
      if (!card.fields[field]) continue;
      const repairFinding: Finding = {
        validator: "audit",
        field,
        otherField: finding.b,
        blocking: true,
        kind: finding.kind,
        quoteA: finding.quoteA,
        quoteB: finding.quoteB,
        message: finding.fix || finding.kind || "contradiction",
      };
      const repaired = await repairField(card, field, repairFinding, env);
      if (repaired === "cost" || repaired === "aborted") return;
    }
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
    directives: card.meta.plan?.directives ?? [],
    ownership: { ...(card.meta.plan?.ownership ?? {}) },
    contradictions: [...(card.meta.plan?.contradictions ?? [])],
    cost: new CostGuard(),
    escalations: escalationBudget(),
    control: opts.control,
    systemCacheHit: false,
  };
  const outcomes: GenerateResult["outcomes"] = [];
  let aborted = false;
  let costAborted = false;
  const handle = opts.creatorHandle || "companionhub";

  if ((opts.planMode ?? "always") === "always") {
    const plan = await runPlan(card, env);
    env.directives = plan.directives;
    env.ownership = plan.ownership;
    env.contradictions = plan.contradictions;
    card.meta.plan = plan;
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
