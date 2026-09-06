import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Sparkles, Upload, Loader2, Wand2, WifiOff, ListChecks } from "lucide-react";
import {
  getPrimaryCompatibility,
  normalizeLocalTemplates,
  promptTemplates,
  renderPromptTemplate,
  type PromptTemplate,
} from "@/data/promptTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAiBackendStatus } from "@/hooks/useAiBackend";
import { consumeWorkbenchBridge } from "@/lib/workbenchBridges";
import { loadPromptDraft, savePromptDraft } from "@/lib/promptDraftStorage";

const customKey = "ai-companion-hub-custom-prompts";
const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const PromptBuilder = () => {
  const [customTemplates, setCustomTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate>(promptTemplates[0]);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [generatingVar, setGeneratingVar] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [showRawContext, setShowRawContext] = useState(false);
  const [rawContext, setRawContext] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "restored" | "saved">("idle");
  const skipStatusFlipRef = useRef(false);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const ai = useAiBackendStatus();
  const aiUnavailable = ai.status === "unavailable";
  const allTemplates = useMemo(() => [...promptTemplates, ...customTemplates], [customTemplates]);
  const compatibility = getPrimaryCompatibility(selectedTemplate);

  const templatesByCategory = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, PromptTemplate[]>();
    for (const template of allTemplates) {
      if (!map.has(template.category)) {
        map.set(template.category, []);
        order.push(template.category);
      }
      map.get(template.category)!.push(template);
    }
    return order.map((category) => ({ category, templates: map.get(category)! }));
  }, [allTemplates]);

  useEffect(() => {
    let customs: PromptTemplate[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(customKey) || "[]");
      customs = normalizeLocalTemplates(stored);
      setCustomTemplates(customs);
    } catch {
      setCustomTemplates([]);
    }

    const draft = loadPromptDraft();
    if (draft) {
      const all = [...promptTemplates, ...customs];
      const match = all.find((template) => template.id === draft.selectedTemplateId);
      if (match) setSelectedTemplate(match);
      setVariables(draft.variables);
      setRawContext(draft.rawContext);
      setShowRawContext(draft.showRawContext || Boolean(draft.rawContext.trim()));
      setDraftStatus("restored");
      skipStatusFlipRef.current = true;
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    const payload = consumeWorkbenchBridge("prompts");
    if (!payload) return;
    setShowRawContext(true);
    setRawContext((prev) => {
      const block = payload.summary;
      if (!prev.trim()) return block;
      if (prev.includes(block)) return prev;
      return `${prev.trim()}\n\n${block}`;
    });
    toast({
      title: "Doc Consolidator handoff",
      description: `Placed a short note for ${payload.serviceName} in Raw context.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePromptDraft({
      selectedTemplateId: selectedTemplate.id,
      variables,
      rawContext,
      showRawContext,
    });
    if (skipStatusFlipRef.current) {
      skipStatusFlipRef.current = false;
      return;
    }
    const meaningful =
      Boolean(rawContext.trim()) ||
      showRawContext ||
      Object.values(variables).some((value) => value.trim());
    if (meaningful) setDraftStatus("saved");
  }, [hydrated, selectedTemplate.id, variables, rawContext, showRawContext]);


  useEffect(() => {
    const requestedId = searchParams.get("template");
    if (!requestedId) return;
    const requestedTemplate = allTemplates.find((template) => template.id === requestedId);
    if (requestedTemplate && requestedTemplate.id !== selectedTemplate.id) {
      setSelectedTemplate(requestedTemplate);
      setVariables({});
    }
  }, [allTemplates, searchParams, selectedTemplate.id]);

  const handleSelectTemplate = (template: PromptTemplate) => {
    setSelectedTemplate(template);
    setVariables({});
    setCopied(false);
  };

  const getRenderedPrompt = () => renderPromptTemplate(selectedTemplate, variables);
  const hasUnresolvedPlaceholders = selectedTemplate.variables.some(
    (variable) => !variables[variable.name]?.trim() && !variable.placeholder.trim(),
  );

  const handleFillExamples = () => {
    const next: Record<string, string> = {};
    for (const variable of selectedTemplate.variables) {
      if (variable.placeholder.trim()) next[variable.name] = variable.placeholder;
    }
    setVariables(next);
    setCopied(false);
    toast({
      title: "Example values filled",
      description: "Local placeholders only — no AI. Edit before copying into SillyTavern or your host.",
    });
  };

  const handleCopy = async () => {
    if (hasUnresolvedPlaceholders) return;
    await navigator.clipboard.writeText(getRenderedPrompt());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateVariable = async (varName: string) => {
    const varDef = selectedTemplate.variables.find((v) => v.name === varName);
    if (!supabase) {
      toast({ title: "Unavailable", description: "AI generation is unavailable because Supabase is not configured.", variant: "destructive" });
      return;
    }
    setGeneratingVar(varName);
    try {
      const { data, error } = await supabase.functions.invoke("venice-ai", {
        body: {
          action: "generate-prompt-variable",
          variableName: varName,
          variableDescription: varDef?.description || "",
          templateContext: selectedTemplate.template,
          existingVariables: variables,
          rawContext: rawContext.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.result) setVariables((prev) => ({ ...prev, [varName]: data.result }));
    } catch (err) {
      toast({ title: "Error", description: errMsg(err) || "Failed to generate.", variant: "destructive" });
    } finally {
      setGeneratingVar(null);
    }
  };

  const handleGenerateAll = async () => {
    if (!supabase) {
      toast({ title: "Unavailable", description: "AI generation is unavailable because Supabase is not configured.", variant: "destructive" });
      return;
    }
    setGeneratingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("venice-ai", {
        body: {
          action: "generate-all-prompt-variables",
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          templateDescription: selectedTemplate.description,
          template: selectedTemplate.template,
          variables: selectedTemplate.variables.map((v) => ({
            name: v.name,
            description: v.description,
            placeholder: v.placeholder,
          })),
          existingVariables: variables,
          rawContext: rawContext.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.result && typeof data.result === "object") {
        setVariables((prev) => ({ ...prev, ...data.result }));
        toast({ title: "Generated", description: `Filled ${Object.keys(data.result).length} variables.` });
      }
    } catch (err) {
      toast({ title: "Error", description: errMsg(err) || "Failed to generate all.", variant: "destructive" });
    } finally {
      setGeneratingAll(false);
    }
  };

  const handlePopulateFromCard = () => {
    if (!importText.trim()) {
      toast({ title: "Empty", description: "Paste character card JSON to populate.", variant: "destructive" });
      return;
    }
    try {
      let parsed = JSON.parse(importText);
      if (parsed?.data) parsed = parsed.data;

      const mapping: Record<string, string[]> = {
        character_name: ["name"],
        character_role: ["personality"],
        setting: ["scenario"],
        personality_traits: ["personality"],
        speaking_style: ["personality"],
        personality: ["personality"],
        description: ["description"],
        scenario: ["scenario"],
        scenario_title: ["scenario"],
        setting_description: ["scenario"],
        context: ["scenario", "description"],
        action_description: ["first_mes"],
        greeting_dialogue: ["first_mes"],
        scene_description: ["scenario"],
        entry_name: ["name"],
        example_dialogue: ["mes_example", "example_dialogue"],
      };

      const newVars: Record<string, string> = {};
      for (const variable of selectedTemplate.variables) {
        const sources = mapping[variable.name];
        if (sources) {
          for (const source of sources) {
            if (parsed[source] && typeof parsed[source] === "string" && parsed[source].trim()) {
              newVars[variable.name] = parsed[source].substring(0, 200);
              break;
            }
          }
        }
      }

      if (Object.keys(newVars).length > 0) {
        setVariables((prev) => ({ ...prev, ...newVars }));
        toast({ title: "Populated", description: `Filled ${Object.keys(newVars).length} variables from character card.` });
      } else {
        toast({ title: "No matches", description: "No fields could be mapped to this template's variables.", variant: "destructive" });
      }
      setShowImport(false);
      setImportText("");
    } catch {
      toast({ title: "Invalid JSON", description: "Could not parse the pasted data as JSON.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="mb-2 font-display text-xl font-semibold text-foreground">Prompt Builder</h2>
        <p className="text-sm text-muted-foreground">
          Draft locally, then paste into SillyTavern or your host. Fill example values works offline; AI generate is optional.
        </p>
        {draftStatus !== "idle" && (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="prompt-draft-status">
            {draftStatus === "restored" ? "Draft restored from this browser." : "Draft saved in this browser."}
          </p>
        )}
      </div>

      {ai.status === "checking" && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking AI backend...
        </div>
      )}
      {aiUnavailable && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-amber-300">AI backend unavailable</p>
            <p className="text-muted-foreground">Fill example values, edit fields, populate from card JSON, and copy — all work offline. AI generation stays disabled.</p>
            {ai.reason && <p className="mt-1 text-xs text-muted-foreground/80">{ai.reason}</p>}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <span id="prompt-template-label" className="block text-sm font-medium text-foreground">Select Template</span>
        {templatesByCategory.map((group) => (
          <div key={group.category}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.category}</p>
            <div role="group" aria-labelledby="prompt-template-label" className="flex flex-wrap gap-2">
              {group.templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleSelectTemplate(template)}
                  aria-pressed={selectedTemplate.id === template.id}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selectedTemplate.id === template.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  {template.name}{template.userCreated ? " · Local" : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
        {selectedTemplate.useWhen && (
          <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Use when: </span>
            {selectedTemplate.useWhen}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-secondary/20 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border px-2 py-1 font-medium text-foreground">{compatibility.target}</span>
          <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{compatibility.artifactType}</span>
          <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{compatibility.format === "plain-text" ? "Plain text" : "Platform-native"}</span>
          {compatibility.lane === "verified-platform" && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-400">Confidence: Verified</span>}
          {selectedTemplate.userCreated && <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-primary">User-created</span>}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{compatibility.pasteInstructions}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Runtime macros: {compatibility.runtimeMacros.length > 0 ? compatibility.runtimeMacros.join(", ") : "None"}
        </p>
        {compatibility.caveats?.map((caveat) => <p key={caveat} className="mt-1 text-xs text-amber-300/90">Note: {caveat}</p>)}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleFillExamples} disabled={selectedTemplate.variables.length === 0}>
          <ListChecks className="h-4 w-4" /> Fill example values
        </Button>
        <Button variant="outline" size="sm" aria-expanded={showImport} aria-controls="prompt-import-panel" onClick={() => setShowImport(!showImport)}><Upload className="h-4 w-4" /> Populate from Card / JSON</Button>
        <Button variant="outline" size="sm" aria-expanded={showRawContext} aria-controls="prompt-raw-context-panel" onClick={() => setShowRawContext(!showRawContext)}><Wand2 className="h-4 w-4" /> Paste Raw Text as Context</Button>
      </div>

      {showImport && (
        <div id="prompt-import-panel" className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
          <p className="text-sm text-muted-foreground">Paste character card JSON and matching fields will be mapped to author placeholders in this template.</p>
          <Textarea aria-label="Character card JSON to map" placeholder="Paste character card JSON or character card data..." value={importText} onChange={(event) => setImportText(event.target.value)} className="min-h-[100px] border-border bg-secondary font-mono text-sm" />
          <div className="flex gap-2"><Button size="sm" onClick={handlePopulateFromCard}><Upload className="h-4 w-4" /> Populate</Button><Button variant="ghost" size="sm" onClick={() => { setShowImport(false); setImportText(""); }}>Cancel</Button></div>
        </div>
      )}

      {showRawContext && (
        <div id="prompt-raw-context-panel" className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
          <p className="text-sm text-muted-foreground">Paste raw text as additional context for AI generation. It is not included in copied output unless you add it to an author field.</p>
          <Textarea aria-label="Raw context text" id="prompt-raw-context" placeholder="Paste character bios, world lore, story outlines, wiki entries, chat logs..." value={rawContext} onChange={(event) => setRawContext(event.target.value)} className="min-h-[120px] border-border bg-secondary font-mono text-sm" />
          <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => { setShowRawContext(false); setRawContext(""); }}>Clear & Close</Button>{rawContext.trim() && <span className="self-center text-xs text-muted-foreground">✓ Context will be included in AI generations</span>}</div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-medium text-foreground">Author fields</h3>
          <div className="flex items-center gap-2">
            {rawContext.trim() && <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600"><Check className="h-3 w-3" /> Context active</span>}
            <Button variant="outline" size="sm" onClick={handleGenerateAll} disabled={generatingAll || generatingVar !== null || aiUnavailable}>
              {generatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generatingAll ? "Generating..." : "AI Generate all"}
            </Button>
          </div>
        </div>
        {selectedTemplate.variables.length === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">This template has no author fields. Any verified runtime macros remain literal in the output.</p>}
        {selectedTemplate.variables.map((variable) => (
          <div key={variable.name}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label htmlFor={`template-variable-${variable.name}`} className="text-xs text-muted-foreground">
                {variable.label} <code className="ml-1 rounded bg-secondary px-1 text-primary">{variable.token}</code> — {variable.description}
              </label>
              <Button variant="ghost" size="sm" onClick={() => handleGenerateVariable(variable.name)} disabled={generatingVar === variable.name || aiUnavailable} className="h-6 px-2 text-xs text-muted-foreground hover:text-primary">
                {generatingVar === variable.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {generatingVar === variable.name ? "..." : "AI"}
              </Button>
            </div>
            <Input id={`template-variable-${variable.name}`} placeholder={variable.placeholder || `Enter ${variable.label.toLowerCase()}`} value={variables[variable.name] || ""} onChange={(event) => setVariables((prev) => ({ ...prev, [variable.name]: event.target.value }))} className="border-border bg-secondary text-sm" />
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-display font-semibold text-foreground">Generated Prompt</h3>
            {hasUnresolvedPlaceholders && <p className="text-xs text-amber-300">Fill the fields without examples before copying — or use Fill example values.</p>}
          </div>
          <Button size="sm" onClick={handleCopy} disabled={hasUnresolvedPlaceholders}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy filled output"}
          </Button>
        </div>
        <pre tabIndex={0} aria-label="Generated prompt output" className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/50 p-4 font-mono text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{getRenderedPrompt()}</pre>
      </div>
    </div>
  );
};
