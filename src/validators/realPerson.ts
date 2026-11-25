import type { Card } from "../domain/card";
import { fieldText } from "../domain/card";
import type { GateResult } from "./types";
import { gate } from "./types";

export const REAL_PERSON_DISCLAIMER =
  "This character is based on a real person and is a work of fiction.";

export function validateRealPerson(card: Card): GateResult {
  if (!card.meta.realPerson) return gate([]);
  const notes = fieldText(card.fields.creator_notes.value);
  if (notes.includes(REAL_PERSON_DISCLAIMER)) return gate([]);
  return gate([
    {
      validator: "realPerson",
      field: "creator_notes",
      blocking: true,
      message: "real-person disclaimer missing from creator_notes",
    },
  ]);
}
