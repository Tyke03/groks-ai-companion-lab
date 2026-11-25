import { SPEC, SPEC_VERSION, fieldText, isEmptyValue, type Card, type FieldName } from "../domain/card";
import { FIELD_NAMES } from "../domain/card";
import { countTokens } from "../context/budgets";
import { validateBleed } from "../validators/bleed";
import { validateWrittenField } from "../validators/fieldGate";
import { validateGroupGate } from "../validators/groupGate";
import { validateRealPerson } from "../validators/realPerson";
import { validateSchema } from "../validators/schema";
import type { Finding } from "../validators/types";
import { emit } from "../telemetry/events";

export interface ExportResult {
  blocked: boolean;
  reasons: { field: string; validator: string; message: string }[];
  envelope?: {
    spec: typeof SPEC;
    spec_version: typeof SPEC_VERSION;
    data: Card["data"];
  };
}

function reason(finding: Finding): { field: string; validator: string; message: string } {
  return { field: finding.field, validator: finding.validator, message: finding.message };
}

/** Hydrate `data` only when every blocking gate passes. */
export function exportCard(
  card: Card,
  opts: { creatorHandle?: string; models?: string[]; costUSD?: number } = {},
): ExportResult {
  const reasons: ExportResult["reasons"] = [];
  for (const name of FIELD_NAMES) {
    if (isEmptyValue(card.fields[name].value)) continue;
    const tokens = countTokens(fieldText(card.fields[name].value));
    card.fields[name].tokens = tokens;
    const gate = validateWrittenField(card, name, tokens);
    if (!gate.pass) reasons.push(...gate.findings.map(reason));
  }
  for (const gate of [validateBleed(card), validateRealPerson(card), validateGroupGate(card)]) {
    if (!gate.pass) reasons.push(...gate.findings.map(reason));
  }

  const now = Date.now();
  const data = { ...card.data };
  for (const name of FIELD_NAMES) {
    const value = card.fields[name].value;
    (data as Record<string, unknown>)[name] = Array.isArray(value) ? [...value] : value;
  }
  if (!String(data.creator || "").trim()) data.creator = opts.creatorHandle || "companionhub";
  if (!String(data.character_version || "").trim()) data.character_version = "1.0.0";
  data.modification_date = now;
  if (!data.creation_date) data.creation_date = now;
  data.extensions = {
    ...data.extensions,
    ccv3_pipeline: {
      version: "1",
      models: opts.models ?? [],
      costUSD: opts.costUSD ?? 0,
      gatesPassed: true,
    },
  };
  if (!String(data.name || "").trim()) {
    reasons.push({ field: "name", validator: "schema", message: "name is required" });
  }
  const envelope = { spec: SPEC, spec_version: SPEC_VERSION, data };
  const schemaGate = validateSchema("card", envelope);
  if (!schemaGate.pass) {
    reasons.push(...schemaGate.findings.map((finding) => ({ field: "card", validator: "schema", message: finding.message })));
  }
  if (reasons.length) {
    emit("export.blocked", { count: reasons.length, field: reasons[0].field, validator: reasons[0].validator });
    return { blocked: true, reasons };
  }
  card.data = data;
  emit("export.ok", { cost: opts.costUSD ?? 0 });
  return {
    blocked: false,
    reasons: [],
    envelope: { spec: SPEC, spec_version: SPEC_VERSION, data },
  };
}
