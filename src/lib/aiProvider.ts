/**
 * Multi-provider BYOK settings, CompanionBrief shape, and live model catalog
 * (24h localStorage cache) for Venice, OpenRouter, and OneProvider.
 *
 * Keys live ONLY in browser localStorage and are forwarded per-request to the
 * `venice-ai` edge function. Nothing is persisted or logged server-side.
 */

import { supabase } from "@/integrations/supabase/client";

export type AiProviderId = "venice" | "openrouter" | "oneprovider";

export const AI_PROVIDER_IDS: AiProviderId[] = ["venice", "openrouter", "oneprovider"];

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  venice: "Venice",
  openrouter: "OpenRouter",
  oneprovider: "OneProvider",
};

export const AI_PROVIDER_KEY_URLS: Record<AiProviderId, string> = {
  venice: "https://venice.ai/settings/api",
  openrouter: "https://openrouter.ai/keys",
  oneprovider: "https://oneprovider.dev",
};

export const AI_PROVIDER_SETTINGS_STORAGE = "ai-companion-hub-ai-provider-v1";
export const AI_KEY_STORAGE = "ai-companion-hub-openrouter-key";
export const AI_KEY_MODEL_STORAGE = "ai-companion-hub-openrouter-model";
export const MODEL_CATALOG_STORAGE = "ai-companion-hub-model-catalog-v1";
export const MODEL_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_VENICE_MODEL = "zai-org-glm-4.7-flash";
export const DEFAULT_OPENROUTER_MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition";
export const DEFAULT_ONEPROVIDER_MODEL = "grok-4.7";
export const DEFAULT_TEMPERATURE = 0.7;

export interface ByokKeys {
  venice: string;
  openrouter: string;
  oneprovider: string;
}

export interface ProviderModelsConfig {
  venice: string;
  openrouter: string[];
  oneprovider: string[];
}

export interface AiProviderSettings {
  byok: ByokKeys;
  models: ProviderModelsConfig;
  preferredProvider: AiProviderId;
  allowSharedFallback: boolean;
  temperature: number;
}

export interface CompanionBrief {
  concept: string;
  archetype: string;
  tone: string;
  setting: string;
  userRole: string;
  voiceNotes: string;
  tags: string;
}

export interface ModelCatalogEntry {
  id: string;
  name: string;
  contextLength?: number;
}

export interface ModelCatalog {
  venice: ModelCatalogEntry[];
  openrouter: ModelCatalogEntry[];
  oneprovider: ModelCatalogEntry[];
  fetchedAt: number;
  errors?: Partial<Record<AiProviderId, string>>;
}

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

export function emptyCompanionBrief(): CompanionBrief {
  return {
    concept: "",
    archetype: "",
    tone: "",
    setting: "",
    userRole: "",
    voiceNotes: "",
    tags: "",
  };
}

export function cleanCompanionBrief(
  brief: Partial<CompanionBrief> | null | undefined,
): Partial<CompanionBrief> | undefined {
  if (!brief || typeof brief !== "object") return undefined;
  const out: Partial<CompanionBrief> = {};
  const keys: (keyof CompanionBrief)[] = [
    "concept",
    "archetype",
    "tone",
    "setting",
    "userRole",
    "voiceNotes",
    "tags",
  ];
  for (const key of keys) {
    const val = typeof brief[key] === "string" ? brief[key]!.trim() : "";
    if (val) out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function defaultAiProviderSettings(): AiProviderSettings {
  return {
    byok: {
      venice: "",
      openrouter: "",
      oneprovider: "",
    },
    models: {
      venice: DEFAULT_VENICE_MODEL,
      openrouter: [DEFAULT_OPENROUTER_MODEL],
      oneprovider: [DEFAULT_ONEPROVIDER_MODEL],
    },
    preferredProvider: "venice",
    allowSharedFallback: false,
    temperature: DEFAULT_TEMPERATURE,
  };
}

function normalizeProviderId(value: unknown): AiProviderId {
  return value === "venice" || value === "openrouter" || value === "oneprovider" ? value : "venice";
}

function normalizeModelList(value: unknown, fallback: string): string[] {
  const out: string[] = [];
  if (typeof value === "string" && value.trim()) {
    out.push(value.trim());
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim() && !out.includes(item.trim())) {
        out.push(item.trim());
      }
    }
  }
  return out.length > 0 ? out : [fallback];
}

function clampTemperature(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TEMPERATURE;
  return Math.max(0, Math.min(1.2, Math.round(value * 100) / 100));
}

export function loadAiProviderSettings(): AiProviderSettings {
  const defaults = defaultAiProviderSettings();
  if (!canUseStorage()) return defaults;

  let storedRaw: Record<string, unknown> | null = null;
  let legacyKey = "";
  let legacyModel = "";

  try {
    const raw = window.localStorage.getItem(AI_PROVIDER_SETTINGS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        storedRaw = parsed as Record<string, unknown>;
      }
    }
    legacyKey = (window.localStorage.getItem(AI_KEY_STORAGE) || "").trim();
    legacyModel = (window.localStorage.getItem(AI_KEY_MODEL_STORAGE) || "").trim();
  } catch {
    // ignore storage errors
  }

  const rawByok = storedRaw?.byok && typeof storedRaw.byok === "object"
    ? (storedRaw.byok as Record<string, unknown>)
    : {};
  const rawModels = storedRaw?.models && typeof storedRaw.models === "object"
    ? (storedRaw.models as Record<string, unknown>)
    : {};

  const veniceKey = typeof rawByok.venice === "string" ? rawByok.venice.trim() : "";
  const openrouterKey = (typeof rawByok.openrouter === "string" ? rawByok.openrouter.trim() : "") || legacyKey;
  const oneproviderKey = typeof rawByok.oneprovider === "string" ? rawByok.oneprovider.trim() : "";

  const openrouterModels = normalizeModelList(rawModels.openrouter, legacyModel || DEFAULT_OPENROUTER_MODEL);
  if (legacyModel && !storedRaw && !openrouterModels.includes(legacyModel)) {
    openrouterModels.unshift(legacyModel);
  }

  const byok: ByokKeys = {
    venice: veniceKey,
    openrouter: openrouterKey,
    oneprovider: oneproviderKey,
  };

  let preferredProvider = storedRaw?.preferredProvider
    ? normalizeProviderId(storedRaw.preferredProvider)
    : "venice";

  if (!storedRaw && openrouterKey) {
    preferredProvider = "openrouter";
  }

  return {
    byok,
    models: {
      venice: (typeof rawModels.venice === "string" && rawModels.venice.trim()) || DEFAULT_VENICE_MODEL,
      openrouter: openrouterModels,
      oneprovider: normalizeModelList(rawModels.oneprovider, DEFAULT_ONEPROVIDER_MODEL),
    },
    preferredProvider,
    allowSharedFallback: typeof storedRaw?.allowSharedFallback === "boolean" ? storedRaw.allowSharedFallback : false,
    temperature: clampTemperature(storedRaw?.temperature),
  };
}

export function saveAiProviderSettings(
  update: Partial<Omit<AiProviderSettings, "byok" | "models">> & {
    byok?: Partial<ByokKeys>;
    models?: Partial<ProviderModelsConfig>;
  },
): AiProviderSettings {
  const current = loadAiProviderSettings();
  const next: AiProviderSettings = {
    byok: {
      venice: (update.byok?.venice !== undefined ? update.byok.venice : current.byok.venice).trim(),
      openrouter: (update.byok?.openrouter !== undefined ? update.byok.openrouter : current.byok.openrouter).trim(),
      oneprovider: (update.byok?.oneprovider !== undefined ? update.byok.oneprovider : current.byok.oneprovider).trim(),
    },
    models: {
      venice: (update.models?.venice !== undefined ? update.models.venice : current.models.venice).trim() || DEFAULT_VENICE_MODEL,
      openrouter: normalizeModelList(
        update.models?.openrouter !== undefined ? update.models.openrouter : current.models.openrouter,
        DEFAULT_OPENROUTER_MODEL,
      ),
      oneprovider: normalizeModelList(
        update.models?.oneprovider !== undefined ? update.models.oneprovider : current.models.oneprovider,
        DEFAULT_ONEPROVIDER_MODEL,
      ),
    },
    preferredProvider: update.preferredProvider
      ? normalizeProviderId(update.preferredProvider)
      : current.preferredProvider,
    allowSharedFallback: typeof update.allowSharedFallback === "boolean"
      ? update.allowSharedFallback
      : current.allowSharedFallback,
    temperature: update.temperature !== undefined
      ? clampTemperature(update.temperature)
      : current.temperature,
  };

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(AI_PROVIDER_SETTINGS_STORAGE, JSON.stringify(next));
      if (next.byok.openrouter) {
        window.localStorage.setItem(AI_KEY_STORAGE, next.byok.openrouter);
      } else {
        window.localStorage.removeItem(AI_KEY_STORAGE);
      }
      window.localStorage.setItem(
        AI_KEY_MODEL_STORAGE,
        next.models.openrouter[0] || DEFAULT_OPENROUTER_MODEL,
      );
    } catch {
      // ignore storage failures
    }
  }
  return next;
}

export function clearAiProviderKey(provider: AiProviderId): AiProviderSettings {
  return saveAiProviderSettings({ byok: { [provider]: "" } });
}

export function hasAnyByokKey(settings?: AiProviderSettings): boolean {
  const s = settings ?? loadAiProviderSettings();
  return Boolean(
    s.byok.venice.trim() ||
    s.byok.openrouter.trim() ||
    s.byok.oneprovider.trim(),
  );
}

function hasCustomProviderPrefs(s: AiProviderSettings): boolean {
  return (
    s.preferredProvider !== "venice" ||
    s.models.venice !== DEFAULT_VENICE_MODEL ||
    s.models.openrouter[0] !== DEFAULT_OPENROUTER_MODEL ||
    s.models.oneprovider[0] !== DEFAULT_ONEPROVIDER_MODEL ||
    s.temperature !== DEFAULT_TEMPERATURE
  );
}

export function withAiProviderSettings(
  body: Record<string, unknown>,
  settings?: AiProviderSettings,
): Record<string, unknown> {
  const s = settings ?? loadAiProviderSettings();
  const hasByok = hasAnyByokKey(s);

  if (!hasByok && !hasCustomProviderPrefs(s)) {
    return body;
  }

  const byokPayload: Partial<Record<AiProviderId, string>> = {};
  if (s.byok.venice.trim()) byokPayload.venice = s.byok.venice.trim();
  if (s.byok.openrouter.trim()) byokPayload.openrouter = s.byok.openrouter.trim();
  if (s.byok.oneprovider.trim()) byokPayload.oneprovider = s.byok.oneprovider.trim();

  const out: Record<string, unknown> = {
    ...body,
    preferredProvider: s.preferredProvider,
    models: {
      venice: s.models.venice,
      openrouter: s.models.openrouter,
      oneprovider: s.models.oneprovider,
    },
  };

  if (hasByok) {
    out.byok = byokPayload;
    out.allowSharedFallback = s.allowSharedFallback;
  }

  if (s.temperature !== DEFAULT_TEMPERATURE) {
    out.temperature = s.temperature;
  }

  if (byokPayload.openrouter) {
    out.openrouterKey = byokPayload.openrouter;
    if (s.models.openrouter[0]) out.openrouterModel = s.models.openrouter[0];
  }

  return out;
}

/* ============================================================
   LIVE MODEL CATALOG (24h localStorage cache, R4 / Q4)
   ============================================================ */

export function loadCachedModelCatalog(opts?: { ignoreTtl?: boolean }): ModelCatalog | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(MODEL_CATALOG_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ModelCatalog>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.fetchedAt !== "number") {
      return null;
    }
    if (!opts?.ignoreTtl && Date.now() - parsed.fetchedAt > MODEL_CATALOG_TTL_MS) {
      return null;
    }
    return {
      venice: Array.isArray(parsed.venice) ? parsed.venice : [],
      openrouter: Array.isArray(parsed.openrouter) ? parsed.openrouter : [],
      oneprovider: Array.isArray(parsed.oneprovider) ? parsed.oneprovider : [],
      fetchedAt: parsed.fetchedAt,
      ...(parsed.errors ? { errors: parsed.errors } : {}),
    };
  } catch {
    return null;
  }
}

export function clearModelCatalogCache(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(MODEL_CATALOG_STORAGE);
  } catch {
    // ignore
  }
}

export async function fetchModelCatalog(opts?: { forceRefresh?: boolean }): Promise<ModelCatalog> {
  if (!opts?.forceRefresh) {
    const cached = loadCachedModelCatalog();
    if (cached) return cached;
  }

  if (!supabase) {
    const stale = loadCachedModelCatalog({ ignoreTtl: true });
    if (stale) return stale;
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke("venice-ai", {
    body: withAiProviderSettings({ action: "list-models" }),
  });

  if (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  const rawModels = data && typeof data === "object" && "models" in data
    ? (data as { models?: Record<string, unknown>; errors?: Partial<Record<AiProviderId, string>> }).models
    : undefined;

  const normalizeList = (arr: unknown): ModelCatalogEntry[] => {
    if (!Array.isArray(arr)) return [];
    const out: ModelCatalogEntry[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id.trim() : "";
      if (!id) continue;
      const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : id;
      const contextLength = typeof rec.contextLength === "number" && Number.isFinite(rec.contextLength)
        ? rec.contextLength
        : undefined;
      out.push(contextLength ? { id, name, contextLength } : { id, name });
    }
    return out;
  };

  const catalog: ModelCatalog = {
    venice: normalizeList(rawModels?.venice),
    openrouter: normalizeList(rawModels?.openrouter),
    oneprovider: normalizeList(rawModels?.oneprovider),
    fetchedAt: Date.now(),
    ...(data && typeof data === "object" && "errors" in data && (data as { errors?: unknown }).errors
      ? { errors: (data as { errors: Partial<Record<AiProviderId, string>> }).errors }
      : {}),
  };

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(MODEL_CATALOG_STORAGE, JSON.stringify(catalog));
    } catch {
      // ignore storage quota errors
    }
  }

  return catalog;
}
