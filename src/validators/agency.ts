import type { FieldName } from "../domain/card";
import { GREETING_FIELDS } from "../domain/fields";
import type { GateResult } from "./types";
import { gate } from "./types";

const PERSONALITY = /\b(if|when)\b|\{\{user\}\}/i;
const IMPERATIVE = /\byou\s+(must|should|need to|have to)\b|\b(do not|don't)\b/i;

const IMPERATIVE_EXEMPT = new Set<FieldName>([
  ...GREETING_FIELDS,
  "mes_example",
  "system_prompt",
  "post_history_instructions",
]);

export function validateAgency(field: FieldName, text: string): GateResult {
  if (field === "personality" && PERSONALITY.test(text)) {
    return gate([
      {
        validator: "agency",
        field,
        blocking: true,
        kind: "agency",
        message: "personality gives the player a script or names {{user}}",
      },
    ]);
  }
  if (!IMPERATIVE_EXEMPT.has(field) && IMPERATIVE.test(text)) {
    return gate([
      {
        validator: "agency",
        field,
        blocking: true,
        kind: "agency",
        message: "second-person imperative outside a greeting or mechanics field",
      },
    ]);
  }
  return gate([]);
}
