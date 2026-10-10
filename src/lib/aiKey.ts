/**
 * Bring-your-own-key (BYOK) for AI generation.
 *
 * A visitor's OpenRouter key lives ONLY in this browser's localStorage and is
 * attached to each AI request. The Hub's edge function forwards it to
 * OpenRouter for that single call and never stores it. Clearing the field
 * removes it from the browser.
 */

export const AI_KEY_STORAGE = "ai-companion-hub-openrouter-key";
export const AI_KEY_MODEL_STORAGE = "ai-companion-hub-openrouter-model";

/** Default model for the shared path and for BYOK when no model is given. */
export const DEFAULT_OPENROUTER_MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition";

/** Where visitors create a free OpenRouter key. */
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";

/** Access-request destinations. */
export const REQUEST_ACCESS_EMAIL = "companionhub.winter821@aleeas.com";
export const REQUEST_ACCESS_SUBJECT = "AI access request — companionhub.app";

/**
 * Live form endpoint that POSTs the access request server-side (no mail client
 * needed). It also emails REQUEST_ACCESS_EMAIL, so requests are captured even
 * when the visitor has no mail app. Set to "" to force the mailto fallback.
 */
export const REQUEST_ACCESS_ENDPOINT = "https://formsubmit.co/ajax/companionhub.winter821@aleeas.com";

export interface StoredAiKey {
  key: string;
  model: string;
}

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

export function loadAiKey(): StoredAiKey {
  if (!canUseStorage()) return { key: "", model: DEFAULT_OPENROUTER_MODEL };
  let key = "";
  let model = DEFAULT_OPENROUTER_MODEL;
  try {
    key = (window.localStorage.getItem(AI_KEY_STORAGE) || "").trim();
    model = (window.localStorage.getItem(AI_KEY_MODEL_STORAGE) || "").trim() || DEFAULT_OPENROUTER_MODEL;
  } catch {
    // ignore storage failures (private mode / storage disabled)
  }
  return { key, model };
}

export function saveAiKey(input: { key: string; model?: string }): StoredAiKey {
  const key = (input.key || "").trim();
  const model = (input.model || "").trim() || DEFAULT_OPENROUTER_MODEL;
  if (canUseStorage()) {
    try {
      if (key) window.localStorage.setItem(AI_KEY_STORAGE, key);
      else window.localStorage.removeItem(AI_KEY_STORAGE);
      window.localStorage.setItem(AI_KEY_MODEL_STORAGE, model);
    } catch {
      // ignore storage failures
    }
  }
  return { key, model };
}

export function clearAiKey(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(AI_KEY_STORAGE);
  } catch {
    // ignore
  }
}

/** Mask a key for display: sk-or-v1…c45 */
export function maskKey(key: string): string {
  const k = (key || "").trim();
  if (k.length <= 10) return k ? "••••" : "";
  return `${k.slice(0, 8)}…${k.slice(-3)}`;
}

/** mailto: link that pre-fills an access request. */
export function requestAccessHref(note?: string): string {
  const body = [
    "Hi — I'd like AI access on companionhub.app.",
    "",
    "What I'm working on:",
    "",
    note ? `Context: ${note}` : "",
  ].join("\n");
  return `mailto:${REQUEST_ACCESS_EMAIL}?subject=${encodeURIComponent(REQUEST_ACCESS_SUBJECT)}&body=${encodeURIComponent(body)}`;
}

/**
 * Send an access request through the form endpoint. Falls back to the visitor's
 * mail client (mailto) when no endpoint is configured or the POST fails, so a
 * request is never silently lost.
 */
export async function sendAccessRequest(input: {
  name?: string;
  contact?: string;
  note?: string;
  context?: string;
}): Promise<{ ok: boolean; via: "endpoint" | "mailto" }> {
  const noteParts = [input.note, input.context ? `Context: ${input.context}` : ""].filter(Boolean).join("\n");
  const payload = {
    _subject: REQUEST_ACCESS_SUBJECT,
    name: (input.name || "").trim(),
    contact: (input.contact || "").trim(),
    note: (input.note || "").trim(),
    context: (input.context || "").trim(),
    message: noteParts,
  };

  if (REQUEST_ACCESS_ENDPOINT) {
    try {
      const response = await fetch(REQUEST_ACCESS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) return { ok: true, via: "endpoint" };
    } catch {
      // fall through to mailto
    }
  }

  if (typeof window !== "undefined") {
    window.location.href = requestAccessHref(noteParts);
  }
  return { ok: true, via: "mailto" };
}

/** Short steps shown next to the key field. */
export const HOW_TO_GET_KEY_STEPS = [
  "Create a free account at openrouter.ai.",
  "Open Keys and click Create Key.",
  "Copy the key — it starts with sk-or-v1-.",
  "Paste it here and Save. It stays in this browser only.",
];

/**
 * Merge a stored BYOK key/model into an edge-function request body. No key
 * means the request falls back to the Hub's shared provider path.
 */
export function withAiKey(body: Record<string, unknown>, stored?: StoredAiKey): Record<string, unknown> {
  const resolved = stored ?? loadAiKey();
  const key = (resolved.key || "").trim();
  if (!key) return body;
  const model = (resolved.model || "").trim();
  return model ? { ...body, openrouterKey: key, openrouterModel: model } : { ...body, openrouterKey: key };
}

/** True when a client key is present (used to keep AI enabled with no server key). */
export function hasAiKey(stored?: StoredAiKey): boolean {
  return ((stored ?? loadAiKey()).key || "").trim().length > 0;
}