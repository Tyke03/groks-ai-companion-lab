import type { Card, FieldName } from "../domain/card";
import { isEmptyValue } from "../domain/card";
import type { Finding, GateResult } from "./types";
import { gate } from "./types";

const REFS = ["personality", "description", "scenario"] as const;

/** Blocking when system_prompt names a field that is still empty. */
export function validateRefs(card: Card, field: FieldName, text: string): GateResult {
  if (field !== "system_prompt") return gate([]);
  const findings: Finding[] = [];
  for (const name of REFS) {
    if (!isEmptyValue(card.fields[name].value)) continue;
    if (!new RegExp(`\\b${name}\\b`, "i").test(text)) continue;
    findings.push({
      validator: "refs",
      field,
      otherField: name,
      blocking: true,
      message: `system_prompt names empty field ${name}`,
    });
  }
  return gate(findings);
}
