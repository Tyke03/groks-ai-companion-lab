import type { Card, FieldName } from "../domain/card";
import { buildContext } from "../context/assembler";
import { STAGE_ORDER } from "../domain/fields";
import { STAGE_PROMPTS } from "../prompts/load";
import { routeFor } from "../router/stages";

/** Full assembled user turn for every model stage, with no model call. */
export function dryRun(card: Card): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of STAGE_ORDER) {
    const route = routeFor(field);
    if (route.code) continue;
    if (field === "group_only_greetings" && !card.meta.groupCard) continue;
    out[field] = buildContext(field, card, STAGE_PROMPTS[field] ?? "");
  }
  return out;
}

export function targetIsExcluded(context: string, field: FieldName): boolean {
  const before = context.split("<<FIELD_CONTRACT>>")[0] ?? "";
  return !new RegExp(`^### ${field}$`, "m").test(before);
}
