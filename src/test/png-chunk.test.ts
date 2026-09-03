import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { embedCardInPngBytes, extractCardFromPng } from "@/lib/pngChunk";

// ---- Synthetic PNG builder (no copyrighted fixtures) -----------------------

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function textChunk(keyword: string, text: string): Uint8Array {
  const key = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(text);
  const data = new Uint8Array(key.length + 1 + textBytes.length);
  data.set(key, 0);
  data.set(new Uint8Array([0]), key.length);
  data.set(textBytes, key.length + 1);
  return chunk("tEXt", data);
}

function b64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function makePng(extra: Uint8Array[] = [], width = 64, height = 64): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = new Uint8Array(1 + width * 4 * height);
  const idat = deflateSync(raw);
  const parts = [signature, chunk("IHDR", ihdr), ...extra, chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

interface WalkedChunk {
  length: number;
  type: string;
  data: Uint8Array;
}

function walkChunks(bytes: Uint8Array): WalkedChunk[] {
  const out: WalkedChunk[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    out.push({ length, type, data: bytes.slice(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return out;
}

function idatBytes(bytes: Uint8Array): Uint8Array {
  const idat = walkChunks(bytes).find((c) => c.type === "IDAT");
  return idat ? idat.data : new Uint8Array(0);
}

function countKeyword(bytes: Uint8Array, keyword: string): number {
  let count = 0;
  for (const c of walkChunks(bytes)) {
    if (c.type !== "tEXt") continue;
    const nullIdx = c.data.indexOf(0);
    if (nullIdx === -1) continue;
    const kw = new TextDecoder().decode(c.data.slice(0, nullIdx));
    if (kw === keyword) count += 1;
  }
  return count;
}

function bytesContain(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

const v2Card = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "V2 Bot", description: "d", personality: "p", scenario: "s", first_mes: "hi", mes_example: "e" } };
const v2CardB = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "V2 Bot B", description: "d", personality: "p", scenario: "s", first_mes: "hi", mes_example: "e" } };
const v3Card = { spec: "chara_card_v3", spec_version: "3.0", data: { name: "V3 Bot", description: "d", personality: "p", scenario: "s", first_mes: "hi", mes_example: "e" } };

// ---- Tests -----------------------------------------------------------------

describe("PNG structure validation", () => {
  it("rejects a file that is too small", () => {
    expect(extractCardFromPng(new Uint8Array([1, 2, 3]))).toEqual({ status: "invalid", reason: "File too small to be a PNG" });
  });

  it("rejects an invalid PNG signature", () => {
    const bad = makePng();
    bad[0] = 0x00;
    expect(extractCardFromPng(bad)).toEqual({ status: "invalid", reason: "Invalid PNG signature" });
  });

  it("rejects a PNG whose first chunk is not IHDR", () => {
    const bad = makePng();
    bad[12] = 0x41; bad[13] = 0x42; bad[14] = 0x43; bad[15] = 0x44; // "ABCD"
    expect(extractCardFromPng(bad)).toEqual({ status: "invalid", reason: "Missing IHDR chunk" });
  });

  it("rejects a truncated chunk", () => {
    const png = makePng();
    let offset = 8;
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let idatDataStart = -1;
    let idatDataEnd = -1;
    while (offset + 12 <= png.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
      if (type === "IDAT") { idatDataStart = offset + 8; idatDataEnd = offset + 8 + length; break; }
      offset += 12 + length;
    }
    expect(idatDataStart).toBeGreaterThan(0);
    // Remove the entire IDAT payload so the declared length exceeds the remaining bytes.
    const truncated = new Uint8Array([...png.slice(0, idatDataStart), ...png.slice(idatDataEnd)]);
    const result = extractCardFromPng(truncated);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.reason).toContain("Truncated PNG");
  });

  it("throws when embedding into an invalid PNG", () => {
    expect(() => embedCardInPngBytes(new Uint8Array([1, 2, 3]), v2Card, "chara")).toThrow(/PNG/);
  });
});

describe("PNG card embed/extract round trip", () => {
  it("embeds and extracts a V2 card, preserving pixel data", () => {
    const png = makePng();
    const embedded = embedCardInPngBytes(png, v2Card, "chara");
    expect(Array.from(idatBytes(embedded))).toEqual(Array.from(idatBytes(png)));

    const result = extractCardFromPng(embedded);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.chunkName).toBe("chara");
      expect(result.data).toEqual(v2Card);
    }
  });

  it("returns a distinct no-card result for a PNG without card metadata", () => {
    expect(extractCardFromPng(makePng())).toEqual({ status: "no-card" });
  });

  it("preserves non-card chunks byte-for-byte", () => {
    const comment = textChunk("Comment", "hello world");
    const author = textChunk("Author", "me");
    const png = makePng([comment, author]);
    const embedded = embedCardInPngBytes(png, v2Card, "chara");
    expect(bytesContain(embedded, comment)).toBe(true);
    expect(bytesContain(embedded, author)).toBe(true);
    expect(Array.from(idatBytes(embedded))).toEqual(Array.from(idatBytes(png)));
  });

  it("replaces an existing card chunk instead of duplicating it", () => {
    const png = makePng();
    const first = embedCardInPngBytes(png, v2Card, "chara");
    const second = embedCardInPngBytes(first, v2CardB, "chara");
    expect(countKeyword(second, "chara")).toBe(1);
    const result = extractCardFromPng(second);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data).toEqual(v2CardB);
  });
});

describe("PNG chunk error handling", () => {
  it("reports invalid base64 distinctly", () => {
    const png = makePng([textChunk("chara", "!!!not-base64!!!")]);
    const result = extractCardFromPng(png);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.reason).toContain("invalid base64");
  });

  it("reports malformed JSON distinctly", () => {
    const png = makePng([textChunk("chara", b64("not json at all"))]);
    const result = extractCardFromPng(png);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.reason).toContain("malformed JSON");
  });
});

describe("V3 ccv3 handling", () => {
  it("prefers ccv3 over chara when both chunks are present", () => {
    const png = makePng([
      textChunk("chara", b64(JSON.stringify(v2Card))),
      textChunk("ccv3", b64(JSON.stringify(v3Card))),
    ]);
    const result = extractCardFromPng(png);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.chunkName).toBe("ccv3");
      expect(result.data).toEqual(v3Card);
    }
  });

  it("removes a legacy chara chunk when embedding V3", () => {
    const png = makePng([textChunk("chara", b64(JSON.stringify(v2Card)))]);
    const embedded = embedCardInPngBytes(png, v3Card, "ccv3");
    expect(countKeyword(embedded, "chara")).toBe(0);
    expect(countKeyword(embedded, "ccv3")).toBe(1);
    const result = extractCardFromPng(embedded);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.chunkName).toBe("ccv3");
  });
});
