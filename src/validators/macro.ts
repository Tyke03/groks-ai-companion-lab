import type { Card, FieldName } from "../domain/card";
import { fieldText } from "../domain/card";
import type { GateResult } from "./types";
import { gate } from "./types";

const MACRO_FIELDS = new Set<FieldName>([
  "description",
  "personality",
  "scenario",
  "first_mes",
  "alternate_greetings",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
]);

function withoutUserLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/\{\{user\}\}\s*:/i.test(line))
    .join("\n");
}

/** Blocking when the card's own name appears outside a {{user}}: line. */
export function validateMacro(card: Card, field: FieldName, text: string): GateResult {
  if (!MACRO_FIELDS.has(field)) return gate([]);
  const name = fieldText(card.fields.name.value).trim();
  if (!name) return gate([]);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hit = new RegExp(`\\b${escaped}\\b`, "i").test(withoutUserLines(text));
  if (!hit) return gate([]);
  return gate([
    {
      validator: "macro",
      field,
      blocking: true,
      message: "literal name outside a {{user}}: line",
    },
  ]);
}
