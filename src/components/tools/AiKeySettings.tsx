import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  KeyRound,
  ExternalLink,
  Check,
  Trash2,
  Send,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { requestAccessHref, sendAccessRequest } from "@/lib/aiKey";
import {
  DEFAULT_PROVIDER_MODEL,
  HOW_TO_GET_KEY_STEPS,
  PROVIDER_IDS,
  PROVIDER_KEYS_URL,
  PROVIDER_LABEL,
  SEED_MODELS,
  type ByokState,
  type ModelCatalog,
  type ModelOption,
  type ProviderId,
  clearAllByok,
  clearProvider,
  fetchModelCatalog,
  hasByok,
  loadByok,
  loadCachedCatalog,
  maskKey,
  saveByok,
} from "@/lib/aiProvider";

interface AiKeySettingsProps {
  /** Called after keys or provider preferences change so callers can re-probe status. */
  onChange?: () => void;
  /** Short context line echoed into the "request access" email. */
  requestContext?: string;
  /** Whether shared server keys are active on the Hub backend. */
  hasServerKey?: boolean;
}

const KEY_PLACEHOLDERS: Record<ProviderId, string> = {
  venice: "venice-api-key…",
  openrouter: "sk-or-v1-…",
  oneprovider: "op-api-key…",
};

const DEFAULT_TEMPERATURE = 0.7;

/**
 * Dual-path AI settings panel:
 * - Simple path: visible "Simple mode: using the shared backend" default.
 * - Power path: collapsed "Advanced — use my own key" disclosure (closed by default per Q5)
 *   supporting Venice, OpenRouter, and OneProvider with live model catalog + seed fallback.
 */
export function AiKeySettings({ onChange, requestContext, hasServerKey }: AiKeySettingsProps) {
  const [state, setState] = useState<ByokState>(() => loadByok());
  const [draftKeys, setDraftKeys] = useState<Record<ProviderId, string>>(() => ({
    venice: state.keys.venice ?? "",
    openrouter: state.keys.openrouter ?? "",
    oneprovider: state.keys.oneprovider ?? "",
  }));
  const [draftModels, setDraftModels] = useState<Record<ProviderId, string>>(() => ({
    venice: state.models.venice || DEFAULT_PROVIDER_MODEL.venice,
    openrouter: state.models.openrouter || DEFAULT_PROVIDER_MODEL.openrouter,
    oneprovider: state.models.oneprovider || DEFAULT_PROVIDER_MODEL.oneprovider,
  }));
  const [showKeys, setShowKeys] = useState<Record<ProviderId, boolean>>({
    venice: false,
    openrouter: false,
    oneprovider: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(() => loadCachedCatalog());
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [showRequest, setShowRequest] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestContact, setRequestContact] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestState, setRequestState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const activeByok = hasByok();
  const activeProviders = PROVIDER_IDS.filter((id) => Boolean(state.keys[id]?.trim()));

  const syncFromSaved = (saved: ByokState) => {
    setState(saved);
    setDraftKeys({
      venice: saved.keys.venice ?? "",
      openrouter: saved.keys.openrouter ?? "",
      oneprovider: saved.keys.oneprovider ?? "",
    });
    setDraftModels({
      venice: saved.models.venice || DEFAULT_PROVIDER_MODEL.venice,
      openrouter: saved.models.openrouter || DEFAULT_PROVIDER_MODEL.openrouter,
      oneprovider: saved.models.oneprovider || DEFAULT_PROVIDER_MODEL.oneprovider,
    });
    onChange?.();
  };

  const loadModels = async (forceRefresh = false) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const next = await fetchModelCatalog(undefined, forceRefresh);
      setCatalog(next);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Could not load models.");
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (!showAdvanced || catalog) return;
    void loadModels(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdvanced]);

  const handleSaveAll = () => {
    const saved = saveByok({
      ...state,
      keys: {
        venice: draftKeys.venice,
        openrouter: draftKeys.openrouter,
        oneprovider: draftKeys.oneprovider,
      },
      models: {
        venice: draftModels.venice,
        openrouter: draftModels.openrouter,
        oneprovider: draftModels.oneprovider,
      },
    });
    syncFromSaved(saved);
  };

  const handleClearProvider = (provider: ProviderId) => {
    const saved = clearProvider(provider);
    syncFromSaved(saved);
  };

  const handleClearAll = () => {
    clearAllByok();
    syncFromSaved(loadByok());
  };

  const handleSendRequest = async () => {
    setRequestState("sending");
    try {
      const result = await sendAccessRequest({
        name: requestName,
        contact: requestContact,
        note: requestNote,
        context: requestContext,
      });
      setRequestState(result.ok ? "sent" : "error");
    } catch {
      setRequestState("error");
    }
  };

  const cacheAgeLabel = catalog
    ? `Cached ${new Date(catalog.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Showing seed defaults";

  const optionsForProvider = (id: ProviderId): ModelOption[] => {
    const live = catalog?.models?.[id];
    const base: ModelOption[] = Array.isArray(live) && live.length > 0
      ? live
      : (catalog?.seeds?.[id] ?? SEED_MODELS[id]).map((m) => ({ id: m, name: m }));
    const current = draftModels[id]?.trim();
    if (current && !base.some((m) => m.id === current)) {
      return [{ id: current, name: `${current} (custom)` }, ...base];
    }
    return base;
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3" data-testid="ai-key-settings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground" data-testid="ai-mode-summary">
            {activeByok
              ? `Power mode: using your BYOK key (${activeProviders.map((p) => PROVIDER_LABEL[p]).join(", ")})`
              : hasServerKey
                ? "Simple mode: using the shared backend"
                : "Simple mode: using the shared backend (add a BYOK key below if no server key is set)"}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          data-testid="ai-advanced-toggle"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
          Advanced — use my own key
          {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      <p className="text-xs text-muted-foreground" role="note">
        Zero setup required when the shared cascade (Venice → OpenRouter → OneProvider) is active.
        Expand <span className="text-foreground">Advanced — use my own key</span> for BYOK keys and model selection.{" "}
        <span className="text-foreground">Keys stay in this browser only</span> — never persisted or logged server-side.
      </p>

      {activeByok && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="ai-key-saved">
          <div className="flex flex-wrap items-center gap-2">
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-muted-foreground">
              Active BYOK keys:{" "}
              {activeProviders.map((id, idx) => (
                <span key={id}>
                  {idx > 0 ? ", " : ""}
                  <span className="text-foreground">{PROVIDER_LABEL[id]}</span>{" "}
                  <span className="font-mono text-foreground">{maskKey(state.keys[id] || "")}</span>
                </span>
              ))}
              {state.preferredProvider ? (
                <>
                  {" · "}Preferred: <span className="text-foreground">{PROVIDER_LABEL[state.preferredProvider]}</span>
                </>
              ) : null}
            </span>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={handleClearAll}>
            Clear all keys
          </Button>
        </div>
      )}

      {showAdvanced && (
        <div className="space-y-4 rounded-md border border-border/80 bg-background/40 p-3" data-testid="ai-advanced-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <label htmlFor="preferred-provider" className="mb-1 block text-xs font-medium text-foreground">
                Preferred provider
              </label>
              <select
                id="preferred-provider"
                aria-label="Preferred provider"
                value={state.preferredProvider ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const nextPref = val === "venice" || val === "openrouter" || val === "oneprovider" ? val : null;
                  syncFromSaved(saveByok({ ...state, preferredProvider: nextPref }));
                }}
                className="h-8 rounded-md border border-border bg-secondary px-2.5 text-xs text-foreground"
              >
                <option value="">Default cascade (Venice → OpenRouter → OneProvider)</option>
                {PROVIDER_IDS.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDER_LABEL[id]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ai-temperature" className="mb-1 block text-xs font-medium text-foreground">
                Temperature ({(state.temperature ?? DEFAULT_TEMPERATURE).toFixed(2)})
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="ai-temperature"
                  aria-label="Temperature"
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.05}
                  value={state.temperature ?? DEFAULT_TEMPERATURE}
                  onChange={(e) => {
                    syncFromSaved(saveByok({ ...state, temperature: Number(e.target.value) }));
                  }}
                  className="w-28 accent-primary"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    const next = { ...state };
                    delete next.temperature;
                    syncFromSaved(saveByok(next));
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => void loadModels(true)}
                disabled={catalogLoading}
                data-testid="refresh-models-button"
              >
                <RefreshCw className={`h-3 w-3 ${catalogLoading ? "animate-spin" : ""}`} />
                {catalogLoading ? "Loading models..." : "Refresh models"}
              </Button>
              <span className="text-[11px] text-muted-foreground">{cacheAgeLabel}</span>
            </div>
          </div>

          {catalogError && (
            <p className="text-xs text-amber-400" role="status">
              Model catalog fetch note: {catalogError} — showing seed defaults (you can still type any model ID).
            </p>
          )}

          <div className="space-y-3">
            {PROVIDER_IDS.map((providerId) => {
              const label = PROVIDER_LABEL[providerId];
              const savedVal = state.keys[providerId] || "";
              const modelOptions = optionsForProvider(providerId);
              const isLive = Array.isArray(catalog?.models?.[providerId]) && (catalog?.models?.[providerId]?.length ?? 0) > 0;
              return (
                <div key={providerId} className="rounded-md border border-border/60 bg-secondary/30 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{label}</span>
                      {savedVal ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                          <Check className="h-3 w-3" /> {maskKey(savedVal)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">No visitor key set</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={PROVIDER_KEYS_URL[providerId]}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        Where to get a key <ExternalLink className="h-3 w-3" />
                      </a>
                      {savedVal && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                          onClick={() => handleClearProvider(providerId)}
                          aria-label={`Clear ${label} key`}
                        >
                          <Trash2 className="h-3 w-3" /> Clear
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <label htmlFor={`byok-key-${providerId}`} className="mb-1 block text-xs font-medium text-foreground">
                        {label} API key
                      </label>
                      <div className="flex gap-1.5">
                        <Input
                          id={`byok-key-${providerId}`}
                          aria-label={`${label} API key`}
                          type={showKeys[providerId] ? "text" : "password"}
                          value={draftKeys[providerId]}
                          onChange={(e) => setDraftKeys((prev) => ({ ...prev, [providerId]: e.target.value }))}
                          placeholder={KEY_PLACEHOLDERS[providerId]}
                          autoComplete="off"
                          spellCheck={false}
                          className="bg-secondary text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }))}
                        >
                          {showKeys[providerId] ? "Hide" : "Show"}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor={`byok-model-select-${providerId}`} className="mb-1 block text-xs font-medium text-foreground">
                        {label} model {isLive ? `(${modelOptions.length} live)` : "(seed catalog)"}
                      </label>
                      <div className="space-y-1.5">
                        <select
                          id={`byok-model-select-${providerId}`}
                          aria-label={`${label} model`}
                          data-testid={`model-select-${providerId}`}
                          value={draftModels[providerId]}
                          onChange={(e) => setDraftModels((prev) => ({ ...prev, [providerId]: e.target.value }))}
                          className="h-8 w-full rounded-md border border-border bg-secondary px-2 text-xs text-foreground"
                        >
                          {modelOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                            </option>
                          ))}
                        </select>
                        <Input
                          id={`byok-model-${providerId}`}
                          aria-label={`${label} custom model ID`}
                          value={draftModels[providerId]}
                          onChange={(e) => setDraftModels((prev) => ({ ...prev, [providerId]: e.target.value }))}
                          placeholder={DEFAULT_PROVIDER_MODEL[providerId]}
                          autoComplete="off"
                          spellCheck={false}
                          className="bg-secondary text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(state.allowSharedFallback)}
                onChange={(e) => syncFromSaved(saveByok({ ...state, allowSharedFallback: e.target.checked }))}
                className="rounded border-border"
              />
              Fall back to shared server keys if my BYOK key fails (default off)
            </label>

            <Button type="button" size="sm" onClick={handleSaveAll} data-testid="save-byok-settings">
              <Check className="h-3.5 w-3.5" /> Save BYOK &amp; model settings
            </Button>
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer text-foreground">How to get an API key (Venice, OpenRouter, OneProvider)</summary>
            <div className="mt-2 space-y-2">
              {PROVIDER_IDS.map((pid) => (
                <div key={pid}>
                  <p className="font-medium text-foreground">{PROVIDER_LABEL[pid]}</p>
                  <ol className="list-decimal space-y-0.5 pl-4">
                    {HOW_TO_GET_KEY_STEPS[pid].map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Don&apos;t want to use a key?{" "}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => setShowRequest((v) => !v)}
          aria-expanded={showRequest}
        >
          {showRequest ? "Hide request form" : "Request access"}
        </button>{" "}
        and we&apos;ll get you set up case by case. You can also{" "}
        <a href={requestAccessHref(requestContext)} className="text-primary hover:underline">
          email us
        </a>
        .
      </p>

      {showRequest && (
        <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3" data-testid="ai-access-request">
          {requestState === "sent" ? (
            <p className="text-xs text-emerald-400" role="status">
              Request sent. We&apos;ll reply to the contact you gave.
            </p>
          ) : (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  aria-label="Your name"
                  placeholder="Your name"
                  value={requestName}
                  onChange={(event) => setRequestName(event.target.value)}
                  className="bg-secondary text-sm"
                />
                <Input
                  aria-label="Email or contact"
                  placeholder="Email or contact"
                  value={requestContact}
                  onChange={(event) => setRequestContact(event.target.value)}
                  className="bg-secondary text-sm"
                />
              </div>
              <Textarea
                aria-label="What you're working on"
                placeholder="What are you working on?"
                value={requestNote}
                onChange={(event) => setRequestNote(event.target.value)}
                className="bg-secondary text-sm"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSendRequest}
                  disabled={requestState === "sending" || (!requestContact.trim() && !requestName.trim())}
                >
                  <Send className="h-3.5 w-3.5" />
                  {requestState === "sending" ? "Sending..." : "Send request"}
                </Button>
                {requestState === "error" && (
                  <span className="text-xs text-amber-400">Couldn&apos;t send here — opening your mail app instead.</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
