import type { Card } from "../domain/card";
import { fieldText } from "../domain/card";
import type { Finding, GateResult } from "./types";
import { gate } from "./types";

export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function quoteAppears(haystack: string, quote: string): boolean {
  const q = normalizeWs(quote);
  if (!q) return false;
  return normalizeWs(haystack).includes(q);
}

export interface QuotePair {
  a: string;
  b: string;
  quoteA: string;
  quoteB: string;
  kind?: string;
  fix?: string;
}

export function validateQuotes(card: Card, pairs: QuotePair[]): GateResult {
  const findings: Finding[] = [];
  for (const pair of pairs) {
    const aText = card.fields[pair.a as keyof Card["fields"]]
      ? fieldText(card.fields[pair.a as keyof Card["fields"]].value)
      : "";
    const bText = card.fields[pair.b as keyof Card["fields"]]
      ? fieldText(card.fields[pair.b as keyof Card["fields"]].value)
      : "";
    if (!quoteAppears(aText, pair.quoteA) || !quoteAppears(bText, pair.quoteB)) {
      findings.push({
        validator: "quotes",
        field: pair.a,
        otherField: pair.b,
        blocking: true,
        kind: pair.kind,
        quoteA: pair.quoteA,
        quoteB: pair.quoteB,
        message: "audit quote is not in the field",
      });
    }
  }
  return gate(findings);
}
