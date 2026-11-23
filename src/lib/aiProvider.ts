// src/lib/aiProvider.ts   (replaces src/lib/aiKey.ts)
import { supabase } from "@/integrations/supabase/client";

export type ProviderId = "venice" | "openrouter" | "oneprovider";
export const PROVIDER_IDS: ProviderId[] = ["venice", "openrouter", "oneprovider"];

export interface ByokState {
  keys: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
  preferredProvider: ProviderId | null;
  allowSharedFallback?: boolean;
  temperature?: number;
}

export const BYOK_STORAGE_KEY = "ai-companion-hub-byok-v1";
export const MODEL_CACHE_KEY = "ai-companion-hub-model-catalog-v1";
export const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const LEGACY_OPENROUTER_KEY_STORAGE = "ai-companion-hub-openrouter-key";
export const LEGACY_OPENROUTER_MODEL_STORAGE = "ai-companion-hub-openrouter-model";

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  venice: "Venice",
  openrouter: "OpenRouter",
  oneprovider: "OneProvider",
};

export const PROVIDER_KEYS_URL: Record<ProviderId, string> = {
  venice: "https://venice.ai/settings/api",
  openrouter: "https://openrouter.ai/keys",
  oneprovider: "https://oneprovider.dev",
};

export const SEED_MODELS: Record<ProviderId, string[]> = {
  venice: ["z-ai-glm-5-3-flash"],
  openrouter: [
    "cognitivecomputations/dolphin-mistral-24b-venice-edition",
    "sao10k/l3.3-euryale-70b",
    "gryphe/mythomax-l2-13b",
    "google/gemma-4-31b-it:free",
  ],
  oneprovider: ["grok-4.7", "glm-5.3-flash", "deepseek-v4.1-flash-1017"],
};

export const DEFAULT_PROVIDER_MODEL: Record<ProviderId, string> = {
  venice: "z-ai-glm-5-3-flash",
  openrouter: "cognitivecomputations/dolphin-mistral-24b-venice-edition",
  oneprovider: "grok-4.7",
};

const EMPTY: ByokState = { keys: {}, models: {}, preferredProvider: null };

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function loadByok(): ByokState {
  if (!canUseStorage()) return { keys: {}, models: {}, preferredProvider: null };
  try {
    const rawStr = window.localStorage.getItem(BYOK_STORAGE_KEY);
    const raw = JSON.parse(rawStr || "null");
    const keys: ByokState["keys"] = {};
    const models: ByokState["models"] = {};

    if (raw && typeof raw === "object") {
      for (const id of PROVIDER_IDS) {
        const k = raw.keys?.[id];
        const m = raw.models?.[id];
        if (typeof k === "string" && k.trim()) keys[id] = k.trim();
        if (typeof m === "string" && m.trim()) models[id] = m.trim();
      }
    }

    if (!rawStr) {
      const legacyKey = (window.localStorage.getItem(LEGACY_OPENROUTER_KEY_STORAGE) || "").trim();
      const legacyModel = (window.localStorage.getItem(LEGACY_OPENROUTER_MODEL_STORAGE) || "").trim();
      if (legacyKey) keys.openrouter = legacyKey;
      if (legacyModel) models.openrouter = legacyModel;
    }

    const preferred = raw?.preferredProvider;
    const allowSharedFallback = raw?.allowSharedFallback === true ? true : undefined;
    const temperature =
      typeof raw?.temperature === "number" && Number.isFinite(raw.temperature)
        ? Math.min(1.2, Math.max(0, raw.temperature))
        : undefined;

    return {
      keys,
      models,
      preferredProvider:
        preferred === "venice" || preferred === "openrouter" || preferred === "oneprovider"
          ? preferred
          : null,
      ...(allowSharedFallback !== undefined ? { allowSharedFallback } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    };
  } catch {
    return { ...EMPTY, keys: {}, models: {} };
  }
}

export function saveByok(next: ByokState): ByokState {
  const normalized: ByokState = {
    keys: {},
    models: {},
    preferredProvider:
      next.preferredProvider === "venice" ||
      next.preferredProvider === "openrouter" ||
      next.preferredProvider === "oneprovider"
        ? next.preferredProvider
        : null,
    ...(next.allowSharedFallback === true ? { allowSharedFallback: true } : {}),
    ...(typeof next.temperature === "number" && Number.isFinite(next.temperature)
      ? { temperature: Math.min(1.2, Math.max(0, next.temperature)) }
      : {}),
  };
  for (const id of PROVIDER_IDS) {
    const k = next.keys?.[id];
    const m = next.models?.[id];
    if (typeof k === "string" && k.trim()) normalized.keys[id] = k.trim();
    if (typeof m === "string" && m.trim()) normalized.models[id] = m.trim();
  }
  if (!canUseStorage()) return normalized;
  try {
    window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(normalized));
    if (!normalized.keys.openrouter) {
      window.localStorage.removeItem(LEGACY_OPENROUTER_KEY_STORAGE);
    }
  } catch {
    /* quota */
  }
  return normalized;
}

export function clearProvider(id: ProviderId): ByokState {
  const state = loadByok();
  delete state.keys[id];
  delete state.models[id];
  if (state.preferredProvider === id) state.preferredProvider = null;
  if (id === "openrouter" && canUseStorage()) {
    try {
      window.localStorage.removeItem(LEGACY_OPENROUTER_KEY_STORAGE);
      window.localStorage.removeItem(LEGACY_OPENROUTER_MODEL_STORAGE);
    } catch {
      /* ignore */
    }
  }
  return saveByok(state);
}

export function clearAllByok(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(BYOK_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_OPENROUTER_KEY_STORAGE);
    window.localStorage.removeItem(LEGACY_OPENROUTER_MODEL_STORAGE);
  } catch {
    /* ignore */
  }
}

/** True when the visitor has any key set (AI should be enabled regardless of server keys). */
export function hasByok(): boolean {
  const s = loadByok();
  return Object.values(s.keys).some((k) => !!k && k.trim().length > 0);
}

export function maskKey(key: string): string {
  const k = (key || "").trim();
  if (k.length <= 10) return k ? "••••" : "";
  return `${k.slice(0, 8)}…${k.slice(-3)}`;
}

/**
 * Merge BYOK state into an edge request body.
 * Safe to call with no keys — returns the body unchanged so the SIMPLE path works.
 */
export function withAiProvider(body: Record<string, unknown>): Record<string, unknown> {
  const s = loadByok();
  const keys = Object.fromEntries(Object.entries(s.keys).filter(([, v]) => !!v));
  const models: Record<string, string[]> = {};
  for (const [id, model] of Object.entries(s.models)) {
    if (model) models[id] = [model as string];
  }
  if (Object.keys(keys).length === 0) {
    if (!Object.keys(models).length && !s.preferredProvider && typeof s.temperature !== "number") {
      return body;
    }
    const out: Record<string, unknown> = { ...body };
    if (Object.keys(models).length) out.models = models;
    if (s.preferredProvider) out.preferredProvider = s.preferredProvider;
    if (typeof s.temperature === "number") out.temperature = s.temperature;
    return out;
  }
  const out: Record<string, unknown> = { ...body, byok: keys };
  if (Object.keys(models).length) out.models = models;
  if (s.preferredProvider) out.preferredProvider = s.preferredProvider;
  if (s.allowSharedFallback === true) out.allowSharedFallback = true;
  if (typeof s.temperature === "number") out.temperature = s.temperature;
  return out;
}

/* ---- model catalog: fetched live via the edge `list-models` action (R4) ---- */
export interface ModelOption {
  id: string;
  name: string;
}

export interface ModelCatalog {
  fetchedAt: number;
  models: Partial<Record<ProviderId, ModelOption[]>>;
  seeds: Partial<Record<ProviderId, string[]>>;
  defaults: Partial<Record<ProviderId, string>>;
  errors: Partial<Record<ProviderId, string>>;
}

export function loadCachedCatalog(): ModelCatalog | null {
  if (!canUseStorage()) return null;
  try {
    const raw = JSON.parse(window.localStorage.getItem(MODEL_CACHE_KEY) || "null");
    if (!raw || typeof raw !== "object") return null;
    if (Date.now() - Number(raw.fetchedAt || 0) > MODEL_CACHE_TTL_MS) return null;
    return raw as ModelCatalog;
  } catch {
    return null;
  }
}

async function defaultInvoke(body: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("venice-ai", { body });
  if (error) throw new Error(error instanceof Error ? error.message : String(error));
  return data;
}

export async function fetchModelCatalog(
  invoke?: (body: Record<string, unknown>) => Promise<unknown>,
  force = false,
): Promise<ModelCatalog> {
  if (!force) {
    const cached = loadCachedCatalog();
    if (cached) return cached;
  }
  const caller = invoke ?? defaultInvoke;
  const s = loadByok();
  const raw = await caller({ action: "list-models", byok: s.keys });
  const rec = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawModels = (rec.models && typeof rec.models === "object" ? rec.models : {}) as Record<string, unknown>;
  const catalog: ModelCatalog = {
    fetchedAt: Date.now(),
    models: { ...(rawModels as Partial<Record<ProviderId, ModelOption[]>>) },
    seeds: (rec.seeds && typeof rec.seeds === "object" ? rec.seeds : SEED_MODELS) as Partial<Record<ProviderId, string[]>>,
    defaults: (rec.defaults && typeof rec.defaults === "object" ? rec.defaults : DEFAULT_PROVIDER_MODEL) as Partial<Record<ProviderId, string>>,
    errors: {},
  };
  for (const id of PROVIDER_IDS) {
    const entry = catalog.models?.[id];
    if (entry && !Array.isArray(entry)) {
      catalog.errors[id] = (entry as { error?: string }).error ?? "unavailable";
      catalog.models[id] = undefined;
    }
  }
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(catalog));
    } catch {
      /* quota */
    }
  }
  return catalog;
}

export const HOW_TO_GET_KEY_STEPS: Record<ProviderId, string[]> = {
  venice: [
    "Create a Venice account and generate an API key.",
    "Paste it above and Save. It stays in this browser only.",
    "Optional: pick a model below, or leave it on the recommended default.",
  ],
  openrouter: [
    "Create a free account at openrouter.ai.",
    "Open Keys and click Create Key.",
    "Copy the key — it starts with sk-or- (or sk-or-v1-).",
    "Paste it above and Save. It stays in this browser only.",
  ],
  oneprovider: [
    "Create a OneProvider account and generate an API key.",
    "Paste it above and Save. It stays in this browser only.",
  ],
};
