import { describe, expect, it } from "vitest";
import { buildV2Envelope, buildV3Envelope } from "@/lib/cardCodec";
import { emptyCardData, emptyPreserved } from "@/lib/cardTypes";
import {
  createEmptyLorebook,
  emptyEntry,
  toCharacterBook,
} from "@/lib/lorebookStorage";

describe("toCharacterBook embed for card export", () => {
  it("converts bound lorebook entries into character_book shape", () => {
    const book = createEmptyLorebook({
      name: "Crystal Court",
      entries: [
        {
          ...emptyEntry("e1"),
          keys: ["tower", "crystal"],
          secondaryKeys: "sigil, ward",
          content: "The crystal tower hums.",
          insertionOrder: 10,
          constant: false,
          position: "before_char",
        },
      ],
    });
    const payload = toCharacterBook(book);
    expect(payload.name).toBe("Crystal Court");
    expect(Array.isArray(payload.entries)).toBe(true);
    const entries = payload.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0].keys).toEqual(["tower", "crystal"]);
    expect(entries[0].secondary_keys).toEqual(["sigil", "ward"]);
    expect(entries[0].content).toBe("The crystal tower hums.");
    expect(entries[0].enabled).toBe(true);
    expect(entries[0].insertion_order).toBe(10);
  });

  it("embeds character_book into V3 (and V2) export envelopes", () => {
    const book = createEmptyLorebook({
      name: "Harbor Lore",
      entries: [{ ...emptyEntry(), keys: ["dock"], content: "Neon Harbor docks." }],
    });
    const character_book = toCharacterBook(book);
    const card = { ...emptyCardData(), name: "Maya" };
    const preserved = { ...emptyPreserved(), character_book };
    const v3 = buildV3Envelope(card, preserved);
    expect(v3.envelope.spec).toBe("chara_card_v3");
    expect(v3.envelope.data.character_book).toEqual(character_book);
    const v2 = buildV2Envelope(card, preserved);
    expect(v2.envelope.data.character_book).toEqual(character_book);
  });
});
