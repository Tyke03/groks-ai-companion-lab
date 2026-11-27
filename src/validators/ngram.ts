import type { Card, FieldName } from "../domain/card";
import { fieldText } from "../domain/card";
import type { GateResult } from "./types";
import { gate } from "./types";
import { normalizeSentence } from "./bleed";

const NGRAM_FIELDS: FieldName[] = ["description", "personality", "system_prompt", "post_history_instructions"];
const JACCARD = 0.35;

function grams(text: string): Set<string> {
  const words = normalizeSentence(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i <= words.length - 3; i++) out.add(words.slice(i, i + 3).join(" "));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const gram of a) if (b.has(gram)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Blocking when 3-gram Jaccard across the four prose fields is >= 0.35. */
export function validateNgram(card: Card, field: FieldName): GateResult {
  if (!NGRAM_FIELDS.includes(field)) return gate([]);
  const mine = grams(fieldText(card.fields[field].value));
  if (!mine.size) return gate([]);
  for (const other of NGRAM_FIELDS) {
    if (other === field) continue;
    const score = jaccard(mine, grams(fieldText(card.fields[other].value)));
    if (score >= JACCARD) {
      return gate([
        {
          validator: "ngram",
          field,
          otherField: other,
          blocking: true,
          kind: "ngram",
          message: `3-gram overlap ${score.toFixed(2)} with ${other}`,
        },
      ]);
    }
  }
  return gate([]);
}
