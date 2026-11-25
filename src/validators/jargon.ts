import { UI_STRINGS } from "../ui/strings";
import type { GateResult } from "./types";
import { gate } from "./types";

/** Built from the UI string table so the denylist cannot drift from the product copy. */
export function jargonDenylist(): string[] {
  return UI_STRINGS.filter((s) => s.length >= 8);
}

export function validateJargon(field: string, text: string, blocking: boolean): GateResult {
  const hit = jargonDenylist().find((phrase) => text.toLowerCase().includes(phrase.toLowerCase()));
  if (!hit) return gate([]);
  return gate([
    {
      validator: "jargon",
      field,
      blocking,
      kind: "jargon",
      message: `uses UI label "${hit}"`,
    },
  ]);
}
