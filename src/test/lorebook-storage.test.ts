import { describe, it, expect, beforeEach } from "vitest";
import {
  CARDS_STORAGE_KEY,
  createEmptySlot,
  saveCardLibrary,
} from "@/lib/cardStorage";
import { emptyCardData } from "@/lib/cardTypes";
import {
  DEFAULT_LOREBOOK_NAME,
  LOREBOOK_STORAGE_KEY,
  createEmptyLorebook,
  emptyEntry,
  loadLorebook,
  mergeEntries,
  detectLorebookImportShape,
  parseImportedEntries,
  replaceEntries,
  saveLorebook,
  toggleBoundCard,
} from "@/lib/lorebookStorage";

beforeEach(() => {
  localStorage.clear();
});

describe("lorebook name persistence", () => {
  it("persists the lorebook/world name across load", () => {
    const book = createEmptyLorebook({
      name: "Crystal Court",
      entries: [{ ...emptyEntry(), keys: ["crystal"], content: "A binding relic." }],
    });
    saveLorebook(book);
    const reloaded = loadLorebook();
    expect(reloaded.name).toBe("Crystal Court");
    expect(reloaded.entries.some((e) => e.keys.includes("crystal"))).toBe(true);
  });

  it("falls back to default name when blank", () => {
    saveLorebook(createEmptyLorebook({ name: "   " }));
    expect(loadLorebook().name).toBe(DEFAULT_LOREBOOK_NAME);
  });
});

describe("lorebook merge import does not wipe prior entries", () => {
  it("merge keeps Riley prior entry and appends imported", () => {
    const prior = { ...emptyEntry("prior-1"), keys: ["riley"], content: "Riley lived here first." };
    const importedPayload = {
      name: "Imported World",
      entries: [
        { keys: ["harbor"], content: "Neon Harbor docks." },
        { keys: ["tower"], content: "Signal tower." },
      ],
    };
    const imported = parseImportedEntries(importedPayload);
    const merged = mergeEntries([prior], imported);
    expect(merged.some((e) => e.id === "prior-1" && e.keys.includes("riley"))).toBe(true);
    expect(merged.some((e) => e.keys.includes("harbor"))).toBe(true);
    expect(merged.some((e) => e.keys.includes("tower"))).toBe(true);
    expect(merged).toHaveLength(3);
  });

  it("replace wipes prior entries when explicitly chosen", () => {
    const prior = { ...emptyEntry("prior-1"), keys: ["riley"], content: "keep me?" };
    const imported = parseImportedEntries({
      entries: [{ keys: ["new"], content: "only new" }],
    });
    const replaced = replaceEntries(imported);
    expect(replaced.some((e) => e.id === "prior-1")).toBe(false);
    expect(replaced).toHaveLength(1);
    expect(replaced[0].keys).toEqual(["new"]);
  });

  it("persisted merge round-trip keeps prior + imported", () => {
    const prior = { ...emptyEntry("prior-1"), keys: ["riley"], content: "prior" };
    saveLorebook(createEmptyLorebook({ name: "Riley World", entries: [prior] }));
    const book = loadLorebook();
    const imported = parseImportedEntries({
      entries: Object.fromEntries([["0", { key: ["maya"], content: "Maya court" }]]),
    });
    const next = {
      ...book,
      entries: mergeEntries(book.entries, imported),
    };
    saveLorebook(next);
    const reloaded = loadLorebook();
    expect(reloaded.entries.some((e) => e.keys.includes("riley"))).toBe(true);
    expect(reloaded.entries.some((e) => e.keys.includes("maya"))).toBe(true);
  });
});

describe("lorebook bind survives reload", () => {
  it("bound card ids persist with the lorebook", () => {
    const maya = createEmptySlot({
      id: "card-maya",
      card: { ...emptyCardData(), name: "Maya" },
      label: "Maya",
    });
    const riley = createEmptySlot({
      id: "card-riley",
      card: { ...emptyCardData(), name: "Riley" },
      label: "Riley",
    });
    saveCardLibrary({ version: 1, activeId: maya.id, cards: [maya, riley] });

    let book = createEmptyLorebook({ name: "Shared World" });
    book = toggleBoundCard(book, maya.id);
    book = toggleBoundCard(book, riley.id);
    saveLorebook(book);

    const reloaded = loadLorebook();
    expect(reloaded.boundCardIds).toEqual(expect.arrayContaining(["card-maya", "card-riley"]));
    expect(reloaded.boundCardIds).toHaveLength(2);

    // Cards still in library
    const cardsRaw = JSON.parse(localStorage.getItem(CARDS_STORAGE_KEY) || "null");
    expect(cardsRaw.cards.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining(["card-maya", "card-riley"]),
    );
    expect(localStorage.getItem(LOREBOOK_STORAGE_KEY)).toBeTruthy();
  });

  it("toggle unbinds a card and persists", () => {
    let book = createEmptyLorebook({ boundCardIds: ["card-maya", "card-riley"] });
    book = toggleBoundCard(book, "card-maya");
    saveLorebook(book);
    expect(loadLorebook().boundCardIds).toEqual(["card-riley"]);
  });
});

describe("sillytavern nested data.entries import", () => {
  it("accepts ST-style data.entries object map and fresh ids", () => {
    const nested = {
      data: {
        name: "ST Nested World",
        entries: {
          "0": { key: ["harbor"], content: "Neon docks", order: 10, constant: false },
          "1": { keys: ["tower"], content: "Signal tower", insertion_order: 20 },
        },
      },
    };
    expect(detectLorebookImportShape(nested)).toBe("sillytavern-data");
    const imported = parseImportedEntries(nested);
    expect(imported).toHaveLength(2);
    expect(imported.some((e) => e.keys.includes("harbor") && e.content.includes("Neon"))).toBe(true);
    expect(imported.some((e) => e.keys.includes("tower"))).toBe(true);
    expect(imported.every((e) => typeof e.id === "string" && e.id.length > 0)).toBe(true);
  });

  it("still accepts top-level entries array", () => {
    const top = { name: "Top", entries: [{ keys: ["a"], content: "A" }] };
    expect(detectLorebookImportShape(top)).toBe("top-level");
    expect(parseImportedEntries(top)).toHaveLength(1);
  });
});
