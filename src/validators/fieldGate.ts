import type { Card, FieldName } from "../domain/card";
import { fieldText } from "../domain/card";
import { FIELD_REGISTRY } from "../domain/fields";
import { validateAgency } from "./agency";
import { validateArrayShape } from "./arrayShape";
import { validateBudget } from "./budget";
import { validateJargon } from "./jargon";
import { validateMarkdown } from "./markdown";
import { validateStageRubric } from "./stageRubric";
import type { Finding, GateResult } from "./types";
import { gate } from "./types";

function mesExampleOk(text: string): string | null {
  const starts = text.match(/<START>/g)?.length ?? 0;
  if (starts < 2 || starts > 3) return "mes_example needs 2 or 3 <START> blocks";
  if (!/\{\{user\}\}\s*:/.test(text) || !/\{\{char\}\}\s*:/.test(text)) {
    return "mes_example needs {{user}}: and {{char}}: lines";
  }
  return null;
}

export function validateWrittenField(card: Card, field: FieldName, tokens: number): GateResult {
  const state = card.fields[field];
  const text = fieldText(state.value);
  const findings: Finding[] = [];
  findings.push(...validateMarkdown(field, text).findings);
  findings.push(...validateBudget(field, tokens, FIELD_REGISTRY[field].budgetTokens).findings);
  findings.push(...validateAgency(field, text).findings);
  findings.push(...validateStageRubric(field, text).findings);
  if (field === "creator_notes") {
    findings.push(...validateJargon(field, text, true).findings);
    if (!text.includes("Intended user:")) {
      findings.push({
        validator: "creatorNotes",
        field,
        blocking: true,
        message: "missing Intended user: line",
      });
    }
    if (card.meta.realPerson && !text.includes("This character is based on a real person and is a work of fiction.")) {
      findings.push({
        validator: "realPerson",
        field,
        blocking: true,
        message: "real-person disclaimer missing",
      });
    }
  }
  if (field === "mes_example") {
    const problem = mesExampleOk(text);
    if (problem) findings.push({ validator: "mesExample", field, blocking: true, message: problem });
  }
  if (FIELD_REGISTRY[field].format === "array") {
    findings.push(...validateArrayShape(field, state.value).findings);
    const max = FIELD_REGISTRY[field].maxItemChars;
    if (max && Array.isArray(state.value) && state.value.some((item) => item.length > max)) {
      findings.push({ validator: "arrayShape", field, blocking: true, message: `item over ${max} characters` });
    }
  }
  return gate(findings);
}
