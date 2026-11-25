import { INJECTION_GUARD } from "../context/assembler";
import type { Card, CardMeta, FieldName, PlanRecord } from "../domain/card";
import { fieldText, isEmptyValue } from "../domain/card";
import { createEmptyCard, writeField } from "../domain/create";
import { buildRequest, complete } from "../llm/client";
import { parseModelJson, type LlmClient } from "../llm/types";
import { STAGE_PROMPTS } from "../prompts/load";
import { routeFor } from "../router/stages";
import { validateSchema } from "../validators/schema";
import { redistribute, type ExtractCandidate } from "./redistribute";

export type SourceFormat = "v1" | "v2" | "wpp" | "raw";

export function sniff(raw: string): SourceFormat {
  const text = raw.trim();
  if (/\[\s*character\s*\(/i.test(text) || /\bMind\s*\(/i.test(text)) return "wpp";
  try {
    const parsed = JSON.parse(text) as { spec?: string; name?: string; description?: string; data?: { name?: string } };
    if (parsed.spec === "chara_card_v2" || parsed.spec === "chara_card_v3") return "v2";
    if (parsed.name || parsed.description || parsed.data?.name) return "v1";
  } catch {
    return "raw";
  }
  return "raw";
}

function nameFromRaw(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { name?: unknown; data?: { name?: unknown } };
    const name = parsed.data?.name ?? parsed.name;
    return typeof name === "string" ? name.trim() : "";
  } catch {
    return "";
  }
}

function asPlan(parsed: unknown): PlanRecord | null {
  if (!validateSchema("plan", parsed).pass) return null;
  const body = parsed as PlanRecord;
  const ownership: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.ownership ?? {})) {
    if (typeof value === "string" && value.trim()) ownership[key] = value.trim();
  }
  return {
    ownership,
    contradictions: Array.isArray(body.contradictions) ? body.contradictions : [],
    directives: (body.directives ?? []).filter((item) => typeof item === "string" && item.trim()),
  };
}

/** Sniff, extract, plan, then redistribute. Content fields land unlocked, included, and marked imported_raw. */
export async function convertCharacter(
  raw: string,
  llm: LlmClient,
  meta: Partial<CardMeta> = {},
): Promise<Card> {
  const format = sniff(raw);
  const card = createEmptyCard({ ...meta, sourceFormat: format });
  let systemCacheHit = false;
  const extractUser = [INJECTION_GUARD, STAGE_PROMPTS.extract, `<<SOURCE field="blob">>\n${raw}\n<<END_SOURCE>>`].join("\n\n");
  const extractReq = buildRequest({
    route: routeFor("extract"),
    stage: "extract",
    user: extractUser,
    cardId: "import",
    attempt: 1,
    systemCacheHit,
  });
  const live = await complete(llm, extractReq);
  systemCacheHit = true;
  const parsed = parseModelJson(live.content) as { fields: Partial<Record<FieldName, ExtractCandidate>> };
  if (!validateSchema("extract", parsed).pass) throw new Error("extract schema failed");

  const planUser = [
    INJECTION_GUARD,
    STAGE_PROMPTS.plan,
    `<<SOURCE field="blob">>\n${raw}\n<<END_SOURCE>>`,
    `<<SOURCE field="extract">>\n${JSON.stringify(parsed.fields)}\n<<END_SOURCE>>`,
  ].join("\n\n");
  try {
    const planReq = buildRequest({
      route: routeFor("plan"),
      stage: "plan",
      user: planUser,
      cardId: "import",
      attempt: 1,
      systemCacheHit,
    });
    const planned = await complete(llm, planReq);
    card.meta.plan = asPlan(parseModelJson(planned.content)) ?? undefined;
  } catch {
    card.meta.plan = undefined;
  }

  redistribute(card, parsed.fields);
  if (isEmptyValue(card.fields.name.value)) {
    const named = nameFromRaw(raw);
    if (named) {
      writeField(card, "name", named, { locked: false, useAsContext: true, origin: "imported_raw" });
    }
  }
  const description = fieldText(card.fields.description.value).trim();
  const source = raw.trim();
  if (description && (description === source || (source.includes(description) && description.length >= source.length * 0.85))) {
    writeField(card, "description", "", { locked: false, useAsContext: true, origin: "generated" });
  }
  return card;
}
