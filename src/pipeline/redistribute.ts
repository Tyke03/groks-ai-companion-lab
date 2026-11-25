import type { Card, FieldName } from "../domain/card";
import { writeField } from "../domain/create";
import { countTokens } from "../context/budgets";
import { fieldText } from "../domain/card";

export interface ExtractCandidate {
  value: string;
  confidence: number;
  sourceSpans?: string[];
}

const SPLIT_FIELDS: FieldName[] = [
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
];

/** Move extracted candidates onto their owners. Description never keeps the raw blob. */
export function redistribute(card: Card, fields: Partial<Record<FieldName, ExtractCandidate>>): void {
  for (const name of SPLIT_FIELDS) {
    const cand = fields[name];
    if (!cand || cand.confidence < 0.5 || !cand.value.trim()) continue;
    writeField(card, name, cand.value.trim(), {
      locked: false,
      useAsContext: true,
      origin: "imported_raw",
    });
    card.fields[name].tokens = countTokens(fieldText(card.fields[name].value));
  }
}
