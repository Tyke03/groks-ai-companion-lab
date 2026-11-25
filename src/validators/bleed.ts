import type { Card } from "../domain/card";
import { fieldText } from "../domain/card";
import { BLEED_FIELDS } from "../domain/fields";
import type { Finding, GateResult } from "./types";
import { gate } from "./types";

export function normalizeSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    const padded = ` ${s} `;
    for (let i = 0; i < padded.length - 1; i++) {
      const g = padded.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  let sa = 0;
  let sb = 0;
  for (const v of A.values()) sa += v;
  for (const v of B.values()) sb += v;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) ?? 0);
  return (2 * inter) / (sa + sb || 1);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A normalized sentence that shows up in two or more of the bleed fields, at similarity ≥ 0.85. */
export function validateBleed(card: Card): GateResult {
  const bags = BLEED_FIELDS.map((name) => ({
    name,
    sentences: sentences(fieldText(card.fields[name].value))
      .map(normalizeSentence)
      .filter((s) => s.length >= 20),
  }));
  const findings: Finding[] = [];
  for (let i = 0; i < bags.length; i++) {
    for (let j = i + 1; j < bags.length; j++) {
      for (const a of bags[i].sentences) {
        for (const b of bags[j].sentences) {
          if (dice(a, b) >= 0.85) {
            findings.push({
              validator: "bleed",
              field: bags[i].name,
              otherField: bags[j].name,
              blocking: true,
              kind: "bleed",
              quoteA: a,
              quoteB: b,
              message: `same sentence in ${bags[i].name} and ${bags[j].name}`,
            });
            return gate(findings);
          }
        }
      }
    }
  }
  return gate([]);
}
