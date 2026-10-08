import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, ExternalLink, Check, Trash2 } from "lucide-react";
import {
  DEFAULT_OPENROUTER_MODEL,
  HOW_TO_GET_KEY_STEPS,
  OPENROUTER_KEYS_URL,
  clearAiKey,
  loadAiKey,
  maskKey,
  requestAccessHref,
  saveAiKey,
} from "@/lib/aiKey";

interface AiKeySettingsProps {
  /** Called after a key is saved or cleared so callers can re-probe status. */
  onChange?: () => void;
  /** Short context line echoed into the "request access" email. */
  requestContext?: string;
}

/**
 * Bring-your-own-key panel. The key is stored only in this browser and is
 * forwarded to the AI provider per request; the Hub never stores it. When no
 * key is entered, AI still runs on the Hub's shared backend if it is up.
 */
export function AiKeySettings({ onChange, requestContext }: AiKeySettingsProps) {
  const initial = loadAiKey();
  const [key, setKey] = useState(initial.key);
  const [model, setModel] = useState(initial.model || DEFAULT_OPENROUTER_MODEL);
  const [savedKey, setSavedKey] = useState(initial.key);
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    const next = saveAiKey({ key, model });
    setSavedKey(next.key);
    setKey(next.key);
    setModel(next.model);
    onChange?.();
  };

  const handleClear = () => {
    clearAiKey();
    setSavedKey("");
    setKey("");
    onChange?.();
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3" data-testid="ai-key-settings">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Use your own key (optional)</p>
      </div>

      <p className="text-xs text-muted-foreground" role="note">
        No key? AI still runs on the Hub's shared provider when it is up. Add your own free OpenRouter key
        for reliability and higher limits. <span className="text-foreground">The key stays in this browser</span> —
        we never store it on the server.
      </p>

      {savedKey ? (
        <div className="flex items-center gap-2 text-xs" data-testid="ai-key-saved">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-muted-foreground">
            Using your key <span className="font-mono text-foreground">{maskKey(savedKey)}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleClear}>
            <Trash2 className="h-3 w-3" /> Remove
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="byok-key" className="mb-1 block text-xs font-medium text-foreground">
            OpenRouter API key
          </label>
          <Input
            id="byok-key"
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="sk-or-v1-…"
            autoComplete="off"
            spellCheck={false}
            className="bg-secondary"
          />
        </div>
        <div>
          <label htmlFor="byok-model" className="mb-1 block text-xs font-medium text-foreground">
            Model (optional)
          </label>
          <Input
            id="byok-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={DEFAULT_OPENROUTER_MODEL}
            autoComplete="off"
            spellCheck={false}
            className="bg-secondary"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={handleSave}>
          <Check className="h-3.5 w-3.5" /> Save key
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowKey((v) => !v)}>
          {showKey ? "Hide" : "Show"}
        </Button>
        <a
          href={OPENROUTER_KEYS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Get a free OpenRouter key <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer text-foreground">How to get a key</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          {HOW_TO_GET_KEY_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>

      <p className="text-xs text-muted-foreground">
        Don't want to use a key?{" "}
        <a href={requestAccessHref(requestContext)} className="text-primary hover:underline">
          Request access
        </a>{" "}
        and we'll get you set up case by case.
      </p>
    </div>
  );
}