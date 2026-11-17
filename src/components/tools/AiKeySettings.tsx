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
import {
  HOW_TO_GET_KEY_STEPS,
  maskKey,
  requestAccessHref,
  sendAccessRequest,
} from "@/lib/aiKey";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDER_KEY_URLS,
  AI_PROVIDER_LABELS,
  DEFAULT_ONEPROVIDER_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_VENICE_MODEL,
  type AiProviderId,
  type AiProviderSettings,
  type ModelCatalog,
  clearAiProviderKey,
  fetchModelCatalog,
  hasAnyByokKey,
  loadAiProviderSettings,
  loadCachedModelCatalog,
  saveAiProviderSettings,
} from "@/lib/aiProvider";

interface AiKeySettingsProps {
  /** Called after keys or provider preferences change so callers can re-probe status. */
  onChange?: () => void;
  /** Short context line echoed into the "request access" email. */
  requestContext?: string;
  /** Whether shared server keys are active on the Hub backend. */
  hasServerKey?: boolean;
}

const KEY_PLACEHOLDERS: Record<AiProviderId, string> = {
  venice: "venice-api-key…",
  openrouter: "sk-or-v1-…",
  oneprovider: "op-api-key…",
};

const DEFAULT_MODELS: Record<AiProviderId, string> = {
  venice: DEFAULT_VENICE_MODEL,
  openrouter: DEFAULT_OPENROUTER_MODEL,
  oneprovider: DEFAULT_ONEPROVIDER_MODEL,
};

/**
 * Dual-path AI settings panel:
 * - Simple path: zero config when Hub shared keys are active.
 * - Power path (collapsed "Advanced" disclosure by default per Q5):
 *   3-provider BYOK (Venice, OpenRouter, OneProvider), preferred provider,
 *   live model catalog (24h cached + refresh), temperature, and shared fallback toggle.
 */
export function AiKeySettings({ onChange, requestContext, hasServerKey }: AiKeySettingsProps) {
  const [settings, setSettings] = useState<AiProviderSettings>(() => loadAiProviderSettings());
  const [draftKeys, setDraftKeys] = useState(() => loadAiProviderSettings().byok);
  const [draftModels, setDraftModels] = useState(() => ({
    venice: settings.models.venice || DEFAULT_VENICE_MODEL,
    openrouter: settings.models.openrouter[0] || DEFAULT_OPENROUTER_MODEL,
    oneprovider: settings.models.oneprovider[0] || DEFAULT_ONEPROVIDER_MODEL,
  }));
  const [showKeys, setShowKeys] = useState<Record<AiProviderId, boolean>>({
    venice: false,
    openrouter: false,
    oneprovider: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(() => loadCachedModelCatalog());
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [showRequest, setShowRequest] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestContact, setRequestContact] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestState, setRequestState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const activeByok = hasAnyByokKey(settings);
  const activeProviders = AI_PROVIDER_IDS.filter((id) => Boolean(settings.byok[id].trim()));

  const loadModels = async (forceRefresh = false) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const next = await fetchModelCatalog({ forceRefresh });
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

  const commitSettings = (partial: Parameters<typeof saveAiProviderSettings>[0]) => {
    const saved = saveAiProviderSettings(partial);
    setSettings(saved);
    setDraftKeys(saved.byok);
    setDraftModels({
      venice: saved.models.venice,
      openrouter: saved.models.openrouter[0] || DEFAULT_OPENROUTER_MODEL,
      oneprovider: saved.models.oneprovider[0] || DEFAULT_ONEPROVIDER_MODEL,
    });
    onChange?.();
  };

  const handleSaveAll = () => {
    commitSettings({
      byok: {
        venice: draftKeys.venice,
        openrouter: draftKeys.openrouter,
        oneprovider: draftKeys.oneprovider,
      },
      models: {
        venice: draftModels.venice,
        openrouter: [draftModels.openrouter.trim() || DEFAULT_OPENROUTER_MODEL],
        oneprovider: [draftModels.oneprovider.trim() || DEFAULT_ONEPROVIDER_MODEL],
      },
    });
  };

  const handleClearProvider = (provider: AiProviderId) => {
    const saved = clearAiProviderKey(provider);
    setSettings(saved);
    setDraftKeys(saved.byok);
    onChange?.();
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
    : "Not loaded yet";

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3" data-testid="ai-key-settings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">
            {activeByok
              ? `Power path active (${activeProviders.map((p) => AI_PROVIDER_LABELS[p]).join(", ")})`
              : hasServerKey
                ? "Simple path active — zero setup (Hub shared providers)"
                : "AI key & provider settings (optional BYOK)"}
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
          Advanced — BYOK &amp; Models
          {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      <p className="text-xs text-muted-foreground" role="note">
        Simple path runs on the Hub&apos;s shared cascade (Venice → OpenRouter → OneProvider) with no setup.
        Expand <span className="text-foreground">Advanced</span> to supply your own Venice, OpenRouter, or OneProvider
        keys and select any model. <span className="text-foreground">Keys stay in this browser only</span> — never stored on the server.
      </p>

      {activeByok && (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="ai-key-saved">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-muted-foreground">
            Active BYOK keys:{" "}
            {activeProviders.map((id, idx) => (
              <span key={id}>
                {idx > 0 ? ", " : ""}
                <span className="text-foreground">{AI_PROVIDER_LABELS[id]}</span>{" "}
                <span className="font-mono text-foreground">{maskKey(settings.byok[id])}</span>
              </span>
            ))}
            {" · "}Preferred: <span className="text-foreground">{AI_PROVIDER_LABELS[settings.preferredProvider]}</span>
          </span>
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
                value={settings.preferredProvider}
                onChange={(e) => commitSettings({ preferredProvider: e.target.value as AiProviderId })}
                className="h-8 rounded-md border border-border bg-secondary px-2.5 text-xs text-foreground"
              >
                {AI_PROVIDER_IDS.map((id) => (
                  <option key={id} value={id}>
                    {AI_PROVIDER_LABELS[id]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ai-temperature" className="mb-1 block text-xs font-medium text-foreground">
                Temperature ({settings.temperature.toFixed(2)})
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="ai-temperature"
                  aria-label="Temperature"
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.05}
                  value={settings.temperature}
                  onChange={(e) => commitSettings({ temperature: Number(e.target.value) })}
                  className="w-28 accent-primary"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => commitSettings({ temperature: DEFAULT_TEMPERATURE })}
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
              Model catalog fetch note: {catalogError} — you can still type any model ID manually below.
            </p>
          )}

          <div className="space-y-3">
            {AI_PROVIDER_IDS.map((providerId) => {
              const label = AI_PROVIDER_LABELS[providerId];
              const savedVal = settings.byok[providerId];
              const modelsList = catalog?.[providerId] ?? [];
              const listId = `model-catalog-${providerId}`;
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
                        href={AI_PROVIDER_KEY_URLS[providerId]}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        Get {label} key <ExternalLink className="h-3 w-3" />
                      </a>
                      {savedVal && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleClearProvider(providerId)}
                          aria-label={`Remove ${label} key`}
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label htmlFor={`byok-key-${providerId}`} className="mb-1 block text-xs font-medium text-foreground">
                        {label} API key
                      </label>
                      <div className="flex gap-1.5">
                        <Input
                          id={`byok-key-${providerId}`}
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
                      <label htmlFor={`byok-model-${providerId}`} className="mb-1 block text-xs font-medium text-foreground">
                        {label} model {modelsList.length > 0 ? `(${modelsList.length} live)` : "(any ID)"}
                      </label>
                      <div className="space-y-1.5">
                        {modelsList.length > 0 && (
                          <select
                            aria-label={`${label} catalog model`}
                            value={modelsList.some((m) => m.id === draftModels[providerId]) ? draftModels[providerId] : ""}
                            onChange={(e) => {
                              if (e.target.value) {
                                setDraftModels((prev) => ({ ...prev, [providerId]: e.target.value }));
                              }
                            }}
                            className="h-8 w-full rounded-md border border-border bg-secondary px-2 text-xs text-foreground"
                          >
                            <option value="">Choose from live {label} catalog…</option>
                            {modelsList.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                              </option>
                            ))}
                          </select>
                        )}
                        <Input
                          id={`byok-model-${providerId}`}
                          list={listId}
                          value={draftModels[providerId]}
                          onChange={(e) => setDraftModels((prev) => ({ ...prev, [providerId]: e.target.value }))}
                          placeholder={DEFAULT_MODELS[providerId]}
                          autoComplete="off"
                          spellCheck={false}
                          className="bg-secondary text-xs"
                        />
                        {modelsList.length > 0 && (
                          <datalist id={listId}>
                            {modelsList.map((m) => (
                              <option key={m.id} value={m.id} />
                            ))}
                          </datalist>
                        )}
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
                checked={settings.allowSharedFallback}
                onChange={(e) => commitSettings({ allowSharedFallback: e.target.checked })}
                className="rounded border-border"
              />
              Fall back to shared server keys if my BYOK key fails (default off)
            </label>

            <Button type="button" size="sm" onClick={handleSaveAll} data-testid="save-byok-settings">
              <Check className="h-3.5 w-3.5" /> Save BYOK &amp; model settings
            </Button>
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer text-foreground">How to get a free OpenRouter key</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              {HOW_TO_GET_KEY_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
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
