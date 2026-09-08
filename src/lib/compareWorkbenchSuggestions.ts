/**
 * Soft Compare → Workbench suggestions.
 * Never enforce token ceilings or hard limits from catalog facts.
 */

import type { Chatbot } from "@/data/chatbots";

/** Soft Workbench suggestions from Compare — never enforced as hard limits. */
export type SuggestionTrust = "verified" | "unverified";

export interface WorkbenchSuggestion {
  label: string;
  value: string;
  trust: SuggestionTrust;
  reason: string;
}

function isDisclosed(value: string | undefined): value is string {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v.length > 0 && v !== "not disclosed" && v !== "not listed";
}

function suggestionTrust(bot: Chatbot, fieldDisclosed: boolean): SuggestionTrust {
  const status = bot.evidenceMetadata?.reviewStatus;
  if (status === "unverified" || status === "needs-review") return "unverified";
  if (status === "documented" && fieldDisclosed) return "verified";
  // Catalog lastVerified exists site-wide; treat disclosed fields with a verify date as verified.
  if (fieldDisclosed && Boolean(bot.lastVerified?.trim())) return "verified";
  return "unverified";
}

export function buildWorkbenchSuggestions(bot: Chatbot): WorkbenchSuggestion[] {
  const out: WorkbenchSuggestion[] = [];
  if (isDisclosed(bot.cardFormat)) {
    out.push({
      label: "Card format",
      value: bot.cardFormat,
      trust: suggestionTrust(bot, true),
      reason: "From Hub catalog — verify on the platform before relying on import behavior.",
    });
  } else {
    out.push({
      label: "Card format",
      value: bot.cardFormat || "Not disclosed",
      trust: "unverified",
      reason: "No verified card-format documentation in the Hub catalog for this platform.",
    });
  }
  if (isDisclosed(bot.memory)) {
    out.push({
      label: "Memory / lorebook",
      value: bot.memory,
      trust: suggestionTrust(bot, true),
      reason: "Catalog note only — not a Workbench constraint.",
    });
  }
  if (isDisclosed(bot.contextWindow)) {
    out.push({
      label: "Context length (catalog)",
      value: bot.contextWindow,
      trust: suggestionTrust(bot, true),
      reason: "Suggestion only — Workbench does not enforce token ceilings from Compare.",
    });
  } else {
    out.push({
      label: "Context length (catalog)",
      value: bot.contextWindow || "Not disclosed",
      trust: "unverified",
      reason: "Unverified / not disclosed — do not treat as a hard limit in Card Builder.",
    });
  }
  return out;
}

