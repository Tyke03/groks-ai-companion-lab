import { describe, it, expect, beforeEach } from "vitest";
import { emptyCardData, emptyPreserved } from "@/lib/cardTypes";
import {
  CARDS_STORAGE_KEY,
  createEmptySlot,
  createNewCard,
  getActiveSlot,
  libraryRetainsCard,
  loadCardLibrary,
  saveCardLibrary,
  switchActiveCard,
  updateActiveSlot,
  cardHasContent,
  LEGACY_DRAFT_KEY,
  LEGACY_PRESERVED_KEY,
} from "@/lib/cardStorage";
import {
  hasV3OnlyContent,
  lossyV2Warning,
  requiresLossyV2Confirm,
} from "@/lib/cardLossy";
import { buildV2Envelope, importCard } from "@/lib/cardCodec";

beforeEach(() => {
  localStorage.clear();
});

describe("lossy V3 → V2 confirm path", () => {
  it("requires confirm when V3-only content would be dropped from a V2 export", () => {
    const data = emptyCardData();
    data.name = "Maya";
    data.nickname = "May";
    const preserved = emptyPreserved();
    expect(hasV3OnlyContent(data, preserved)).toBe(true);
    expect(requiresLossyV2Confirm("v2", data, preserved)).toBe(true);
    expect(requiresLossyV2Confirm("v3", data, preserved)).toBe(false);
    const warning = lossyV2Warning(data, preserved);
    expect(warning).toMatch(/omit V3 draft fields/i);
    expect(warning).toMatch(/nickname/);

    const exp = buildV2Envelope(data, preserved);
    expect(exp.warnings.some((w) => w.includes("nickname"))).toBe(true);
    expect(exp.envelope.data.nickname).toBeUndefined();
  });

  it("does not require confirm when there is no V3-only content", () => {
    const data = emptyCardData();
    data.name = "Riley";
    const preserved = emptyPreserved();
    expect(requiresLossyV2Confirm("v2", data, preserved)).toBe(false);
    expect(lossyV2Warning(data, preserved)).toBeNull();
  });

  it("does not silently drop: V2 export omits fields but warning is always present when lossy", () => {
    const v3 = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Maya",
        description: "d",
        personality: "p",
        scenario: "s",
        first_mes: "hi",
        mes_example: "ex",
        nickname: "M",
        source: ["https://example.com"],
        group_only_greetings: ["g"],
        assets: [{ type: "icon", uri: "ccdefault:", name: "main", ext: "png" }],
      },
    };
    const result = importCard(v3);
    expect(requiresLossyV2Confirm("v2", result.data, result.preserved)).toBe(true);
    const exp = buildV2Envelope(result.data, result.preserved);
    expect(exp.warnings.length).toBeGreaterThan(0);
    expect(exp.envelope.data.assets).toBeUndefined();
    expect(exp.envelope.data.source).toBeUndefined();
  });
});

describe("multi-card library does not destroy prior cards", () => {
  it("createNewCard keeps the first card recoverable", () => {
    const first = createEmptySlot({
      card: { ...emptyCardData(), name: "Maya" },
      label: "Maya",
    });
    let lib = { version: 1 as const, activeId: first.id, cards: [first] };
    expect(cardHasContent(first.card, first.preserved)).toBe(true);

    lib = createNewCard(lib);
    expect(lib.cards).toHaveLength(2);
    expect(libraryRetainsCard(lib, first.id)).toBe(true);
    expect(getActiveSlot(lib).id).not.toBe(first.id);
    expect(getActiveSlot(lib).card.name).toBe("");

    const maya = lib.cards.find((c) => c.id === first.id);
    expect(maya?.card.name).toBe("Maya");
  });

  it("switching to a second card does not wipe the first", () => {
    const a = createEmptySlot({ card: { ...emptyCardData(), name: "Maya" } });
    const b = createEmptySlot({ card: { ...emptyCardData(), name: "Riley" } });
    let lib = { version: 1 as const, activeId: a.id, cards: [a, b] };
    lib = updateActiveSlot(lib, { card: { ...emptyCardData(), name: "Maya Updated" } });
    lib = switchActiveCard(lib, b.id);
    expect(getActiveSlot(lib).card.name).toBe("Riley");
    expect(lib.cards.find((c) => c.id === a.id)?.card.name).toBe("Maya Updated");
  });

  it("persists library to localStorage and migrates legacy draft", () => {
    localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify({ ...emptyCardData(), name: "Legacy Maya" }));
    localStorage.setItem(LEGACY_PRESERVED_KEY, JSON.stringify(emptyPreserved()));
    const lib = loadCardLibrary();
    expect(lib.cards).toHaveLength(1);
    expect(getActiveSlot(lib).card.name).toBe("Legacy Maya");

    const next = createNewCard(lib);
    saveCardLibrary(next);
    const raw = JSON.parse(localStorage.getItem(CARDS_STORAGE_KEY) || "null");
    expect(raw.cards).toHaveLength(2);
    expect(raw.cards.some((c: { card: { name: string } }) => c.card.name === "Legacy Maya")).toBe(true);
  });
});

describe("flat unwrapped V2-ish import labeling", () => {
  it("does not claim a plain V1 upgrade when V2 fields are present without an envelope", () => {
    const flat = {
      name: "Almost V2",
      description: "d",
      personality: "p",
      scenario: "s",
      first_mes: "hi",
      mes_example: "ex",
      creator_notes: "notes",
      tags: ["a", "b"],
      system_prompt: "sys",
    };
    const result = importCard(flat);
    expect(result.format).toBe("v1");
    expect(result.warnings.some((w) => w.includes("without a V2/V3 envelope"))).toBe(true);
    expect(result.warnings.some((w) => w === "Imported as V1. This card will export as V2 (upgraded).")).toBe(false);
  });

  it("still labels classic flat V1 correctly", () => {
    const v1 = {
      name: "Classic",
      description: "d",
      personality: "p",
      scenario: "s",
      first_mes: "hi",
      mes_example: "ex",
    };
    const result = importCard(v1);
    expect(result.format).toBe("v1");
    expect(result.warnings.some((w) => w.includes("Imported as V1"))).toBe(true);
  });

  it("labels a real V2 envelope as V2 (not V1)", () => {
    const v2 = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Real V2",
        description: "d",
        personality: "p",
        scenario: "s",
        first_mes: "hi",
        mes_example: "ex",
        tags: ["t"],
        creator_notes: "n",
      },
    };
    const result = importCard(v2);
    expect(result.format).toBe("v2");
  });
});
