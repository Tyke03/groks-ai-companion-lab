import type { CardData } from "./cardTypes";

export interface FieldPolicy {
  locked: boolean;
  useAsContext: boolean;
}

export type FieldPolicies = Partial<Record<keyof CardData, FieldPolicy>>;

export type WholeCardRunMode =
  | "stored"
  | "empty-only"
  | "rewrite-with-context"
  | "rewrite-fresh";

export type PolicyPresetLabel =
  | "Seed & Rewrite"
  | "Fresh Roll"
  | "Pinned Anchor"
  | "Isolated";

export const CARD_DATA_KEYS: (keyof CardData)[] = [
  "name",
  "nickname",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "alternate_greetings",
  "group_only_greetings",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
  "tags",
  "creator",
  "character_version",
  "source",
  "creator_notes_multilingual",
];

/** CCv3 Guru 10-step dependency rank for directional context flow. */
export const FIELD_DEPENDENCY_RANK: Record<keyof CardData, number> = {
  name: 1,
  nickname: 1,
  description: 2,
  personality: 3,
  scenario: 4,
  first_mes: 5,
  mes_example: 6,
  alternate_greetings: 7,
  group_only_greetings: 8,
  system_prompt: 9,
  post_history_instructions: 9,
  creator_notes: 10,
  tags: 10,
  character_version: 10,
  creator: 10,
  source: 10,
  creator_notes_multilingual: 10,
};

export const FIELD_HINTS: Partial<Record<keyof CardData, string>> = {
  name: "Character display name (short, memorable)",
  description: "Identity, physical appearance, and background in 2–3 clean paragraphs (no sub-headers)",
  personality: "Core traits, speech/mannerisms, mood triggers, and personal boundaries in 1–2 clean paragraphs",
  scenario: "Immediate setting, relationship framing, and live stakes in 1–2 clean paragraphs",
  first_mes: "The character's opening message with *actions* and dialogue",
  mes_example: "Three SillyTavern <START> blocks using {{user}}: / {{char}}: labels",
  creator_notes: "Notes for users about how to best use this character",
  system_prompt: "Global role, voice, and progression rules for the AI on how to portray {{char}}",
  post_history_instructions: "Brief anti-drift reminder inserted after chat history",
  tags: "5–12 lowercase comma-separated tags for categorization",
  nickname: "Short substitute name for {{char}} (when name includes titles or prefixes)",
  alternate_greetings: "Three distinct alternate opening scenarios (differing in power dynamic, stage, or location)",
  group_only_greetings: "1–3 greetings used only in group chats",
  source: "Source URLs or IDs",
};

export const ARRAY_FIELDS = new Set<keyof CardData>([
  "source",
  "group_only_greetings",
  "alternate_greetings",
]);

export function hasFieldText(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => String(item ?? "").trim().length > 0);
  return false;
}

export function getFieldPolicy(
  policies: FieldPolicies | undefined,
  field: keyof CardData,
): FieldPolicy {
  const custom = policies?.[field];
  if (custom && typeof custom === "object") {
    return {
      locked: custom.locked === true,
      useAsContext: custom.useAsContext === true,
    };
  }
  if (field === "creator" || field === "character_version") {
    return { locked: true, useAsContext: false };
  }
  if (field === "creator_notes") {
    return { locked: false, useAsContext: false };
  }
  return { locked: false, useAsContext: true };
}

export function defaultPoliciesForBlankCard(): FieldPolicies {
  return {
    creator: { locked: true, useAsContext: false },
    character_version: { locked: true, useAsContext: false },
    creator_notes: { locked: false, useAsContext: false },
  };
}

/**
 * Detect when `description` holds an unstructured blob (long prose without
 * `**Header:**` sections, raw JSON, or W++ markup) so import/paste can set it
 * to Seed & Rewrite (`locked: false, useAsContext: true`).
 */
export function isUnstructuredBlobDescription(desc: string): boolean {
  const trimmed = (desc || "").trim();
  if (!trimmed) return false;
  if (/^\s*\{\s*"[\w-]+"\s*:/.test(trimmed)) return true;
  if (/\[\s*character\s*\(/i.test(trimmed) || /\bMind\s*\(/i.test(trimmed)) return true;
  return trimmed.length > 1500 && !/\*\*[^*\n]+:\*\*/.test(trimmed);
}

const IMPORTED_CORE_FIELDS = new Set<keyof CardData>([
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
]);

export function defaultPoliciesForImportedCard(
  card: CardData,
): { policies: FieldPolicies; blobDetected: boolean } {
  const blobDetected = isUnstructuredBlobDescription(card.description);
  const policies: FieldPolicies = {};
  for (const key of CARD_DATA_KEYS) {
    if (key === "creator" || key === "character_version") {
      policies[key] = { locked: true, useAsContext: false };
      continue;
    }
    const filled = hasFieldText(card[key]);
    if (key === "description" && blobDetected) {
      policies[key] = { locked: false, useAsContext: true };
    } else if (filled && IMPORTED_CORE_FIELDS.has(key)) {
      policies[key] = { locked: true, useAsContext: true };
    } else if (filled) {
      // Stale/derivative imported fields start protected and excluded from upstream echo
      policies[key] = { locked: true, useAsContext: false };
    } else if (key === "creator_notes") {
      policies[key] = { locked: false, useAsContext: false };
    } else {
      policies[key] = { locked: false, useAsContext: true };
    }
  }
  return { policies, blobDetected };
}

export function policyPresetLabel(policy: FieldPolicy): PolicyPresetLabel {
  if (policy.locked) {
    return policy.useAsContext ? "Pinned Anchor" : "Isolated";
  }
  return policy.useAsContext ? "Seed & Rewrite" : "Fresh Roll";
}

export function resolveEffectivePolicies(
  card: CardData,
  policies: FieldPolicies | undefined,
  runMode: WholeCardRunMode = "stored",
): Record<keyof CardData, FieldPolicy> {
  const resolved = {} as Record<keyof CardData, FieldPolicy>;
  for (const key of CARD_DATA_KEYS) {
    const base = getFieldPolicy(policies, key);
    if (runMode === "empty-only") {
      if (hasFieldText(card[key])) {
        resolved[key] = {
          locked: true,
          useAsContext:
            key === "creator" || key === "character_version"
              ? base.useAsContext
              : base.locked && !base.useAsContext
                ? false
                : true,
        };
      } else {
        resolved[key] = { ...base };
      }
    } else if (runMode === "rewrite-fresh") {
      resolved[key] = base.locked
        ? { ...base }
        : { locked: false, useAsContext: false };
    } else {
      resolved[key] = { ...base };
    }
  }
  return resolved;
}
