/**
 * Shared helpers for Workbench "Populate from card" flows.
 * Accepts chara_card_v2 / chub_2 / V3 envelopes and flat near-valid cards.
 */

import { buildV2Envelope, detectCardFormat, importCard } from "./cardCodec";
import { emptyPreserved, type CardData } from "./cardTypes";
import type { StoredCardSlot } from "./cardStorage";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const V2_SPECS = new Set(["chara_card_v2", "chub_2", "chub.ai_v2"]);
const V3_SPECS = new Set(["chara_card_v3", "chub_3", "chub.ai_v3"]);

/** Normalize common Character Hub / ST envelope aliases to a data object. */
export function unwrapCardFields(input: unknown): Record<string, unknown> | null {
  let value = input;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;

  // Nested character wrappers sometimes used by hubs / exporters
  for (const key of ["character", "card", "chara", "tavern_card"] as const) {
    const nested = value[key];
    if (isRecord(nested) && (isRecord(nested.data) || typeof nested.name === "string")) {
      value = nested;
      break;
    }
  }

  const spec = typeof value.spec === "string" ? value.spec : "";
  if ((V2_SPECS.has(spec) || V3_SPECS.has(spec)) && isRecord(value.data)) {
    return value.data as Record<string, unknown>;
  }
  if (isRecord(value.data) && typeof (value.data as Record<string, unknown>).name === "string") {
    return value.data as Record<string, unknown>;
  }

  try {
    if (detectCardFormat(value)) {
      return importCard(value).data as unknown as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }

  const softKeys = ["description", "personality", "scenario", "first_mes", "mes_example", "system_prompt"];
  if (typeof value.name === "string" && softKeys.some((k) => typeof value[k] === "string")) {
    return value;
  }
  return null;
}

/** Parse pasted JSON leniently for Prompt Builder / populate paths. */
export function parsePopulateCardJson(raw: string): Record<string, unknown> | null {
  return unwrapCardFields(raw);
}

const LABELED_ORDER: (keyof CardData)[] = [
  "name",
  "nickname",
  "creator",
  "character_version",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
  "tags",
];

export function formatCardContextLabeled(card: CardData, label?: string): string {
  const lines: string[] = [];
  if (label) lines.push(`# Workbench card: ${label}`);
  for (const key of LABELED_ORDER) {
    const val = card[key];
    if (typeof val !== "string" || !val.trim()) continue;
    lines.push(`## ${key}`);
    lines.push(val.trim());
    lines.push("");
  }
  if (Array.isArray(card.alternate_greetings) && card.alternate_greetings.some((g) => g.trim())) {
    lines.push("## alternate_greetings");
    card.alternate_greetings.filter((g) => g.trim()).forEach((g, i) => {
      lines.push(`### greeting ${i + 1}`);
      lines.push(g.trim());
    });
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function formatSlotContext(slot: StoredCardSlot): string {
  return formatCardContextLabeled(slot.card, slot.label);
}



export function formatSlotJson(slot: StoredCardSlot): string {
  const { envelope } = buildV2Envelope(slot.card, slot.preserved ?? emptyPreserved());
  return JSON.stringify(envelope, null, 2);
}

const PROMPT_VAR_SOURCES: Record<string, string[]> = {
  character_name: ["name"],
  character_role: ["personality"],
  setting: ["scenario"],
  personality_traits: ["personality"],
  speaking_style: ["personality"],
  personality: ["personality"],
  description: ["description"],
  scenario: ["scenario"],
  scenario_title: ["scenario"],
  setting_description: ["scenario"],
  context: ["scenario", "description"],
  action_description: ["first_mes"],
  greeting_dialogue: ["first_mes"],
  scene_description: ["scenario"],
  entry_name: ["name"],
  example_dialogue: ["mes_example", "example_dialogue"],
};

export function mapCardFieldsToVariables(
  fields: Record<string, unknown>,
  variableNames: string[],
  maxLen = 200,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of variableNames) {
    const sources = PROMPT_VAR_SOURCES[name];
    if (!sources) continue;
    for (const source of sources) {
      const raw = fields[source];
      if (typeof raw === "string" && raw.trim()) {
        out[name] = raw.trim().substring(0, maxLen);
        break;
      }
    }
  }
  return out;
}

export function slotToFieldRecord(slot: StoredCardSlot): Record<string, unknown> {
  return { ...slot.card } as unknown as Record<string, unknown>;
}
