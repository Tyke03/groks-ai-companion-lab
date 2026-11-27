import type { FieldName } from "../domain/card";
import type { GateResult } from "./types";
import { gate } from "./types";

const YOU = /\byou\b|\byour\b/i;
const PROSE = new Set<FieldName>(["description", "personality", "scenario"]);

function outsideQuotes(text: string): string {
  let out = "";
  let quote: '"' | "“" | null = null;
  for (const ch of text) {
    if (quote) {
      if ((quote === '"' && ch === '"') || (quote === "“" && ch === "”")) quote = null;
      else out += " ";
      continue;
    }
    if (ch === '"') {
      quote = '"';
      continue;
    }
    if (ch === "“") {
      quote = "“";
      continue;
    }
    out += ch;
  }
  return out;
}

/** Blocking second person in dossier fields, and outside quotes in the opener. */
export function validatePov(field: FieldName, text: string): GateResult {
  const target = field === "first_mes" ? outsideQuotes(text) : text;
  if (field !== "first_mes" && !PROSE.has(field)) return gate([]);
  if (!YOU.test(target)) return gate([]);
  return gate([
    {
      validator: "pov",
      field,
      blocking: true,
      message: field === "first_mes" ? "you/your outside quoted speech" : "you/your in third-person prose",
    },
  ]);
}
