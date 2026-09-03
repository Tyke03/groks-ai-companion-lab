import { describe, it, expect } from "vitest";
import {
  importCard,
  buildV2Envelope,
  buildV3Envelope,
  detectCardFormat,
  sanitizeFilename,
  sanitizeOpaque,
  CardImportError,
} from "@/lib/cardCodec";
import { MAX_PNG_BYTES, MAX_JSON_BYTES, emptyCardData, emptyPreserved } from "@/lib/cardTypes";

const v2Core = {
  name: "Test Bot",
  description: "A test character",
  personality: "kind",
  scenario: "a forest",
  first_mes: "Hi *waves*",
  mes_example: "<START>\nUser: hi\nBot: hello",
  creator_notes: "notes",
  system_prompt: "sys",
  post_history_instructions: "post",
  alternate_greetings: ["alt one", "alt two"],
  tags: ["test", "bot"],
  creator: "me",
  character_version: "1.2",
};

describe("detectCardFormat", () => {
  it("detects V2 and V3 envelopes and flat V1 cards", () => {
    expect(detectCardFormat({ spec: "chara_card_v2", data: {} })).toBe("v2");
    expect(detectCardFormat({ spec: "chara_card_v3", data: {} })).toBe("v3");
    expect(detectCardFormat({ name: "a", description: "b" })).toBe("v1");
  });

  it("rejects non-cards, bare names, and wrong specs", () => {
    expect(detectCardFormat({ name: "a" })).toBeNull();
    expect(detectCardFormat({ spec: "chara_card_v4", data: {} })).toBeNull();
    expect(detectCardFormat(42)).toBeNull();
    expect(detectCardFormat(null)).toBeNull();
    expect(detectCardFormat("hello")).toBeNull();
  });
});

describe("importCard validation", () => {
  it("throws CardImportError for unrecognized or malformed input", () => {
    expect(() => importCard("hello")).toThrow(CardImportError);
    expect(() => importCard({ name: "x" })).toThrow(CardImportError);
    expect(() => importCard({ spec: "chara_card_v2" })).toThrow(CardImportError);
    expect(() => importCard({ spec: "chara_card_v2", spec_version: "2.0", data: [] })).toThrow(CardImportError);
  });

  it("warns when spec_version differs from the standard", () => {
    const result = importCard({ spec: "chara_card_v2", spec_version: "2.1", data: { ...v2Core } });
    expect(result.warnings.some((w) => w.includes("spec_version"))).toBe(true);
  });
});

describe("V1 import and V2 upgrade", () => {
  it("detects a flat V1 card, maps fields, and exports as V2 with a notice", () => {
    const v1 = {
      name: "Old Bot",
      description: "d",
      personality: "p",
      scenario: "s",
      first_mes: "hi",
      mes_example: "ex",
    };
    const result = importCard(v1);
    expect(result.format).toBe("v1");
    expect(result.data.name).toBe("Old Bot");
    expect(result.warnings.some((w) => w.includes("export as V2"))).toBe(true);

    const exp = buildV2Envelope(result.data, result.preserved);
    expect(exp.envelope.spec).toBe("chara_card_v2");
    expect(exp.envelope.data.name).toBe("Old Bot");
  });
});

describe("V2 JSON round trip with opaque preservation", () => {
  const v2Envelope = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      ...v2Core,
      extensions: { "my_app/voice": { enabled: true } },
      character_book: { name: "Lore", entries: [{ keys: ["tower"], content: "The tower is old.", enabled: true, insertion_order: 10 }] },
      custom_field: { nested: { deep: [1, 2, 3] } },
    },
  };

  it("preserves extensions, character_book, and unknown data fields across a round trip", () => {
    const result = importCard(v2Envelope);
    expect(result.format).toBe("v2");
    expect(result.data.tags).toBe("test, bot");
    expect(result.preserved.extensions).toEqual({ "my_app/voice": { enabled: true } });
    expect(result.preserved.character_book).toEqual(v2Envelope.data.character_book);
    expect(result.preserved.unknownDataFields).toEqual({ custom_field: { nested: { deep: [1, 2, 3] } } });
    expect(result.warnings.some((w) => w.includes("1 unsupported field(s)"))).toBe(true);

    const exp = buildV2Envelope(result.data, result.preserved);
    expect(exp.envelope.data).toEqual(v2Envelope.data);
  });

  it("keeps character_book untouched (no editor mutation)", () => {
    const result = importCard(v2Envelope);
    const exp = buildV2Envelope(result.data, result.preserved);
    expect(exp.envelope.data.character_book).toEqual(v2Envelope.data.character_book);
  });

  it("defaults missing extensions to {}", () => {
    const result = importCard({ spec: "chara_card_v2", spec_version: "2.0", data: { ...v2Core } });
    expect(result.preserved.extensions).toEqual({});
    const exp = buildV2Envelope(result.data, result.preserved);
    expect(exp.envelope.data.extensions).toEqual({});
  });
});

describe("security", () => {
  it("strips prototype-pollution keys from opaque bags", () => {
    const raw = JSON.parse(
      '{"spec":"chara_card_v2","spec_version":"2.0","data":' +
        '{"name":"x","description":"y","personality":"z","scenario":"w","first_mes":"m","mes_example":"e",' +
        '"extensions":{"__proto__":{"polluted":true},"good":1},"__proto__":{"bad":true}}}',
    );
    const result = importCard(raw);
    expect(result.preserved.extensions).toEqual({ good: 1 });
    expect(result.preserved.unknownDataFields).toEqual({});
    expect(result.warnings.some((w) => w.includes("unsafe key(s)"))).toBe(true);
  });

  it("sanitizeOpaque removes constructor/prototype keys recursively", () => {
    const raw = JSON.parse('{"constructor":{"x":1},"prototype":{"y":2},"ok":true,"arr":[{"__proto__":{}}]}');
    expect(sanitizeOpaque(raw)).toEqual({ ok: true, arr: [{}] });
  });
});

describe("filename sanitization", () => {
  it("strips path separators, control characters, and invalid filename characters", () => {
    expect(sanitizeFilename("a/b\\c")).toBe("abc");
    expect(sanitizeFilename("My Card/Name")).toBe("My CardName");
    expect(sanitizeFilename("luna: star?")).toBe("luna star");
    expect(sanitizeFilename("bad\u0000name")).toBe("badname");
    expect(sanitizeFilename("a<b>c|d\"e")).toBe("abcde");
  });

  it("falls back to a safe default for empty names", () => {
    expect(sanitizeFilename("")).toBe("character");
    expect(sanitizeFilename("   ")).toBe("character");
  });
});

describe("V3 draft import/preservation and export", () => {
  const v3Envelope = {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      ...v2Core,
      nickname: "Botty",
      source: ["https://example.com/card"],
      group_only_greetings: ["group hi"],
      creator_notes_multilingual: { es: "notas" },
      creation_date: 1700000000,
      assets: [
        { type: "icon", uri: "ccdefault:", name: "main", ext: "png" },
        { type: "emotion", uri: "embeded://assets/emotion/happy.png", name: "happy", ext: "png" },
      ],
    },
  };

  it("imports and exports valid V3 assets and required fields", () => {
    const result = importCard(v3Envelope);
    expect(result.format).toBe("v3");
    expect(result.preserved.assets).toHaveLength(2);
    expect(result.data.group_only_greetings).toEqual(["group hi"]);

    const exp = buildV3Envelope(result.data, result.preserved);
    expect(exp.envelope.spec).toBe("chara_card_v3");
    expect(exp.envelope.data.group_only_greetings).toEqual(["group hi"]);
    expect(exp.envelope.data.assets).toEqual(v3Envelope.data.assets);
    expect(exp.envelope.data.nickname).toBe("Botty");
    expect(exp.envelope.data.source).toEqual(["https://example.com/card"]);
    expect(exp.envelope.data.creator_notes_multilingual).toEqual({ es: "notas" });
    expect(exp.envelope.data.creation_date).toBe(1700000000);
    expect(typeof exp.envelope.data.modification_date).toBe("number");
    expect(exp.envelope.data.modification_date).toBeGreaterThanOrEqual(1700000000);
  });

  it("preserves non-conformant assets read-only and never exports them", () => {
    const withBadAssets = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        ...v2Core,
        group_only_greetings: [],
        assets: [
          { type: "icon", uri: "ccdefault:", name: "main", ext: "png" }, // valid
          { type: "icon", uri: "x", name: "missing ext" }, // invalid shape
          { type: "expression", uri: "x", name: "y", ext: "png" }, // non-canonical type
        ],
      },
    };
    const result = importCard(withBadAssets);
    expect(result.preserved.assets).toHaveLength(1);
    expect(result.preserved.preservedAssets).toHaveLength(2);
    expect(result.warnings.some((w) => w.includes("2 asset(s)"))).toBe(true);

    const exp = buildV3Envelope(result.data, result.preserved);
    expect(exp.envelope.data.assets).toHaveLength(1);
    expect(exp.warnings.some((w) => w.includes("2 preserved asset(s)"))).toBe(true);
  });

  it("warns and omits V3-only fields when downgrading to V2", () => {
    const result = importCard(v3Envelope);
    const exp = buildV2Envelope(result.data, result.preserved);
    expect(exp.warnings.some((w) => w.includes("V3 draft fields"))).toBe(true);
    expect(exp.envelope.data.nickname).toBeUndefined();
    expect(exp.envelope.data.assets).toBeUndefined();
    expect(exp.envelope.data.group_only_greetings).toBeUndefined();
  });
});

describe("size limits", () => {
  it("exposes the documented import limits", () => {
    expect(MAX_PNG_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_JSON_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("helpers", () => {
  it("produces fresh empty models", () => {
    expect(emptyCardData().name).toBe("");
    expect(emptyPreserved().extensions).toEqual({});
    expect(emptyPreserved().assets).toEqual([]);
  });
});

describe("rejecting non-card input (no AI fallback)", () => {
  it("rejects arbitrary plain text", () => {
    expect(() => importCard("not valid json")).toThrow(CardImportError);
  });

  it("rejects valid JSON that is not a card structure", () => {
    expect(() => importCard({ foo: "bar" })).toThrow(CardImportError);
    expect(() => importCard({ name: "only a name" })).toThrow(CardImportError);
  });

  it("rejects non-object JSON primitives", () => {
    expect(() => importCard([1, 2, 3])).toThrow(CardImportError);
    expect(() => importCard("a string")).toThrow(CardImportError);
    expect(() => importCard(42)).toThrow(CardImportError);
    expect(() => importCard(null)).toThrow(CardImportError);
  });

  it("leaves the internal model untouched (pure importCard never mutates inputs)", () => {
    const before = emptyCardData();
    const json = { name: "x" };
    expect(() => importCard(json)).toThrow(CardImportError);
    expect(before).toEqual(emptyCardData());
    expect(json).toEqual({ name: "x" });
  });
});
