import { strictAssetSchema, v2EnvelopeSchema, v3EnvelopeSchema } from "./cardSchema";
import {
  CANONICAL_ASSET_TYPES,
  CORE_V1_FIELDS,
  V3_DATA_FIELDS,
  type CardAsset,
  type CardData,
  type CardEnvelope,
  type CardExport,
  type CardFormat,
  type CardImportResult,
  type PreservedData,
} from "./cardTypes";

export class CardImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardImportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keys that could pollute a prototype if spread into a plain object. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Deep-copy an opaque value into a fresh plain object, stripping prototype
 * pollution keys (`__proto__`, `constructor`, `prototype`) anywhere in the tree.
 */
export function sanitizeOpaque(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeOpaque);
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      out[key] = sanitizeOpaque(value[key]);
    }
    return out;
  }
  return value;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

/** Map a value that is either a string[] or a comma/newline string into a string[]. */
function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** Map a value (string[] or string) into the UI's comma-separated `tags` string. */
function asTagsString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).join(", ");
  }
  return typeof value === "string" ? value : "";
}

function splitTags(tags: string): string[] {
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

/** Detect the card format of a parsed JSON value, or null when it is not a card. */
export function detectCardFormat(json: unknown): CardFormat | null {
  if (!isRecord(json)) return null;
  if (json.spec === "chara_card_v3" && isRecord(json.data)) return "v3";
  if (json.spec === "chara_card_v2" && isRecord(json.data)) return "v2";
  // Flat V1 card: requires `name` plus at least one other V1 core field.
  if (
    typeof json.name === "string" &&
    CORE_V1_FIELDS.some((field) => field !== "name" && typeof json[field] === "string")
  ) {
    return "v1";
  }
  return null;
}

function mapToCardData(data: Record<string, unknown>): CardData {
  const multilingual = data.creator_notes_multilingual;
  return {
    name: asString(data.name),
    description: asString(data.description),
    personality: asString(data.personality),
    scenario: asString(data.scenario),
    first_mes: asString(data.first_mes),
    mes_example: asString(data.mes_example),
    creator_notes: asString(data.creator_notes),
    system_prompt: asString(data.system_prompt),
    post_history_instructions: asString(data.post_history_instructions),
    tags: asTagsString(data.tags),
    creator: asString(data.creator),
    nickname: asString(data.nickname),
    creator_notes_multilingual: isRecord(multilingual)
      ? JSON.stringify(multilingual)
      : asString(multilingual),
    character_version: asString(data.character_version) || "1.0",
    source: asStringList(data.source),
    group_only_greetings: asStringList(data.group_only_greetings),
    alternate_greetings: asStringList(data.alternate_greetings),
  };
}

function collectPreserved(
  data: Record<string, unknown>,
  warnings: string[],
): PreservedData {
  const preserved: PreservedData = {
    extensions: {},
    character_book: undefined,
    unknownDataFields: {},
    assets: [],
    preservedAssets: [],
    creation_date: undefined,
    modification_date: undefined,
  };

  if (data.extensions !== undefined) {
    if (isRecord(data.extensions)) {
      preserved.extensions = sanitizeOpaque(data.extensions) as Record<string, unknown>;
    } else {
      warnings.push("`extensions` was not an object and was reset to `{}`.");
    }
  }

  if (data.character_book !== undefined) {
    preserved.character_book = sanitizeOpaque(data.character_book);
  }

  if (Array.isArray(data.assets)) {
    for (const asset of data.assets) {
      const parsed = strictAssetSchema.safeParse(asset);
      const canonical =
        isRecord(asset) &&
        (CANONICAL_ASSET_TYPES as readonly string[]).includes(String(asset.type));
      if (parsed.success && canonical) {
        preserved.assets.push(parsed.data as CardAsset);
      } else {
        preserved.preservedAssets.push(sanitizeOpaque(asset));
      }
    }
    if (preserved.preservedAssets.length > 0) {
      warnings.push(
        `${preserved.preservedAssets.length} asset(s) did not match the supported V3 draft asset types and are preserved read-only (they are not exported).`,
      );
    }
  }

  // Collect unknown top-level `data` keys, stripping dangerous keys.
  const handled = new Set<string>(V3_DATA_FIELDS);
  let stripped = 0;
  for (const key of Object.keys(data)) {
    if (handled.has(key)) continue;
    if (DANGEROUS_KEYS.has(key)) {
      stripped += 1;
      continue;
    }
    preserved.unknownDataFields[key] = sanitizeOpaque(data[key]);
  }
  if (stripped > 0) {
    warnings.push(`Removed ${stripped} unsafe key(s) during import.`);
  }
  if (Object.keys(preserved.unknownDataFields).length > 0) {
    warnings.push(`${Object.keys(preserved.unknownDataFields).length} unsupported field(s) will be preserved unchanged.`);
  }

  if (typeof data.creation_date === "number") preserved.creation_date = data.creation_date;
  if (typeof data.modification_date === "number") preserved.modification_date = data.modification_date;

  return preserved;
}

/**
 * Import a parsed JSON value as a character card. Validates the envelope/shape,
 * maps known fields into the editable model, and preserves `extensions`,
 * `character_book`, unknown data keys, and V3 assets opaquely.
 *
 * Throws `CardImportError` for malformed or unrecognized input.
 */
export function importCard(json: unknown): CardImportResult {
  const format = detectCardFormat(json);
  if (!format || !isRecord(json)) {
    throw new CardImportError(
      "Not a recognizable character card (expected a V1, V2, or V3 card).",
    );
  }

  const warnings: string[] = [];
  let data: Record<string, unknown>;

  if (format === "v1") {
    data = json;
    warnings.push("Imported as V1. This card will export as V2 (upgraded).");
  } else {
    const schema = format === "v2" ? v2EnvelopeSchema : v3EnvelopeSchema;
    const parsed = schema.safeParse(json);
    if (!parsed.success || !isRecord(json.data)) {
      const expectedSpec = format === "v2" ? "chara_card_v2" : "chara_card_v3";
      throw new CardImportError(
        `Invalid ${format.toUpperCase()} envelope: expected a "${expectedSpec}" spec with a data object.`,
      );
    }
    const expected = format === "v2" ? "2.0" : "3.0";
    if (typeof json.spec_version === "string" && json.spec_version !== expected) {
      warnings.push(`spec_version "${json.spec_version}" differs from "${expected}"; imported leniently.`);
    }
    data = json.data as Record<string, unknown>;
  }

  return {
    format,
    data: mapToCardData(data),
    preserved: collectPreserved(data, warnings),
    warnings,
  };
}

function buildBaseData(preserved: PreservedData): Record<string, unknown> {
  const data: Record<string, unknown> = { ...preserved.unknownDataFields };
  data.extensions = preserved.extensions;
  if (preserved.character_book !== undefined) {
    data.character_book = preserved.character_book;
  }
  return data;
}

function v3OnlyContentPresent(data: CardData, preserved: PreservedData): boolean {
  return Boolean(
    (data.nickname && data.nickname.trim()) ||
    data.source.some((s) => s.trim()) ||
    data.group_only_greetings.some((g) => g.trim()) ||
    (data.creator_notes_multilingual && data.creator_notes_multilingual.trim()) ||
    preserved.assets.length > 0 ||
    preserved.preservedAssets.length > 0 ||
    preserved.creation_date !== undefined ||
    preserved.modification_date !== undefined,
  );
}

/** Build a stable, validated Character Card V2 envelope. */
export function buildV2Envelope(data: CardData, preserved: PreservedData): CardExport {
  const warnings: string[] = [];
  if (v3OnlyContentPresent(data, preserved)) {
    warnings.push(
      "This card contains V3 draft fields (nickname, source, group greetings, assets, or multilingual notes) that are not part of V2 and will be omitted from the V2 export.",
    );
  }

  const envelope: CardEnvelope = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      ...buildBaseData(preserved),
      name: data.name,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      first_mes: data.first_mes,
      mes_example: data.mes_example,
      creator_notes: data.creator_notes,
      system_prompt: data.system_prompt,
      post_history_instructions: data.post_history_instructions,
      alternate_greetings: data.alternate_greetings.filter((g) => g.trim()),
      tags: splitTags(data.tags),
      creator: data.creator,
      character_version: data.character_version.trim() || "1.0",
    },
  };

  return { envelope, format: "v2", warnings };
}

function parseMultilingual(value: string): Record<string, string> | undefined {
  if (!value.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed as Record<string, string>;
  } catch {
    /* handled by caller via undefined */
  }
  return undefined;
}

/** Build a Character Card V3 (draft) envelope. */
export function buildV3Envelope(data: CardData, preserved: PreservedData): CardExport {
  const warnings: string[] = [];

  const assets = preserved.assets.filter((asset) => strictAssetSchema.safeParse(asset).success);
  if (preserved.preservedAssets.length > 0) {
    warnings.push(
      `${preserved.preservedAssets.length} preserved asset(s) do not match the V3 draft shape and are not exported.`,
    );
  }

  let creator_notes_multilingual: Record<string, string> | undefined;
  if (data.creator_notes_multilingual.trim()) {
    creator_notes_multilingual = parseMultilingual(data.creator_notes_multilingual);
    if (!creator_notes_multilingual) {
      warnings.push("Invalid creator_notes_multilingual JSON — omitted from export.");
    }
  }

  const now = Math.floor(Date.now() / 1000);

  const envelope: CardEnvelope = {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      ...buildBaseData(preserved),
      name: data.name,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      first_mes: data.first_mes,
      mes_example: data.mes_example,
      creator_notes: data.creator_notes,
      system_prompt: data.system_prompt,
      post_history_instructions: data.post_history_instructions,
      alternate_greetings: data.alternate_greetings.filter((g) => g.trim()),
      tags: splitTags(data.tags),
      creator: data.creator,
      character_version: data.character_version.trim() || "1.0",
      nickname: data.nickname.trim() || undefined,
      creator_notes_multilingual,
      source: data.source.filter((s) => s.trim()),
      group_only_greetings: data.group_only_greetings.filter((g) => g.trim()),
      assets,
      creation_date: preserved.creation_date ?? now,
      modification_date: now,
    },
  };

  return { envelope, format: "v3", warnings };
}

/**
 * Sanitize a download filename: strip path separators, control characters, and
 * characters that are invalid on common filesystems. Falls back to "character".
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "character";
}
