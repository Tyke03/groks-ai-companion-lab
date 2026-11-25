export const SPEC = "chara_card_v3" as const;
export const SPEC_VERSION = "3.0" as const;

export type Origin = "imported_raw" | "generated" | "manual";

export interface FieldPolicy {
  locked: boolean;
  useAsContext: boolean;
  origin: Origin;
}

export interface FieldState {
  value: string | string[];
  policy: FieldPolicy;
  /** Measured with the pipeline tokenizer, not estimated. */
  tokens: number;
  dirty: boolean;
}

export const FIELD_NAMES = [
  "name",
  "nickname",
  "tags",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "alternate_greetings",
  "group_only_greetings",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
  "creator",
  "character_version",
] as const;

export type FieldName = (typeof FIELD_NAMES)[number];

export interface CharacterBook {
  name?: string;
  entries?: unknown[];
  [key: string]: unknown;
}

export interface CardData {
  name: string;
  nickname?: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  alternate_greetings: string[];
  group_only_greetings: string[];
  mes_example: string;
  system_prompt: string;
  post_history_instructions: string;
  creator_notes: string;
  creator: string;
  character_version: string;
  tags: string[];
  extensions: Record<string, unknown>;
  creation_date: number;
  modification_date: number;
  character_book?: CharacterBook;
}

export interface CardMeta {
  groupCard: boolean;
  realPerson: boolean;
  sourceFormat?: "v1" | "v2" | "wpp" | "raw";
}

export interface Card {
  spec: typeof SPEC;
  spec_version: typeof SPEC_VERSION;
  data: CardData;
  /** Runtime sidecar. Source of truth during authoring. Not the export body. */
  fields: Record<FieldName, FieldState>;
  meta: CardMeta;
}

export function fieldText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "")).join("\n");
  return String(value ?? "");
}

export function isEmptyValue(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.every((v) => !String(v ?? "").trim());
  return !String(value ?? "").trim();
}
