/**
 * PNG tEXt chunk reader/writer for character-card metadata.
 *
 * Conventions (authoritative):
 * - V2 cards are embedded in a `chara` tEXt chunk whose value is the base64
 *   (utf-8) JSON string of the card envelope.
 * - V3 draft cards are embedded in a `ccv3` tEXt chunk with the same encoding.
 *   When both chunks exist, applications SHOULD prefer `ccv3` (V3 draft spec).
 *
 * Invariant: we never claim the PNG stays byte-identical after an edit. We
 * preserve every non-card chunk and all pixel/image data byte-for-byte, and we
 * insert, replace, or remove only the relevant card metadata chunks (`chara`
 * and `ccv3`). An existing card chunk is replaced, never duplicated.
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type PngCardChunkName = "chara" | "ccv3";

export type ExtractCardResult =
  | { status: "ok"; chunkName: PngCardChunkName; data: Record<string, unknown> }
  | { status: "no-card" }
  | { status: "invalid"; reason: string };

function crc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToUtf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function createTextChunk(keyword: string, text: string): Uint8Array {
  const keyBytes = new TextEncoder().encode(keyword);
  const nullByte = new Uint8Array([0]);
  const textBytes = new TextEncoder().encode(text);

  const chunkData = new Uint8Array(keyBytes.length + 1 + textBytes.length);
  chunkData.set(keyBytes, 0);
  chunkData.set(nullByte, keyBytes.length);
  chunkData.set(textBytes, keyBytes.length + 1);

  const typeBytes = new TextEncoder().encode("tEXt");
  const crcInput = new Uint8Array(4 + chunkData.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(chunkData, 4);
  const crc = crc32(crcInput);

  // length (4) + type (4) + data + crc (4)
  const chunk = new Uint8Array(12 + chunkData.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, chunkData.length);
  chunk.set(typeBytes, 4);
  chunk.set(chunkData, 8);
  view.setUint32(8 + chunkData.length, crc);

  return chunk;
}

interface ChunkInfo {
  /** Byte offset of the chunk's length field. */
  offset: number;
  length: number;
  type: string;
  dataStart: number;
  dataEnd: number;
  /** Byte offset just past the chunk (start of the next chunk). */
  end: number;
}

/**
 * Validate PNG structure: signature, IHDR as first chunk, bounded chunk
 * lengths, and a terminating IEND. Returns an error message or null when valid.
 */
function validatePngStructure(bytes: Uint8Array): string | null {
  if (bytes.length < 8 + 12 + 12) return "File too small to be a PNG";
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return "Invalid PNG signature";
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstLength = view.getUint32(8);
  const firstType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (firstType !== "IHDR") return "Missing IHDR chunk";
  if (8 + 12 + firstLength > bytes.length) return "Truncated PNG: IHDR chunk exceeds file bounds";

  let offset = 8;
  let sawIend = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (offset + 12 + length > bytes.length) {
      return `Truncated PNG: ${type} chunk exceeds file bounds`;
    }
    offset += 12 + length;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }
  if (!sawIend) return "Missing IEND chunk";
  return null;
}

/** Parse all chunks (assumes the structure was already validated). */
function parseChunks(bytes: Uint8Array): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    chunks.push({
      offset,
      length,
      type,
      dataStart: offset + 8,
      dataEnd: offset + 8 + length,
      end: offset + 12 + length,
    });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

/** Keyword of a tEXt chunk (text before the first null byte), or null. */
function chunkKeyword(bytes: Uint8Array, chunk: ChunkInfo): string | null {
  const data = bytes.slice(chunk.dataStart, chunk.dataEnd);
  const nullIdx = data.indexOf(0);
  if (nullIdx === -1) return null;
  return new TextDecoder().decode(data.slice(0, nullIdx));
}

/**
 * Extract a character card from PNG bytes.
 *
 * - `ok` with `chunkName` + parsed envelope JSON when a valid card chunk exists
 *   (`ccv3` is preferred over `chara` when both are present).
 * - `no-card` when the PNG has no `chara`/`ccv3` chunk at all.
 * - `invalid` with a distinct reason for structural corruption, invalid base64,
 *   or malformed JSON.
 */
export function extractCardFromPng(bytes: Uint8Array): ExtractCardResult {
  const structureError = validatePngStructure(bytes);
  if (structureError) return { status: "invalid", reason: structureError };

  const candidates: { chunkName: PngCardChunkName; text: string }[] = [];
  for (const chunk of parseChunks(bytes)) {
    if (chunk.type !== "tEXt") continue;
    const keyword = chunkKeyword(bytes, chunk);
    if (keyword !== "ccv3" && keyword !== "chara") continue;
    const data = bytes.slice(chunk.dataStart, chunk.dataEnd);
    const nullIdx = data.indexOf(0);
    if (nullIdx === -1) continue;
    candidates.push({
      chunkName: keyword,
      text: new TextDecoder().decode(data.slice(nullIdx + 1)),
    });
  }

  if (candidates.length === 0) return { status: "no-card" };

  // Prefer ccv3 over chara when both are valid (V3 draft spec).
  const sorted = [...candidates].sort((a, b) => (a.chunkName === "ccv3" ? -1 : 1));
  const reasons: string[] = [];
  for (const candidate of sorted) {
    let jsonStr: string;
    try {
      jsonStr = base64ToUtf8(candidate.text);
    } catch {
      reasons.push(`invalid base64 in ${candidate.chunkName} metadata`);
      continue;
    }
    try {
      const json: unknown = JSON.parse(jsonStr);
      if (typeof json !== "object" || json === null || Array.isArray(json)) {
        reasons.push(`malformed JSON in ${candidate.chunkName} metadata`);
        continue;
      }
      return { status: "ok", chunkName: candidate.chunkName, data: json as Record<string, unknown> };
    } catch {
      reasons.push(`malformed JSON in ${candidate.chunkName} metadata`);
    }
  }

  return { status: "invalid", reason: reasons.join("; ") };
}

/**
 * Embed a card envelope into PNG bytes, preserving all non-card chunks and
 * pixel data byte-for-byte. Any existing `chara` or `ccv3` card chunk is
 * replaced (never duplicated), then the requested chunk is inserted before
 * IEND. Throws on structurally invalid PNG input.
 */
export function embedCardInPngBytes(
  bytes: Uint8Array,
  cardJson: object,
  chunkName: PngCardChunkName = "chara",
): Uint8Array {
  const structureError = validatePngStructure(bytes);
  if (structureError) throw new Error(structureError);

  const chunks = parseChunks(bytes);
  const iend = chunks.find((chunk) => chunk.type === "IEND");
  if (!iend) throw new Error("Missing IEND chunk");

  const jsonStr = JSON.stringify(cardJson);
  const base64 = utf8ToBase64(jsonStr);
  const textChunk = createTextChunk(chunkName, base64);

  const parts: Uint8Array[] = [bytes.slice(0, 8)]; // signature
  for (const chunk of chunks) {
    if (chunk.type === "IEND") break;
    const keyword = chunk.type === "tEXt" ? chunkKeyword(bytes, chunk) : null;
    if (keyword === "chara" || keyword === "ccv3") continue; // replace card chunks
    parts.push(bytes.slice(chunk.offset, chunk.end));
  }
  parts.push(textChunk);
  parts.push(bytes.slice(iend.offset, iend.end));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    result.set(part, position);
    position += part.length;
  }
  return result;
}

/** File/Blob wrapper around `embedCardInPngBytes`. */
export async function embedCardInPng(
  pngFile: File | Blob,
  cardJson: object,
  chunkName: PngCardChunkName = "chara",
): Promise<Blob> {
  const bytes = new Uint8Array(await pngFile.arrayBuffer());
  const result = embedCardInPngBytes(bytes, cardJson, chunkName);
  return new Blob([result], { type: "image/png" });
}
