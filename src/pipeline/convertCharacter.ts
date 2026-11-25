import { INJECTION_GUARD } from "../context/assembler";
import type { Card, CardMeta, FieldName } from "../domain/card";
import { createEmptyCard } from "../domain/create";
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

/** Sniff, extract, redistribute. Content fields land unlocked, included, and marked imported_raw. */
export async function convertCharacter(
  raw: string,
  llm: LlmClient,
  meta: Partial<CardMeta> = {},
): Promise<Card> {
  const format = sniff(raw);
  const card = createEmptyCard({ ...meta, sourceFormat: format });
  const user = [INJECTION_GUARD, STAGE_PROMPTS.extract, `<<SOURCE field="blob">>\n${raw}\n<<END_SOURCE>>`].join("\n\n");
  const req = buildRequest({ route: routeFor("extract"), stage: "extract", user, cardId: "import", attempt: 1 });
  const live = await complete(llm, req);
  const parsed = parseModelJson(live.content) as { fields: Partial<Record<FieldName, ExtractCandidate>> };
  if (!validateSchema("extract", parsed).pass) throw new Error("extract schema failed");
  redistribute(card, parsed.fields);
  return card;
}
