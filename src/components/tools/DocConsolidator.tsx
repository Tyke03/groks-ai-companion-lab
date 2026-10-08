import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PlatformCombobox } from "@/components/tools/PlatformCombobox";
import { chatbots } from "@/data/chatbots";
import { supabase } from "@/integrations/supabase/client";
import { useAiBackendStatus } from "@/hooks/useAiBackend";
import { withAiKey } from "@/lib/aiKey";
import { AiKeySettings } from "@/components/tools/AiKeySettings";
import { WorkbenchCardPicker, NeonSectionDivider } from "@/components/tools/WorkbenchCardPicker";
import { Loader2, Copy, Check, Download, AlertTriangle, Globe, WifiOff, Link2, FileText, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  buildOfflineGuideSkeleton,
  interpretConsolidateResponse,
} from "@/lib/docConsolidator";
import {
  buildBridgeSummary,
  stashWorkbenchBridge,
  toolsTabPath,
} from "@/lib/workbenchBridges";
import {
  loadDocConsolidatorDraft,
  saveDocConsolidatorDraft,
} from "@/lib/docConsolidatorDraftStorage";

const MAX_CHARS = 32000;

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

const FETCH_TIMEOUT_MS = 15000;
const AI_TIMEOUT_MS = 45000;

const withTimeout = <T,>(
  promise: Promise<T>,
  milliseconds: number,
  label = "Request",
) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out after ${Math.round(milliseconds / 1000)} seconds.`,
            ),
          ),
        milliseconds,
      ),
    ),
  ]);

const coachFetchError = (raw: string): string => {
  const message = raw || "Could not fetch the URL.";
  const lower = message.toLowerCase();
  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("longer than")) {
    return `${message} Tip: the source was too slow — paste the page text manually instead.`;
  }
  if (lower.includes("http ") || /returned http \d+/i.test(message) || /\b(401|403|404|429|500|502|503)\b/.test(message)) {
    return `${message} Tip: HTTP errors often mean a missing page, rate limit, or login wall — open the docs in your browser and paste the text.`;
  }
  if (lower.includes("login") || lower.includes("auth") || lower.includes("cookie") || lower.includes("forbidden")) {
    return `${message} Tip: pages behind login walls cannot be fetched here — paste manually after signing in.`;
  }
  if (lower.includes("html") || lower.includes("non-html") || lower.includes("content-type")) {
    return `${message} Tip: this URL did not look like readable HTML/text — paste the documentation manually.`;
  }
  if (lower.includes("empty") || lower.includes("no readable")) {
    return `${message} Tip: nothing useful was extracted (common with heavy JavaScript pages) — paste the text yourself.`;
  }
  return `${message} Tip: if fetch keeps failing, paste the documentation text into the box below.`;
};

export const DocConsolidator = () => {
  const [serviceName, setServiceName] = useState("");
  const [customName, setCustomName] = useState("");
  const [inputText, setInputText] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [fetchHint, setFetchHint] = useState("");
  const [result, setResult] = useState("");
  const [aiErrorBanner, setAiErrorBanner] = useState("");
  const [resultMode, setResultMode] = useState<"offline" | "ai" | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "restored" | "saved">("idle");
  const skipStatusFlipRef = useRef(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const ai = useAiBackendStatus();
  const aiUnavailable = ai.status === "unavailable";
  const aiReady = ai.status === "available";

  useEffect(() => {
    const draft = loadDocConsolidatorDraft();
    if (draft) {
      setServiceName(draft.serviceName);
      setCustomName(draft.customName);
      setInputText(draft.inputText);
      setDocUrl(draft.docUrl);
      setResult(draft.result);
      setResultMode(draft.resultMode);
      setDraftStatus("restored");
      skipStatusFlipRef.current = true;
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDocConsolidatorDraft({
      serviceName,
      customName,
      inputText,
      docUrl,
      result,
      resultMode,
    });
    if (skipStatusFlipRef.current) {
      skipStatusFlipRef.current = false;
      return;
    }
    const meaningful =
      Boolean(serviceName.trim()) ||
      Boolean(customName.trim()) ||
      Boolean(inputText.trim()) ||
      Boolean(docUrl.trim()) ||
      Boolean(result.trim());
    if (meaningful) setDraftStatus("saved");
  }, [hydrated, serviceName, customName, inputText, docUrl, result, resultMode]);

  const effectiveName = serviceName === "custom" ? customName : serviceName;
  const charCount = inputText.length;
  const isOverLimit = charCount > MAX_CHARS;
  const hasPaste = Boolean(inputText.trim());

  const handleFetchUrl = async () => {
    setFetchHint("");
    if (!docUrl.trim()) {
      toast({ title: "Missing URL", description: "Paste a documentation URL to fetch.", variant: "destructive" });
      return;
    }
    if (!/^https?:\/\/.+/i.test(docUrl.trim())) {
      toast({ title: "Invalid URL", description: "URL must start with http:// or https://", variant: "destructive" });
      return;
    }

    setFetching(true);
    try {
      const response = await withTimeout(
        fetch("/api/fetch-doc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: docUrl.trim() }),
        }),
        FETCH_TIMEOUT_MS,
        "Fetch",
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Fetch failed (${response.status})`);
      if (data?.text) {
        setInputText(data.text);
        setFetchHint("");
        toast({
          title: "Fetched",
          description: data.truncated
            ? "Page content fetched (truncated to 32,000 characters)."
            : "Page content fetched - review it, then consolidate.",
        });
      } else {
        const hint = coachFetchError("No readable text was extracted from that URL (empty body).");
        setFetchHint(hint);
        toast({ title: "Empty", description: hint, variant: "destructive" });
      }
    } catch (err) {
      const hint = coachFetchError(errMsg(err));
      setFetchHint(hint);
      toast({
        title: "Fetch failed",
        description: hint,
        variant: "destructive",
      });
    } finally {
      setFetching(false);
    }
  };

  const handleInsertSkeleton = () => {
    const skeleton = buildOfflineGuideSkeleton(effectiveName || "Service", inputText);
    setResult(skeleton);
    setResultMode("offline");
    setAiErrorBanner("");
    toast({
      title: hasPaste ? "Offline draft includes your paste" : "Offline skeleton inserted",
      description: hasPaste
        ? "Your pasted notes are in the markdown under Pasted notes. Fill remaining sections locally."
        : "Paste notes first for a richer draft, or fill the markdown sections locally. AI consolidate stays optional.",
    });
  };

  const handleConsolidate = async () => {
    if (!inputText.trim() || !effectiveName) {
      toast({ title: "Missing info", description: "Please select a service and provide documentation text.", variant: "destructive" });
      return;
    }

    if (!supabase) {
      toast({ title: "Unavailable", description: "AI consolidation is unavailable because Supabase is not configured.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setAiErrorBanner("");

    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("venice-ai", {
          body: withAiKey({
            action: "consolidate",
            serviceName: effectiveName,
            text: inputText,
          }),
        }),
        AI_TIMEOUT_MS,
        "AI consolidate",
      );

      const outcome = interpretConsolidateResponse(data, error);
      if (!outcome.ok) {
        setResult("");
        setResultMode(null);
        setAiErrorBanner(outcome.error);
        toast({ title: "AI consolidate failed", description: outcome.error, variant: "destructive" });
        return;
      }

      setResult(outcome.text);
      setResultMode("ai");
      setAiErrorBanner("");
      toast({ title: "Documentation consolidated", description: "Your markdown guide is ready to review." });
    } catch (err) {
      const message = errMsg(err) || "Failed to process documentation.";
      setResult("");
      setResultMode(null);
      setAiErrorBanner(message);
      toast({ title: "AI consolidate failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([result], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${effectiveName || "documentation"}_guide.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: `Saved as ${effectiveName || "documentation"}_guide.md` });
  };

  const handoffToWorkbench = (target: "character" | "prompts") => {
    const summary = buildBridgeSummary(effectiveName || "Service", result);
    stashWorkbenchBridge({ target, serviceName: effectiveName || "Service", summary });
    navigate(toolsTabPath(target));
    toast({
      title: target === "character" ? "Opening Character Card" : "Opening Prompt Builder",
      description:
        target === "character"
          ? "Service name and a short handoff note will be added to Creator Notes on the active card."
          : "A short handoff note will be placed in Raw context for editing.",
    });
  };


  const handleSave = () => {
    if (!result || !effectiveName) return;
    const key = `doc_${effectiveName}`;
    localStorage.setItem(key, result);
    toast({ title: "Saved", description: `Documentation for ${effectiveName} saved locally.` });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground mb-2">
          Documentation Consolidator
        </h2>
        <p className="text-sm text-muted-foreground">
          Secondary workbench tool: build a Hub guide from pasted notes (or optionally fetch a public URL).
          Two clear modes — <strong className="text-foreground font-medium">Draft offline</strong> (always works; includes your paste)
          and <strong className="text-foreground font-medium">AI Consolidate</strong> (optional; needs a configured backend).
          No invented NSFW or payment claims.
        </p>
        {draftStatus !== "idle" && (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="doc-draft-status">
            {draftStatus === "restored"
              ? "Draft restored from this browser (auto-saved)."
              : "Draft auto-saved in this browser. Save Locally still creates a named checkpoint."}
          </p>
        )}
      </div>

      {ai.status === "checking" && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking AI backend...
        </div>
      )}
      {aiReady && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3" role="status">
          <Sparkles className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
            <p className="font-medium text-emerald-300">Mode: AI available</p>
            <p className="text-muted-foreground">
              Use <span className="text-foreground">AI Consolidate</span> to rewrite pasted docs into a Hub guide,
              or <span className="text-foreground">Draft offline</span> to keep a local skeleton that includes your paste — no AI required.
            </p>
          </div>
        </div>
      )}
      {aiUnavailable && (
        <div className="neon-callout-box flex items-start gap-3 px-4 py-3" role="status">
          <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-sm space-y-2">
            <p className="font-medium neon-callout">Mode: Offline only (AI unavailable)</p>
            <p>
              Paste and URL fetch still work. AI Consolidate is disabled until a backend is reachable.
              Use Draft offline — it embeds your pasted notes into the markdown skeleton.
            </p>
            {ai.reason && <p className="text-xs text-muted-foreground/80">{ai.reason}</p>}
            <Button type="button" variant="secondary" size="sm" onClick={handleInsertSkeleton}>
              <FileText className="h-4 w-4" />
              Draft offline{hasPaste ? " (includes paste)" : ""}
            </Button>
          </div>
        </div>
      )}
      {(aiUnavailable || ai.hasByok) && <AiKeySettings onChange={ai.refresh} requestContext="Doc Consolidator" />}

      <div className="space-y-4">
        <div>
          <label htmlFor="doc-service-name" className="text-sm font-medium text-foreground mb-1 block">Service Name</label>
          <PlatformCombobox
            id="doc-service-name"
            value={serviceName}
            onValueChange={(v) => { setServiceName(v); if (v !== "custom") setCustomName(""); }}
            options={chatbots}
            allowCustom
            placeholder="Select a platform..."
            searchPlaceholder="Search platforms A?Z..."
            aria-label="Select a platform"
          />
          {serviceName === "custom" && (
            <Input
              id="doc-custom-service-name"
              aria-label="Custom service name"
              placeholder="Enter service name..."
              className="mt-2 bg-secondary border-border"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          )}
        </div>

        <NeonSectionDivider />

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="doc-input" className="text-sm font-medium text-foreground">
              Paste Documentation
            </label>
            <WorkbenchCardPicker
              buttonLabel="Populate from Workbench card"
              onSelect={(pick) => {
                setInputText((prev) => (prev.trim() ? `${prev.trim()}\n\n${pick.contextText}` : pick.contextText));
              }}
            />
          </div>
          <Textarea
            id="doc-input"
            placeholder="Paste documentation text, setup guides, wiki content, README files, etc. This is the primary path — used by both Draft offline and AI Consolidate. URL fetch below is optional."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[220px] bg-secondary border-border font-mono text-sm"
          />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-xs ${isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {charCount.toLocaleString()} characters
              {hasPaste ? " - will be included in offline drafts" : ""}
            </span>
          </div>
          {isOverLimit && (
            <div className="flex items-center gap-2 mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive">
                Input may be too long - consider splitting into sections.
              </span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="doc-url" className="text-sm font-medium text-foreground mb-1 block">
            Optional: Fetch from URL
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="doc-url"
                placeholder="https://docs.example.com/setup-guide"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleFetchUrl(); }}
                className="pl-10 bg-secondary border-border"
              />
            </div>
            <Button onClick={handleFetchUrl} disabled={fetching} variant="outline">
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {fetching ? "Fetching..." : "Fetch"}
            </Button>
          </div>
          <p className="neon-callout text-xs mt-1" role="note" data-testid="doc-fetch-callout">
            Fetch does not need AI. Login walls, timeouts, and heavy JavaScript pages often fail — paste manually when that happens.
          </p>
          {fetchHint && (
            <div className="mt-2 neon-callout-box">
              {fetchHint}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleInsertSkeleton}
            className="w-full sm:w-auto"
          >
            <FileText className="h-4 w-4" />
            Draft offline{hasPaste ? " (includes paste)" : ""}
          </Button>
          <Button onClick={handleConsolidate} disabled={loading || aiUnavailable} className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI consolidating...
              </>
            ) : aiUnavailable ? (
              "AI Consolidate (unavailable)"
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                AI Consolidate
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">Draft offline</span> always works and embeds pasted notes.
          {" "}
          <span className="text-foreground font-medium">AI Consolidate</span> needs a healthy backend and will show an error if the model returns nothing.
        </p>
        {aiErrorBanner && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">AI consolidate failed</p>
              <p className="text-destructive/90">{aiErrorBanner}</p>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-display font-semibold text-foreground">Result</h3>
              {resultMode && (
                <p className="text-xs text-muted-foreground">
                  {resultMode === "offline"
                    ? "Offline draft (local skeleton — paste included when provided)"
                    : "AI consolidate output - review before publishing"}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadMd}>
                <Download className="h-4 w-4" />
                Download .md
              </Button>
              <Button variant="outline" size="sm" onClick={handleSave}>
                Save Locally
              </Button>
            </div>
          </div>
                    <div className="flex flex-wrap gap-2" data-testid="doc-workbench-bridges">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handoffToWorkbench("character")}
              data-testid="use-in-character-card"
            >
              Use in Character Card
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handoffToWorkbench("prompts")}
              data-testid="use-in-prompt-builder"
            >
              Use in Prompt Builder
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              Light handoff only: copies the service name and a short preview note — not a full project sync.
            </p>
          </div>

          <pre tabIndex={0} aria-label="Consolidated documentation result" className="rounded-lg border border-border bg-secondary/50 p-4 text-sm text-muted-foreground overflow-auto max-h-[500px] whitespace-pre-wrap font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {result}
          </pre>
        </div>
      )}

      {!result && aiUnavailable && (
        <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-6 text-center">
          <p className="text-sm font-medium text-foreground">No draft yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            AI consolidate is offline. Draft offline to start a local markdown guide
            {hasPaste ? " that includes your pasted notes" : ""} - then copy into SillyTavern or your host.
          </p>
          <Button type="button" className="mt-4" variant="secondary" onClick={handleInsertSkeleton}>
            <FileText className="h-4 w-4" />
            Draft offline{hasPaste ? " (includes paste)" : ""}
          </Button>
        </div>
      )}
    </div>
  );
};
