/**
 * Bring-your-own-key (BYOK) compatibility wrapper + access-request helpers.
 *
 * Delegates multi-provider BYOK storage and request merging to `@/lib/aiProvider`.
 */

import {
  DEFAULT_PROVIDER_MODEL,
  HOW_TO_GET_KEY_STEPS as PROVIDER_KEY_STEPS,
  clearAllByok,
  clearProvider,
  hasByok,
  loadByok,
  maskKey as providerMaskKey,
  saveByok,
  withAiProvider,
  type ByokState,
  type ModelCatalog,
  type ModelOption,
  type ProviderId,
} from "./aiProvider";

export {
  clearAllByok,
  clearProvider,
  hasByok,
  loadByok,
  saveByok,
  withAiProvider,
  type ByokState,
  type ModelCatalog,
  type ModelOption,
  type ProviderId,
};

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

export function loadAiKey(): StoredAiKey {
  const state = loadByok();
  return {
    key: state.keys.openrouter || "",
    model: state.models.openrouter || DEFAULT_PROVIDER_MODEL.openrouter,
  };
}

export function saveAiKey(input: { key: string; model?: string }): StoredAiKey {
  const current = loadByok();
  const key = (input.key || "").trim();
  const model = (input.model || "").trim() || DEFAULT_PROVIDER_MODEL.openrouter;
  const nextKeys = { ...current.keys };
  if (key) nextKeys.openrouter = key;
  else delete nextKeys.openrouter;
  const saved = saveByok({
    ...current,
    keys: nextKeys,
    models: { ...current.models, openrouter: model },
  });
  return {
    key: saved.keys.openrouter || "",
    model: saved.models.openrouter || DEFAULT_PROVIDER_MODEL.openrouter,
  };
}

export function clearAiKey(): void {
  clearProvider("openrouter");
}

/** Mask a key for display: sk-or-v1…c45 */
export function maskKey(key: string): string {
  return providerMaskKey(key);
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
export const HOW_TO_GET_KEY_STEPS = PROVIDER_KEY_STEPS.openrouter;

/**
 * Merge stored 3-provider BYOK keys and model preferences into an edge-function
 * request body. When called with an explicit legacy `StoredAiKey`, honors it.
 */
export function withAiKey(body: Record<string, unknown>, stored?: StoredAiKey): Record<string, unknown> {
  if (stored) {
    const key = (stored.key || "").trim();
    if (!key) return body;
    const model = (stored.model || "").trim();
    return {
      ...body,
      byok: { openrouter: key },
      ...(model ? { models: { openrouter: [model] }, openrouterModel: model } : {}),
      openrouterKey: key,
    };
  }
  return withAiProvider(body);
}

/** True when any client BYOK key is present (keeps AI enabled with no server key). */
export function hasAiKey(stored?: StoredAiKey): boolean {
  if (stored) return (stored.key || "").trim().length > 0;
  return hasByok();
}
