/**
 * Local lorebook / world-info storage.
 *
 * Lives in localStorage only — no backend. Import defaults to merge so
 * prior entries are not silently wiped (Riley pain). Bindings link to
 * Character Card Builder slots by id.
 */

export const LOREBOOK_STORAGE_KEY = "ai-companion-hub-lorebook";

export interface LorebookEntry {
  id: string;
  keys: string[];
  secondaryKeys: string;
  insertionOrder: number;
  position: "before_char" | "after_char" | "top_of_context";
  content: string;
  constant: boolean;
}

export interface StoredLorebook {
  version: 1;
  name: string;
  entries: LorebookEntry[];
  boundCardIds: string[];
  updatedAt: number;
}

export const DEFAULT_LOREBOOK_NAME = "Untitled lorebook";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function newEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyEntry(id = newEntryId()): LorebookEntry {
  return {
    id,
    keys: [],
    secondaryKeys: "",
    insertionOrder: 100,
    position: "before_char",
    content: "",
    constant: false,
  };
}

export function createEmptyLorebook(overrides: Partial<StoredLorebook> = {}): StoredLorebook {
  return {
    version: 1,
    name: overrides.name ?? DEFAULT_LOREBOOK_NAME,
    entries: overrides.entries ?? [emptyEntry()],
    boundCardIds: overrides.boundCardIds ?? [],
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

function parsePosition(value: unknown): LorebookEntry["position"] {
  if (value === "after_char" || value === "top_of_context" || value === "before_char") {
    return value;
  }
  return "before_char";
}

export function parseEntry(raw: unknown): LorebookEntry | null {
  if (!isRecord(raw)) return null;
  const rawKeys = raw.key ?? raw.keys ?? [];
  const keys = Array.isArray(rawKeys)
    ? rawKeys.map(String)
    : String(rawKeys)
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newEntryId(),
    keys,
    secondaryKeys: String(raw.keysecondary ?? raw.secondaryKeys ?? raw.secondary_keys ?? ""),
    insertionOrder: Number(raw.order ?? raw.insertionOrder ?? raw.insertion_order ?? 100),
    position: parsePosition(raw.position),
    content: String(raw.content ?? ""),
    constant: Boolean(raw.constant),
  };
}

export type LorebookImportShape = "top-level" | "sillytavern-data" | "unknown";

/**
 * Detect where entries live. SillyTavern often nests World Info under `data.entries`
 * (object map or array). Top-level `entries` stays the primary shape.
 */
export function detectLorebookImportShape(parsed: unknown): LorebookImportShape {
  if (!isRecord(parsed)) return "unknown";
  if (parsed.entries !== undefined) return "top-level";
  if (isRecord(parsed.data) && parsed.data.entries !== undefined) return "sillytavern-data";
  return "unknown";
}

/** Flatten nested ST `data.entries` (and similar) into a root that has `.entries`. */
export function normalizeLorebookImportRoot(parsed: unknown): Record<string, unknown> {
  if (!isRecord(parsed)) throw new Error("No entries array found");
  const shape = detectLorebookImportShape(parsed);
  if (shape === "top-level") return parsed;
  if (shape === "sillytavern-data") {
    const data = parsed.data as Record<string, unknown>;
    return {
      ...parsed,
      ...data,
      entries: data.entries,
    };
  }
  throw new Error(
    "No entries array found. Expected top-level entries or SillyTavern-style data.entries.",
  );
}

/** Normalize SillyTavern World Info v2 or Agnaistic-style JSON into entries. */
export function parseImportedEntries(parsed: unknown): LorebookEntry[] {
  const root = normalizeLorebookImportRoot(parsed);
  const rawEntries =
    root.entries && !Array.isArray(root.entries)
      ? Object.values(root.entries as Record<string, unknown>)
      : root.entries;
  if (!Array.isArray(rawEntries)) {
    throw new Error(
      "No entries array found. Expected top-level entries or SillyTavern-style data.entries.",
    );
  }
  return rawEntries
    .map(parseEntry)
    .filter((entry): entry is LorebookEntry => entry !== null)
    .map((entry) => ({ ...entry, id: newEntryId() }));
}

export function extractImportedName(parsed: unknown): string | null {
  if (!isRecord(parsed)) return null;
  if (typeof parsed.name === "string" && parsed.name.trim()) return parsed.name.trim();
  if (isRecord(parsed.data) && typeof parsed.data.name === "string" && parsed.data.name.trim()) {
    return parsed.data.name.trim();
  }
  return null;
}

export function entryHasContent(entry: LorebookEntry): boolean {
  return entry.constant || entry.keys.length > 0 || entry.content.trim().length > 0;
}

export function lorebookHasContent(book: StoredLorebook): boolean {
  return book.entries.some(entryHasContent);
}

/**
 * Append imported entries; prior entries stay. Imported rows already have fresh ids.
 */
export function mergeEntries(
  existing: LorebookEntry[],
  imported: LorebookEntry[],
): LorebookEntry[] {
  const kept = existing.filter(entryHasContent);
  if (kept.length === 0) return imported.length ? imported : [emptyEntry()];
  return [...kept, ...imported];
}

/** Replace all entries with imported set (or a blank entry if empty). */
export function replaceEntries(imported: LorebookEntry[]): LorebookEntry[] {
  return imported.length ? imported : [emptyEntry()];
}

export function loadLorebook(): StoredLorebook {
  if (typeof localStorage !== "undefined") {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(LOREBOOK_STORAGE_KEY) || "null");
      if (isRecord(raw) && raw.version === 1) {
        const entriesRaw = Array.isArray(raw.entries) ? raw.entries : [];
        const entries = entriesRaw
          .map(parseEntry)
          .filter((entry): entry is LorebookEntry => entry !== null);
        const boundCardIds = Array.isArray(raw.boundCardIds)
          ? raw.boundCardIds.filter((id): id is string => typeof id === "string" && id.length > 0)
          : [];
        return {
          version: 1,
          name:
            typeof raw.name === "string" && raw.name.trim()
              ? raw.name.trim()
              : DEFAULT_LOREBOOK_NAME,
          entries: entries.length ? entries : [emptyEntry()],
          boundCardIds: [...new Set(boundCardIds)],
          updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
        };
      }
    } catch {
      /* fall through */
    }
  }
  return createEmptyLorebook();
}

export function saveLorebook(book: StoredLorebook): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: StoredLorebook = {
      version: 1,
      name: book.name.trim() || DEFAULT_LOREBOOK_NAME,
      entries: book.entries.length ? book.entries : [emptyEntry()],
      boundCardIds: [...new Set(book.boundCardIds)],
      updatedAt: Date.now(),
    };
    localStorage.setItem(LOREBOOK_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function setBoundCardIds(book: StoredLorebook, cardIds: string[]): StoredLorebook {
  return {
    ...book,
    boundCardIds: [...new Set(cardIds.filter(Boolean))],
    updatedAt: Date.now(),
  };
}

export function toggleBoundCard(book: StoredLorebook, cardId: string): StoredLorebook {
  const has = book.boundCardIds.includes(cardId);
  const boundCardIds = has
    ? book.boundCardIds.filter((id) => id !== cardId)
    : [...book.boundCardIds, cardId];
  return { ...book, boundCardIds, updatedAt: Date.now() };
}
