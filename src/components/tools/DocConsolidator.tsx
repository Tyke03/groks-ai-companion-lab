import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chatbots } from "@/data/chatbots";
import { supabase } from "@/integrations/supabase/client";
import { useAiBackendStatus } from "@/hooks/useAiBackend";
import { Loader2, Copy, Check, Download, AlertTriangle, Globe, WifiOff, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_CHARS = 32000;

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

const withTimeout = <T,>(promise: Promise<T>, milliseconds = 15000) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Request timed out after 15 seconds.")), milliseconds)),
  ]);

export const DocConsolidator = () => {
  const [serviceName, setServiceName] = useState("");
  const [customName, setCustomName] = useState("");
  const [inputText, setInputText] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const ai = useAiBackendStatus();
  const aiUnavailable = ai.status === "unavailable";

  const effectiveName = serviceName === "custom" ? customName : serviceName;
  const charCount = inputText.length;
  const isOverLimit = charCount > MAX_CHARS;

  const handleFetchUrl = async () => {
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
      const response = await withTimeout(fetch("/api/fetch-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: docUrl.trim() }),
      }));
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Fetch failed (${response.status})`);
      if (data?.text) {
        setInputText(data.text);
        toast({
          title: "Fetched",
          description: data.truncated
            ? "Page content fetched (truncated to 32,000 characters)."
            : "Page content fetched — review it, then consolidate.",
        });
      } else {
        toast({ title: "Empty", description: "No readable text was extracted from that URL.", variant: "destructive" });
      }
    } catch (err) {
      toast({
        title: "Fetch failed",
        description: errMsg(err) || "Could not fetch the URL. Try pasting the documentation text directly instead.",
        variant: "destructive",
      });
    } finally {
      setFetching(false);
    }
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
    setResult("");

    try {
      const { data, error } = await withTimeout(supabase.functions.invoke("venice-ai", {
        body: {
          action: "consolidate",
          serviceName: effectiveName,
          text: inputText,
        },
      }));

      if (error) throw error;
      const consolidated = data?.result || "No result returned.";
      setResult(consolidated);
      toast({ title: "Documentation consolidated", description: "Your markdown guide is ready to review." });
    } catch (err) {
      toast({ title: "Error", description: errMsg(err) || "Failed to process documentation.", variant: "destructive" });
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
          Paste documentation from any chatbot service — or fetch it directly from a URL — and AI will process it into a standardized markdown expert file with setup steps, character creation guides, API configuration, NSFW settings, and troubleshooting.
        </p>
      </div>

      {/* AI backend status banner */}
      {ai.status === "checking" && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking AI backend...
        </div>
      )}
      {aiUnavailable && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <WifiOff className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-300">AI backend unavailable</p>
            <p className="text-muted-foreground">
              URL fetching and consolidation require the AI backend. You can still copy, download, and save previously generated results.
            </p>
            {ai.reason && <p className="mt-1 text-xs text-muted-foreground/80">{ai.reason}</p>}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="doc-service-name" className="text-sm font-medium text-foreground mb-1 block">Service Name</label>
          <Select value={serviceName} onValueChange={(v) => { setServiceName(v); if (v !== "custom") setCustomName(""); }}>
            <SelectTrigger id="doc-service-name" className="bg-secondary border-border">
              <SelectValue placeholder="Select a platform..." />
            </SelectTrigger>
            <SelectContent>
              {chatbots.map((bot) => (
                <SelectItem key={bot.slug} value={bot.name}>
                  {bot.name}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom / Other</SelectItem>
            </SelectContent>
          </Select>
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

        {/* URL fetch */}
        <div>
          <label htmlFor="doc-url" className="text-sm font-medium text-foreground mb-1 block">
            Fetch Documentation from URL
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
            <Button onClick={handleFetchUrl} disabled={fetching || aiUnavailable} variant="outline">
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {fetching ? "Fetching..." : "Fetch"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Fetches the page server-side and extracts readable text — no copy-pasting across tabs. Pages behind logins or heavy JS may not extract well; paste manually in that case.
          </p>
        </div>

        <div>
          <label htmlFor="doc-input" className="text-sm font-medium text-foreground mb-1 block">
            Paste Documentation
          </label>
          <Textarea
            id="doc-input"
            placeholder="Paste documentation text, setup guides, wiki content, README files, etc... (or use the URL fetch above)"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[200px] bg-secondary border-border font-mono text-sm"
          />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-xs ${isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {charCount.toLocaleString()} characters
            </span>
          </div>
          {isOverLimit && (
            <div className="flex items-center gap-2 mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive">
                Input may be too long — consider splitting into sections.
              </span>
            </div>
          )}
        </div>

        <Button onClick={handleConsolidate} disabled={loading || aiUnavailable} className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Consolidate Documentation"
          )}
        </Button>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-foreground">Result</h3>
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
          <pre tabIndex={0} aria-label="Consolidated documentation result" className="rounded-lg border border-border bg-secondary/50 p-4 text-sm text-muted-foreground overflow-auto max-h-[500px] whitespace-pre-wrap font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
};
