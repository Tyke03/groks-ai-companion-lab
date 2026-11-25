import type { Card } from "../domain/card";
import { isEmptyValue } from "../domain/card";
import type { GateResult } from "./types";
import { gate } from "./types";

export function validateGroupGate(card: Card): GateResult {
  const empty = isEmptyValue(card.fields.group_only_greetings.value);
  if (card.meta.groupCard === !empty) return gate([]);
  return gate([
    {
      validator: "groupGate",
      field: "group_only_greetings",
      blocking: true,
      message: card.meta.groupCard
        ? "group card needs group_only_greetings"
        : "group_only_greetings set on a non-group card",
    },
  ]);
}
