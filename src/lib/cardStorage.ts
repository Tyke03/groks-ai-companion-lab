/**
 * Local multi-card library for Character Card Builder.
 *
 * Cards live in localStorage only — no backend. Creating a new card never
 * silently destroys a previous card: the prior slot stays in the library and
 * can be re-selected.
 */

import {
  emptyCardData,
  emptyPreserved,
  type CardData,
  type CardFormat,
  type PreservedData,
} from "./cardTypes";

export const CARDS_STORAGE_KEY = "ai-companion-hub-cards";
export const LEGACY_DRAFT_KEY = "ai-companion-hub-card-draft";
export const LEGACY_PRESERVED_KEY = "ai-companion-hub-card-preserved";

export type SpecVersion = "v2" | "v3";

export interface StoredCardSlot {
  id: string;
  label: string;
  updatedAt: number;
  card: CardData;
  preserved: PreservedData;
  specVersion: SpecVersion;
  importedFormat: CardFormat | null;
  importWarnings: string[];
}

export interface CardLibrary {
  version: 1;
  activeId: string;
  cards: StoredCardSlot[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cardHasContent(card: CardData, preserved: PreservedData): boolean {
  const textKeys: (keyof CardData)[] = [
    "name", "description", "personality", "scenario", "first_mes", "mes_example",
    "creator_notes", "system_prompt", "post_history_instructions", "tags",
    "creator", "nickname", "creator_notes_multilingual",
  ];
  if (textKeys.some((k) => String(card[k] ?? "").trim())) return true;
  if (card.source.some((s) => s.trim())) return true;
  if (card.group_only_greetings.some((g) => g.trim())) return true;
  if (card.alternate_greetings.some((g) => g.trim())) return true;
  if (preserved.assets.length > 0 || preserved.preservedAssets.length > 0) return true;
  if (preserved.character_book !== undefined) return true;
  if (Object.keys(preserved.unknownDataFields).length > 0) return true;
  if (Object.keys(preserved.extensions).length > 0) return true;
  return false;
}

export function labelForCard(card: CardData, fallback = "Untitled card"): string {
  const name = card.name.trim();
  return name || fallback;
}

export function newCardId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptySlot(overrides: Partial<StoredCardSlot> = {}): StoredCardSlot {
  const card = overrides.card ?? emptyCardData();
  return {
    id: overrides.id ?? newCardId(),
    label: overrides.label ?? labelForCard(card),
    updatedAt: overrides.updatedAt ?? Date.now(),
    card,
    preserved: overrides.preserved ?? emptyPreserved(),
    specVersion: overrides.specVersion ?? "v2",
    importedFormat: overrides.importedFormat ?? null,
    importWarnings: overrides.importWarnings ?? [],
  };
}

function parseSlot(raw: unknown): StoredCardSlot | null {
  if (!isRecord(raw)) return null;
  const card = { ...emptyCardData(), ...(isRecord(raw.card) ? (raw.card as Partial<CardData>) : {}) };
  const preserved = {
    ...emptyPreserved(),
    ...(isRecord(raw.preserved) ? (raw.preserved as Partial<PreservedData>) : {}),
  };
  const specVersion: SpecVersion = raw.specVersion === "v3" ? "v3" : "v2";
  const importedFormat =
    raw.importedFormat === "v1" || raw.importedFormat === "v2" || raw.importedFormat === "v3"
      ? raw.importedFormat
      : null;
  const importWarnings = Array.isArray(raw.importWarnings)
    ? raw.importWarnings.filter((w): w is string => typeof w === "string")
    : [];
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newCardId(),
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label : labelForCard(card),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    card,
    preserved,
    specVersion,
    importedFormat,
    importWarnings,
  };
}

function readLegacyDraft(): { card: CardData; preserved: PreservedData } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const draftRaw: unknown = JSON.parse(localStorage.getItem(LEGACY_DRAFT_KEY) || "null");
    if (!isRecord(draftRaw)) return null;
    const preservedRaw: unknown = JSON.parse(localStorage.getItem(LEGACY_PRESERVED_KEY) || "null");
    return {
      card: { ...emptyCardData(), ...(draftRaw as Partial<CardData>) },
      preserved: {
        ...emptyPreserved(),
        ...(isRecord(preservedRaw) ? (preservedRaw as Partial<PreservedData>) : {}),
      },
    };
  } catch {
    return null;
  }
}

export function loadCardLibrary(): CardLibrary {
  if (typeof localStorage !== "undefined") {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(CARDS_STORAGE_KEY) || "null");
      if (isRecord(raw) && raw.version === 1 && Array.isArray(raw.cards)) {
        const cards = raw.cards.map(parseSlot).filter((s): s is StoredCardSlot => s !== null);
        if (cards.length > 0) {
          const activeId =
            typeof raw.activeId === "string" && cards.some((c) => c.id === raw.activeId)
              ? raw.activeId
              : cards[0].id;
          return { version: 1, activeId, cards };
        }
      }
    } catch {
      /* fall through to migrate / empty */
    }
  }

  const legacy = readLegacyDraft();
  if (legacy && cardHasContent(legacy.card, legacy.preserved)) {
    const slot = createEmptySlot({
      card: legacy.card,
      preserved: legacy.preserved,
      label: labelForCard(legacy.card),
    });
    return { version: 1, activeId: slot.id, cards: [slot] };
  }

  const slot = createEmptySlot();
  return { version: 1, activeId: slot.id, cards: [slot] };
}

export function saveCardLibrary(library: CardLibrary): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(library));
    const active = getActiveSlot(library);
    if (active) {
      localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(active.card));
      localStorage.setItem(LEGACY_PRESERVED_KEY, JSON.stringify(active.preserved));
    }
  } catch {
    /* quota */
  }
}

export function getActiveSlot(library: CardLibrary): StoredCardSlot {
  return library.cards.find((c) => c.id === library.activeId) ?? library.cards[0] ?? createEmptySlot();
}

/** Persist edits into the active slot (does not change which card is active). */
export function updateActiveSlot(
  library: CardLibrary,
  patch: Partial<Omit<StoredCardSlot, "id">>,
): CardLibrary {
  const cards = library.cards.map((slot) => {
    if (slot.id !== library.activeId) return slot;
    const next: StoredCardSlot = {
      ...slot,
      ...patch,
      id: slot.id,
      updatedAt: Date.now(),
    };
    if (patch.card) next.label = labelForCard(patch.card);
    else if (patch.label) next.label = patch.label;
    return next;
  });
  return { ...library, cards };
}

/**
 * Create a new empty card slot and make it active.
 * The previous active card remains in the library (never destroyed).
 */
export function createNewCard(library: CardLibrary): CardLibrary {
  const slot = createEmptySlot();
  return {
    version: 1,
    activeId: slot.id,
    cards: [...library.cards, slot],
  };
}

/**
 * Switch active card. Caller should have already flushed the current editor
 * state into the library via updateActiveSlot.
 */
export function switchActiveCard(library: CardLibrary, id: string): CardLibrary {
  if (!library.cards.some((c) => c.id === id)) return library;
  return { ...library, activeId: id };
}

/**
 * Remove a card. If it was the last card, replace with a fresh empty slot.
 * If it was active, activate another remaining card.
 */
export function deleteCard(library: CardLibrary, id: string): CardLibrary {
  const remaining = library.cards.filter((c) => c.id !== id);
  if (remaining.length === 0) {
    const slot = createEmptySlot();
    return { version: 1, activeId: slot.id, cards: [slot] };
  }
  const activeId = library.activeId === id ? remaining[0].id : library.activeId;
  return { version: 1, activeId, cards: remaining };
}

/** True when the given card id is still recoverable from the library. */
export function libraryRetainsCard(library: CardLibrary, id: string): boolean {
  return library.cards.some((c) => c.id === id);
}
