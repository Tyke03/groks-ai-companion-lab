import { PIPELINE_CONFIG } from "../config/pipeline";
import { buildContext } from "../context/assembler";
import { countTokens, truncateToBudget } from "../context/budgets";
import { parseItems, renderFieldBody } from "../context/format";
import type { Card, FieldName, PlanRecord } from "../domain/card";
import { FIELD_REGISTRY } from "../domain/fields";
import { writeField } from "../domain/create";
import { buildRequest, complete } from "../llm/client";
import { parseModelJson, type LlmClient } from "../llm/types";
import { STAGE_PROMPTS } from "../prompts/load";
import type { CostGuard } from "../router/cost";
import { escalatedRoute, type EscalationBudget } from "../router/escalate";
import { routeFor, type StageRoute } from "../router/stages";
import { emit, fnv } from "../telemetry/events";
import { balanceMarkdown } from "../validators/markdown";
import { validateSchema, type SchemaName } from "../validators/schema";
import { validateWrittenField } from "../validators/fieldGate";
import type { Finding } from "../validators/types";

export interface FieldWriteResult {
  status: "filled" | "blocked" | "skipped" | "cost";
  provider?: string;
  findings: Finding[];
}

export interface WriteEnv {
  llm: LlmClient;
  cardId: string;
  brief?: string;
  directives: string[];
  ownership: Record<string, string>;
  contradictions: PlanRecord["contradictions"];
  cost: CostGuard;
  escalations: EscalationBudget;
  control?: { aborted: boolean };
  /** False until this card has paid for the system prompt once. */
  systemCacheHit: boolean;
}

function userTurn(card: Card, field: FieldName, note: string, ownership: Record<string, string>): string {
  const extra = [STAGE_PROMPTS[field] ?? "", note].filter(Boolean).join("\n");
  return buildContext(field, card, extra, ownership);
}

function withBrief(text: string, env: WriteEnv): string {
  const parts = [text];
  const lines = [
    ...env.directives.map((d) => `- ${d}`),
    ...env.contradictions.map(
      (item) => `- contradiction ${item.a} vs ${item.b} (${item.kind ?? "conflict"}): "${item.quoteA}" / "${item.quoteB}"`,
    ),
  ];
  if (lines.length) parts.push(`<<PLAN>>\n${lines.join("\n")}\n<<END_PLAN>>`);
  if (env.brief?.trim()) parts.push(`<<BRIEF>>\n${env.brief.trim()}\n<<END_BRIEF>>`);
  return parts.join("\n\n");
}

function applyParsed(field: FieldName, content: string): string | string[] {
  const route = routeFor(field);
  if (!route.schema) return balanceMarkdown(content.trim());
  const parsed = parseModelJson(content);
  const check = validateSchema(route.schema, parsed);
  if (!check.pass) throw new Error(check.findings[0]?.message || "schema");
  if (route.schema === "greetings") {
    const items = (parsed as { items: string[] }).items.map((item) => balanceMarkdown(item.trim())).filter(Boolean);
    return items;
  }
  if (route.schema === "derive") {
    const tags = (parsed as { tags: string[] }).tags.map((t) => t.trim()).filter(Boolean);
    return tags;
  }
  return balanceMarkdown(content.trim());
}

function remember(card: Card, field: FieldName, value: string | string[]): number {
  writeField(card, field, value, { origin: "generated" });
  const tokens = countTokens(renderFieldBody(value));
  card.fields[field].tokens = tokens;
  return tokens;
}

function applyTruncation(card: Card, field: FieldName): void {
  const budget = FIELD_REGISTRY[field].budgetTokens;
  const value = card.fields[field].value;
  if (Array.isArray(value)) {
    remember(card, field, value.map((item) => truncateToBudget(item, budget)));
    return;
  }
  remember(card, field, truncateToBudget(value, budget));
}

async function callStage(
  env: WriteEnv,
  route: StageRoute,
  stage: string,
  field: string | undefined,
  user: string,
  attempt: number,
): Promise<{ content: string; provider: string } | "cost" | "aborted"> {
  if (env.control?.aborted) return "aborted";
  if (env.cost.exhausted) return "cost";
  const started = Date.now();
  emit("stage.start", { stage, field: field ?? stage });
  const req = buildRequest({
    route,
    stage,
    field,
    user,
    cardId: env.cardId,
    attempt,
    systemCacheHit: env.systemCacheHit,
  });
  const res = await complete(env.llm, req);
  env.systemCacheHit = true;
  const crossed = env.cost.add(res.costUSD);
  emit("stage.done", {
    stage,
    field: field ?? stage,
    tokens: res.inputTokens + res.outputTokens,
    cost: Number(res.costUSD.toFixed(6)),
    ms: Date.now() - started,
  });
  if (crossed) return "cost";
  return { content: res.content, provider: res.provider };
}

function emitFail(field: string, finding: Finding): void {
  emit("validator.fail", {
    validator: finding.validator,
    field,
    kind: finding.kind ?? finding.validator,
    quoteHash: fnv(`${finding.quoteA ?? ""}|${finding.message}`),
  });
  if (finding.validator === "budget") emit("budget.hardfail", { field });
}

export async function generateField(card: Card, field: FieldName, env: WriteEnv): Promise<FieldWriteResult> {
  const base = routeFor(field);
  let note = "";
  let route = base;
  let attempt = 1;
  let repaired = false;
  let regenerated = false;
  let escalated = false;
  let lastFindings: Finding[] = [];

  const runOnce = async (): Promise<{ status: FieldWriteResult["status"]; provider?: string; findings: Finding[] }> => {
    const user = withBrief(userTurn(card, field, note, env.ownership), env);
    const called = await callStage(env, route, field, field, user, attempt);
    attempt += 1;
    if (called === "aborted") return { status: "skipped", findings: [] };
    if (called === "cost") return { status: "cost", findings: [] };
    let value: string | string[];
    try {
      value = applyParsed(field, called.content);
    } catch (err) {
      const finding: Finding = {
        validator: "schema",
        field,
        blocking: true,
        message: err instanceof Error ? err.message : String(err),
      };
      emitFail(field, finding);
      return { status: "blocked", provider: called.provider, findings: [finding] };
    }
    const tokens = remember(card, field, value);
    const gate = validateWrittenField(card, field, tokens);
    if (!gate.pass) gate.findings.forEach((f) => emitFail(field, f));
    return { status: gate.pass ? "filled" : "blocked", provider: called.provider, findings: gate.findings };
  };

  let outcome = await runOnce();
  if (outcome.status !== "blocked") return outcome;
  lastFindings = outcome.findings;

  if (!repaired && PIPELINE_CONFIG.repairsPerField > 0) {
    repaired = true;
    const repair = await repairField(card, field, lastFindings[0], env);
    if (repair === "cost") return { status: "cost", findings: lastFindings };
    if (repair === "aborted") return { status: "skipped", findings: [] };
    if (repair) {
      const tokens = card.fields[field].tokens;
      const gate = validateWrittenField(card, field, tokens);
      if (gate.pass) return { status: "filled", provider: outcome.provider, findings: [] };
      lastFindings = gate.findings;
      gate.findings.forEach((f) => emitFail(field, f));
    }
  }

  if (!regenerated) {
    regenerated = true;
    note = `tighten, target ${Math.round(PIPELINE_CONFIG.regenerateTarget * 100)}% of budget`;
    outcome = await runOnce();
    if (outcome.status !== "blocked") return outcome;
    lastFindings = outcome.findings;
  }

  if (!escalated && env.escalations.left > 0) {
    const next = escalatedRoute(route);
    if (next) {
      escalated = true;
      env.escalations.left -= 1;
      route = next;
      emit("escalation", { field, model: next.model });
      outcome = await runOnce();
      if (outcome.status !== "blocked") return outcome;
      lastFindings = outcome.findings;
    }
  }

  if (lastFindings.some((finding) => finding.blocking && finding.validator === "budget")) {
    applyTruncation(card, field);
    const gate = validateWrittenField(card, field, card.fields[field].tokens);
    if (gate.pass) return { status: "filled", provider: outcome.provider, findings: [] };
    lastFindings = gate.findings;
  }

  return { status: "blocked", provider: outcome.provider, findings: lastFindings };
}

/** Repair sees the field body and the finding only. No card context. */
export async function repairField(
  card: Card,
  field: FieldName,
  finding: Finding | undefined,
  env: WriteEnv,
): Promise<boolean | "cost" | "aborted"> {
  if (!finding) return false;
  emit("repair.attempt", { field, validator: finding.validator });
  const body = renderFieldBody(card.fields[field].value);
  const user = [
    STAGE_PROMPTS.repair,
    `FIELD: ${field}`,
    "BODY:",
    body,
    `FINDING: ${finding.message}`,
    FIELD_REGISTRY[field].format === "array"
      ? "Array fields stay inside <<ITEM n>> markers. A blank line inside an item is part of that item."
      : "",
    "Return JSON with field, patchedText, and changed.",
  ].filter(Boolean).join("\n");
  if (user.includes("<<TIER_A>>") || user.includes("<<FIELD_CONTRACT>>")) {
    throw new Error("repair prompt leaked card context");
  }
  const called = await callStage(env, routeFor("repair"), "repair", field, user, 1);
  if (called === "cost" || called === "aborted") return called;
  let parsed: { field?: string; patchedText?: string; changed?: boolean };
  try {
    parsed = parseModelJson(called.content) as { field?: string; patchedText?: string; changed?: boolean };
  } catch {
    return false;
  }
  const check = validateSchema("repair" as SchemaName, parsed);
  if (!check.pass || parsed.changed !== true || typeof parsed.patchedText !== "string") return false;
  const def = FIELD_REGISTRY[field];
  const value = def.format === "array"
    ? parseItems(parsed.patchedText).map((item) => balanceMarkdown(item.trim())).filter(Boolean)
    : balanceMarkdown(parsed.patchedText.trim());
  const tokens = remember(card, field, value);
  card.fields[field].tokens = tokens;
  return true;
}
