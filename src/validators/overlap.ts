import type { Card, FieldName } from "../domain/card";
import { fieldText } from "../domain/card";
import type { GateResult } from "./types";
import { gate } from "./types";
import { dice, normalizeSentence, splitSentences } from "./bleed";

const OVERLAP = 0.55;

/** Blocking when a first_mes sentence and a scenario sentence score dice >= 0.55. */
export function validateOverlap(card: Card, field: FieldName): GateResult {
  if (field !== "first_mes" && field !== "scenario") return gate([]);
  const opening = splitSentences(fieldText(card.fields.first_mes.value)).map(normalizeSentence).filter(Boolean);
  const scene = splitSentences(fieldText(card.fields.scenario.value)).map(normalizeSentence).filter(Boolean);
  if (!opening.length || !scene.length) return gate([]);
  for (const a of opening) {
    for (const b of scene) {
      if (dice(a, b) >= OVERLAP) {
        return gate([
          {
            validator: "overlap",
            field,
            otherField: field === "first_mes" ? "scenario" : "first_mes",
            blocking: true,
            kind: "overlap",
            quoteA: a,
            quoteB: b,
            message: "first_mes and scenario share a sentence",
          },
        ]);
      }
    }
  }
  return gate([]);
}
