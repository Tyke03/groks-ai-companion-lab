import type { CardData as BuilderCard } from "../lib/cardTypes";
import type { FieldPolicies } from "../lib/cardFieldMeta";
import { getFieldPolicy, hasFieldText } from "../lib/cardFieldMeta";
import type { Card, FieldName } from "../domain/card";
import { fieldText } from "../domain/card";
import { createEmptyCard, writeField } from "../domain/create";
import { policyFromBuilder } from "../domain/policy";
import { countTokens } from "../context/budgets";

const ARRAYS = new Set<FieldName>(["tags", "alternate_greetings", "group_only_greetings"]);

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "")).filter((v) => v.trim());
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

/** Builder form state → authoring card. Policies come from the launch toggles. */
export function cardFromBuilder(
  data: BuilderCard,
  policies: FieldPolicies | undefined,
  meta: { groupCard?: boolean; realPerson?: boolean } = {},
): Card {
  const card = createEmptyCard(meta);
  const names: FieldName[] = [
    "name", "nickname", "tags", "description", "personality", "scenario", "first_mes",
    "alternate_greetings", "group_only_greetings", "mes_example", "system_prompt",
    "post_history_instructions", "creator_notes", "creator", "character_version",
  ];
  for (const name of names) {
    const raw = data[name as keyof BuilderCard];
    const value = ARRAYS.has(name) ? asArray(raw) : String(raw ?? "");
    const filled = hasFieldText(raw);
    const toggle = getFieldPolicy(policies, name as keyof BuilderCard);
    writeField(card, name, value, policyFromBuilder(name, toggle, filled));
    card.fields[name].tokens = countTokens(fieldText(value));
  }
  return card;
}

export function briefToText(brief: {
  setting?: string;
  role?: string;
  agePresentation?: string;
  tone?: string;
  replyLength?: string;
  voiceSample?: string;
  bannedPhrases?: string;
  relationship?: string;
  pov?: string;
  language?: string;
  contentLevel?: number;
  mustInclude?: string;
}): string {
  return [
    brief.setting && `Setting: ${brief.setting}`,
    brief.role && `Role: ${brief.role}`,
    brief.agePresentation && `Age presentation: ${brief.agePresentation}`,
    brief.tone && `Tone: ${brief.tone}`,
    brief.replyLength && `Reply length: ${brief.replyLength}`,
    brief.relationship && `Relationship: ${brief.relationship}`,
    brief.pov && `POV: ${brief.pov}`,
    brief.language && `Language: ${brief.language}`,
    brief.contentLevel && `Content level: ${brief.contentLevel}`,
    brief.mustInclude && `Must include: ${brief.mustInclude}`,
    brief.voiceSample && `Voice sample: ${brief.voiceSample}`,
    brief.bannedPhrases && `Never use: ${brief.bannedPhrases}`,
  ].filter(Boolean).join("\n");
}
