/**
 * Per-slot portrait persistence for Character Card Builder.
 * Keeps the current PNG across exports/gens and card switches.
 * Uses IndexedDB when available; falls back to in-memory only.
 */

const DB_NAME = "ai-companion-hub-portraits";
const STORE = "portraits";
const DB_VERSION = 1;

export type PortraitRecord = {
  cardId: string;
  name: string;
  type: string;
  lastModified: number;
  bytes: ArrayBuffer;
};

const memory = new Map<string, File>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "cardId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

export function cachePortrait(cardId: string, file: File | null): void {
  if (!cardId) return;
  if (file) memory.set(cardId, file);
  else memory.delete(cardId);
}

export function getCachedPortrait(cardId: string): File | null {
  return memory.get(cardId) ?? null;
}

export async function savePortrait(cardId: string, file: File): Promise<void> {
  cachePortrait(cardId, file);
  const db = await openDb();
  if (!db) return;
  const bytes = await file.arrayBuffer();
  const record: PortraitRecord = {
    cardId,
    name: file.name || "portrait.png",
    type: file.type || "image/png",
    lastModified: file.lastModified || Date.now(),
    bytes,
  };
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export async function loadPortrait(cardId: string): Promise<File | null> {
  const cached = getCachedPortrait(cardId);
  if (cached) return cached;
  const db = await openDb();
  if (!db) return null;
  const record = await new Promise<PortraitRecord | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(cardId);
      req.onsuccess = () => resolve((req.result as PortraitRecord | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  if (!record?.bytes) return null;
  const file = new File([record.bytes], record.name || "portrait.png", {
    type: record.type || "image/png",
    lastModified: record.lastModified || Date.now(),
  });
  cachePortrait(cardId, file);
  return file;
}

export async function deletePortrait(cardId: string): Promise<void> {
  cachePortrait(cardId, null);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(cardId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** Test helper: expose memory map size without touching IndexedDB. */
export function __portraitMemorySizeForTests(): number {
  return memory.size;
}

export function __clearPortraitMemoryForTests(): void {
  memory.clear();
}

/**
 * Accept PNG/JPEG/WebP (and other browser-decodable images). Keep PNG as-is;
 * convert other formats to a PNG File via canvas before portraitStorage.
 */
export async function convertImageFileToPng(file: File): Promise<File> {
  const type = (file.type || "").toLowerCase();
  const nameLower = file.name.toLowerCase();
  if (type === "image/png" || nameLower.endsWith(".png")) {
    return file.type === "image/png"
      ? file
      : new File([file], file.name.endsWith(".png") ? file.name : `${file.name || "portrait"}.png`, {
          type: "image/png",
          lastModified: file.lastModified || Date.now(),
        });
  }
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot convert images to PNG.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable for PNG conversion.");
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG conversion failed."))), "image/png");
    });
    const base = (file.name || "portrait").replace(/\.[^.]+$/, "") || "portrait";
    return new File([blob], `${base}.png`, { type: "image/png", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
