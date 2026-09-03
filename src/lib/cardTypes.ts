/**
 * Shared character-card model for the Character Card Builder.
 *
 * This module is the single source of truth for the internal card shape that is
 * fed by the import/export codec (`cardCodec.ts`) and consumed by the builder UI.
 *
 * Compatibility posture (see Batch 1C plan):
 * - V2 (chara_card_v2) is the stable, validated import/export target.
 * - V3 (chara_card_v3) is a draft specification: supported for import and
 *   preservation, and exported only under the explicitly documented draft label.
 * - V1 is import-only and is upgraded to V2 on export.
 */

export type CardFormat = "v1" | "v2" | "v3";

/**
 * A conformant Character Card V3 draft asset declaration.
 * Reference: Character Card V3 (draft) spec — every asset MUST carry
 * `type`, `uri`, `name`, and `ext`; `ext` is lowercase without a leading dot.
 */
export interface CardAsset {
  type: string;
  uri: string;
  name: string;
  ext: string;
}

/** Editable character-card fields shared by the builder UI and the codec. */
export interface CardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  /** Stored as a comma-separated string in the UI; exported as `string[]`. */
  tags: string;
  creator: string;
  nickname: string;
  /** Stored as a JSON string in the UI; exported as `Record<string, string>`. */
  creator_notes_multilingual: string;
  character_version: string;
  source: string[];
  group_only_greetings: string[];
  alternate_greetings: string[];
}

/**
 * Opaque data the builder must preserve across round trips without editing it.
 * These fields are never serialized through the editable UI form.
 */
export interface PreservedData {
  /** V2 `extensions` bag — preserved verbatim (default `{}`). */
  extensions: Record<string, unknown>;
  /** V2/V3 `character_book` / lorebook — preserved verbatim, not editable here. */
  character_book: unknown;
  /** Top-level `data` keys outside the known schema — preserved verbatim. */
  unknownDataFields: Record<string, unknown>;
  /** Conformant V3 draft assets, editable in the builder. */
  assets: CardAsset[];
  /** Assets that did not match the V3 draft shape — preserved read-only, never exported. */
  preservedAssets: unknown[];
  creation_date?: number;
  modification_date?: number;
}

export interface CardImportResult {
  format: CardFormat;
  data: CardData;
  preserved: PreservedData;
  warnings: string[];
}

/** The JSON envelope shape for V2 and V3 cards (`spec` + `spec_version` + `data`). */
export interface CardEnvelope {
  spec: "chara_card_v2" | "chara_card_v3";
  spec_version: string;
  data: Record<string, unknown>;
}

export interface CardExport {
  envelope: CardEnvelope;
  format: CardFormat;
  warnings: string[];
}

/** File-size limits (bytes) enforced before parsing/import. */
export const MAX_PNG_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_JSON_BYTES = 5 * 1024 * 1024; // 5 MB

export const MAX_PNG_LABEL = "25 MB";
export const MAX_JSON_LABEL = "5 MB";

/** V1 core fields (flat, top-level). */
export const CORE_V1_FIELDS = [
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
] as const;

/** All known V2 `data` fields (V1 core + V2 additions). */
export const V2_DATA_FIELDS = [
  ...CORE_V1_FIELDS,
  "creator_notes",
  "system_prompt",
  "post_history_instructions",
  "alternate_greetings",
  "character_book",
  "tags",
  "creator",
  "character_version",
  "extensions",
] as const;

/** All known V3 `data` fields (V2 fields + V3 additions). */
export const V3_DATA_FIELDS = [
  ...V2_DATA_FIELDS,
  "assets",
  "nickname",
  "creator_notes_multilingual",
  "source",
  "group_only_greetings",
  "creation_date",
  "modification_date",
] as const;

/**
 * Asset `type` values the builder can author. These are the V3 draft spec's
 * canonical types; other (application-specific) types are preserved read-only.
 */
export const CANONICAL_ASSET_TYPES = [
  "icon",
  "background",
  "user_icon",
  "emotion",
  "other",
] as const;

export function emptyCardData(): CardData {
  return {
    name: "",
    description: "",
    personality: "",
    scenario: "",
    first_mes: "",
    mes_example: "",
    creator_notes: "",
    system_prompt: "",
    post_history_instructions: "",
    tags: "",
    creator: "",
    nickname: "",
    creator_notes_multilingual: "",
    character_version: "1.0",
    source: [],
    group_only_greetings: [],
    alternate_greetings: [],
  };
}

export function emptyPreserved(): PreservedData {
  return {
    extensions: {},
    character_book: undefined,
    unknownDataFields: {},
    assets: [],
    preservedAssets: [],
    creation_date: undefined,
    modification_date: undefined,
  };
}
