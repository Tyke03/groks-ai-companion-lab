import type { Card, FieldName } from "../domain/card";
import { isEmptyValue } from "../domain/card";
import { STAGE_ORDER } from "../domain/fields";

export type WalkStage = FieldName | "plan" | "audit";

/** Topological authoring order. Group greetings drop out unless this is a group card. */
export function walkStages(card: Card): WalkStage[] {
  const stages: WalkStage[] = ["plan"];
  for (const field of STAGE_ORDER) {
    if (field === "creator") stages.push("audit");
    if (field === "group_only_greetings" && !card.meta.groupCard) continue;
    stages.push(field);
  }
  return stages;
}

export function shouldGenerate(card: Card, field: FieldName): boolean {
  if (field === "creator" || field === "character_version") return false;
  if (field === "group_only_greetings" && !card.meta.groupCard) return false;
  if (card.fields[field].policy.locked) return false;
  return true;
}

export function shouldKeepDerived(card: Card, field: "creator" | "character_version"): boolean {
  return !isEmptyValue(card.fields[field].value);
}
