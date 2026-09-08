import type { CardData, PreservedData } from "./cardTypes";

/**
 * Local approximate token estimation for the active character card.
 *
 * This is a transparent, deterministic, browser-local estimate — NOT a
 * tokenizer and NOT a claim of model-exact accounting. Actual token counts
 * vary by model and by tokenizer implementation.
 *
 * Formula (documented baseline):
 *   estimate = ceil(total relevant text characters / 4)
 *
 * Only text that is intended to travel with the character card is counted.
 * Opaque preserved data that cannot be reliably inspected (extensions,
 * unknown data fields, preserved assets) is excluded rather than guessed.
 */

export const CHARS_PER_TOKEN = 4;

export type TokenFieldGroup = "permanent" | "first_examples";

export interface TokenEstimateField {
  key: string;
  label: string;
  chars: number;
  group: TokenFieldGroup;
}

export interface TokenEstimateGroup {
  id: TokenFieldGroup;
  label: string;
  chars: number;
  tokens: number;
  fields: TokenEstimateField[];
}

export interface TokenEstimate {
  /** Approximate token total = ceil(totalChars / CHARS_PER_TOKEN). */
  total: number;
  totalChars: number;
  /** Per-field character contributions for the disclosure detail. */
  fields: TokenEstimateField[];
  /** Split: Permanent vs First message / Examples. */
  groups: TokenEstimateGroup[];
  /** Human-readable categories intentionally excluded from the estimate. */
  excluded: string[];
}

function addField(
  fields: TokenEstimateField[],
  key: string,
  label: string,
  value: string | string[],
  group: TokenFieldGroup,
): void {
  const chars = Array.isArray(value)
    ? value.reduce((sum, item) => sum + (item?.length ?? 0), 0)
    : (value?.length ?? 0);
  if (chars > 0) fields.push({ key, label, chars, group });
}

function buildGroups(fields: TokenEstimateField[]): TokenEstimateGroup[] {
  const defs: { id: TokenFieldGroup; label: string }[] = [
    { id: "permanent", label: "Permanent" },
    { id: "first_examples", label: "First / Examples" },
  ];
  return defs.map((def) => {
    const groupFields = fields.filter((f) => f.group === def.id);
    const chars = groupFields.reduce((sum, f) => sum + f.chars, 0);
    return {
      id: def.id,
      label: def.label,
      chars,
      tokens: Math.ceil(chars / CHARS_PER_TOKEN),
      fields: groupFields,
    };
  });
}

/**
 * Best-effort text extraction from the opaque `character_book` payload.
 *
 * The character book is preserved verbatim (never edited here) and is part of
 * current V2/V3 export behavior. Only clearly textual fields (name,
 * description, entry content/comment/keys) are counted; anything else in the
 * opaque payload is not guessed at.
 */
export function characterBookChars(book: unknown): number {
  if (typeof book === "string") return book.length;
  if (!book || typeof book !== "object") return 0;
  const rec = book as Record<string, unknown>;
  let chars = 0;
  const add = (value: unknown): void => {
    if (typeof value === "string") chars += value.length;
  };
  add(rec.name);
  add(rec.description);
  if (Array.isArray(rec.entries)) {
    for (const entry of rec.entries) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      add(e.content);
      add(e.comment);
      if (typeof e.keys === "string") chars += e.keys.length;
      else if (Array.isArray(e.keys)) chars += e.keys.reduce((s: number, k) => s + String(k).length, 0);
      if (Array.isArray(e.secondary_keys)) chars += e.secondary_keys.reduce((s: number, k) => s + String(k).length, 0);
    }
  }
  return chars;
}

/** Excluded categories, kept stable so tests and the disclosure agree. */
export const EXCLUDED_TOKEN_CATEGORIES = [
  "Opaque extension data (extensions)",
  "Opaque unknown data fields",
  "Non-conformant asset declarations",
  "Card metadata not in the counted set (tags, creator, version, sources, multilingual notes)",
] as const;

/**
 * Compute the approximate token estimate for a character card.
 *
 * Pure function: never mutates its inputs and is fully deterministic for a
 * given card/preserved pair.
 */
export function estimateCardTokens(
  card: CardData,
  preserved: PreservedData,
): TokenEstimate {
  const fields: TokenEstimateField[] = [];
  addField(fields, "name", "Name", card.name, "permanent");
  addField(fields, "description", "Description", card.description, "permanent");
  addField(fields, "personality", "Personality", card.personality, "permanent");
  addField(fields, "scenario", "Scenario", card.scenario, "permanent");
  addField(fields, "first_mes", "First message", card.first_mes, "first_examples");
  addField(fields, "mes_example", "Example dialogue", card.mes_example, "first_examples");
  // Only populated when present.
  addField(fields, "system_prompt", "System prompt", card.system_prompt, "permanent");
  addField(fields, "post_history_instructions", "Post-history instructions", card.post_history_instructions, "permanent");
  addField(fields, "alternate_greetings", "Alternate greetings", card.alternate_greetings, "first_examples");
  // Creator notes are part of the current exported card data.
  addField(fields, "creator_notes", "Creator notes", card.creator_notes, "permanent");
  // Character book only when available locally and included in export behavior.
  if (preserved.character_book !== undefined) {
    const chars = characterBookChars(preserved.character_book);
    if (chars > 0) fields.push({ key: "character_book", label: "Character book", chars, group: "permanent" });
  }

  const totalChars = fields.reduce((sum, f) => sum + f.chars, 0);
  return {
    total: Math.ceil(totalChars / CHARS_PER_TOKEN),
    totalChars,
    fields,
    groups: buildGroups(fields),
    excluded: [...EXCLUDED_TOKEN_CATEGORIES],
  };
}
