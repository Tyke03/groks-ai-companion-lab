import { useState, useRef, useMemo, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Copy, Check, Download, Sparkles, Upload, Loader2, Image, Trash2, Plus, AlertTriangle, WifiOff, Settings2, Eye, FileJson, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { embedCardInPng, extractCardFromPng } from "@/lib/pngChunk";
import {
  importCard,
  buildV2Envelope,
  buildV3Envelope,
  sanitizeFilename,
  CardImportError,
} from "@/lib/cardCodec";
import {
  CANONICAL_ASSET_TYPES,
  MAX_JSON_BYTES,
  MAX_JSON_LABEL,
  MAX_PNG_BYTES,
  MAX_PNG_LABEL,
  emptyCardData,
  emptyPreserved,
  type CardAsset,
  type CardData,
  type CardFormat,
  type CardImportResult,
  type PreservedData,
} from "@/lib/cardTypes";
import { estimateCardTokens } from "@/lib/cardTokens";
import { useAiBackendStatus } from "@/hooks/useAiBackend";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Fields whose value is an array of strings (rendered with list editors) */
const ARRAY_FIELDS = new Set(["source", "group_only_greetings", "alternate_greetings"]);

const fieldDescriptions: Record<string, string> = {
  name: "A memorable character name",
  description: "Appearance, background, abilities, and key traits (2-4 paragraphs)",
  personality: "Core personality traits, behavioral patterns, and quirks",
  scenario: "The setting/situation where the user meets this character",
  first_mes: "The character's opening message with actions and dialogue",
  mes_example: "Example dialogue exchanges showing the character's voice",
  creator_notes: "Notes for users about how to best use this character",
  system_prompt: "Instructions for the AI on how to roleplay this character",
  post_history_instructions: "Brief reminder inserted after chat history",
  tags: "Comma-separated tags for categorization",
  creator: "Creator name or handle",
  nickname: "Alternative name or alias for the character",
  creator_notes_multilingual: "Creator notes in other languages (JSON: {\"lang\": \"notes\"})",
  source: "Source URLs or IDs",
  group_only_greetings: "Greetings only used in group chats",
  alternate_greetings: "Alternate opening messages (V2 spec field)",
  character_version: "Version of this character card",
};

const recommendedMax: Record<string, number> = {
  description: 2000, personality: 1000, scenario: 1000, first_mes: 2000, mes_example: 5000,
};

function CharCountIndicator({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? current / max : 0;
  const color = pct > 1 ? "text-destructive" : pct > 0.8 ? "text-yellow-500" : "text-muted-foreground";
  return (
    <span className={`text-xs ${color}`}>
      {current}/{max}
    </span>
  );
}

type SpecVersion = "v2" | "v3";

const ASSET_TYPE_LABELS: Record<string, string> = {
  icon: "Icon / Portrait",
  background: "Background",
  user_icon: "User icon",
  emotion: "Expression sprite",
  other: "Other",
};

function ListEditor({
  items, onChange, placeholder, addLabel, fieldLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  addLabel: string;
  fieldLabel: string;
}) {
  const update = (i: number, value: string) => {
    const next = [...items];
    next[i] = value;
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, ""]);

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">No items yet.</p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <Textarea
            placeholder={placeholder}
            value={item}
            onChange={(e) => update(i, e.target.value)}
            aria-label={`${fieldLabel} ${i + 1}`}
            className="min-h-[64px] flex-1 bg-secondary border-border text-sm"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => remove(i)}
            className="h-8 px-2 text-muted-foreground hover:text-destructive"
            aria-label={`Remove item ${i + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

/** Splits an AI/import string value into a list (commas or newlines). */
function toList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const CharacterCardBuilder = () => {
  const [card, setCard] = useState<CardData>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem("ai-companion-hub-card-draft") || "null");
      return { ...emptyCardData(), ...(raw && typeof raw === "object" ? (raw as Partial<CardData>) : {}) };
    } catch { return emptyCardData(); }
  });
  const [preserved, setPreserved] = useState<PreservedData>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem("ai-companion-hub-card-preserved") || "null");
      return { ...emptyPreserved(), ...(raw && typeof raw === "object" ? (raw as Partial<PreservedData>) : {}) };
    } catch { return emptyPreserved(); }
  });
  const [importedFormat, setImportedFormat] = useState<CardFormat | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [specVersion, setSpecVersion] = useState<SpecVersion>("v2");
  const [generationMode, setGenerationMode] = useState<"default" | "byok">("default");
  const [showGenerationSettings, setShowGenerationSettings] = useState(false);
  const [previewMode, setPreviewMode] = useState<"json" | "chat">("json");
  const [copied, setCopied] = useState(false);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pngFile, setPngFile] = useState<File | null>(null);
  const pngInputRef = useRef<HTMLInputElement>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const ai = useAiBackendStatus();
  const aiUnavailable = ai.status === "unavailable";

  useEffect(() => {
    try { localStorage.setItem("ai-companion-hub-card-draft", JSON.stringify(card)); } catch { /* quota */ }
  }, [card]);

  useEffect(() => {
    try { localStorage.setItem("ai-companion-hub-card-preserved", JSON.stringify(preserved)); } catch { /* quota */ }
  }, [preserved]);

  const pngPreviewUrl = useMemo(() => pngFile ? URL.createObjectURL(pngFile) : null, [pngFile]);

  // Revoke object URLs when replaced or on unmount.
  useEffect(() => {
    return () => { if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl); };
  }, [pngPreviewUrl]);

  const multilingual = useMemo(() => {
    const text = card.creator_notes_multilingual;
    if (!text.trim()) return { valid: true, value: undefined as Record<string, string> | undefined, error: null as string | null };
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { valid: true, value: parsed as Record<string, string>, error: null };
      }
      return { valid: false, value: undefined, error: "Must be a JSON object, e.g. {\"es\": \"...\"}" };
    } catch (e) {
      return { valid: false, value: undefined, error: errMsg(e) || "Invalid JSON" };
    }
  }, [card.creator_notes_multilingual]);

  const updateField = (field: keyof CardData, value: string) => {
    setCard((prev) => ({ ...prev, [field]: value }));
  };

  const updateList = (field: keyof CardData, items: string[]) => {
    setCard((prev) => ({ ...prev, [field]: items }));
  };

  /** Current export envelope for the selected spec version, built by the codec. */
  const currentExport = useMemo(() => {
    if (specVersion === "v3") return buildV3Envelope(card, preserved);
    return buildV2Envelope(card, preserved);
  }, [specVersion, card, preserved]);

  /** Import-time + export-time notices that must be visible to the user. */
  const preservationNotices = useMemo(() => {
    const notices: string[] = [];
    if (preserved.character_book !== undefined) notices.push("Character book preserved but not editable here.");
    const unknownCount = Object.keys(preserved.unknownDataFields).length;
    if (unknownCount > 0) notices.push(`${unknownCount} unsupported field(s) will be preserved unchanged.`);
    if (preserved.preservedAssets.length > 0) notices.push(`${preserved.preservedAssets.length} preserved asset(s) are not editable here.`);
    return notices;
  }, [preserved]);

  const allNotices = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const notice of [...importWarnings, ...preservationNotices, ...currentExport.warnings]) {
      if (seen.has(notice)) continue;
      seen.add(notice);
      out.push(notice);
    }
    return out;
  }, [importWarnings, preservationNotices, currentExport.warnings]);

  const toastWarnings = (warnings: string[]) => {
    if (warnings.length === 0) return;
    const preview = warnings.slice(0, 3).join(" · ");
    toast({
      title: "Export notes",
      description: warnings.length > 3 ? `${preview} (+${warnings.length - 3} more)` : preview,
    });
  };

  const applyImport = (result: CardImportResult) => {
    setCard(result.data);
    setPreserved(result.preserved);
    setImportedFormat(result.format);
    setImportWarnings(result.warnings);
    setSpecVersion(result.format === "v3" ? "v3" : "v2");
  };

  /** Local approximate token estimate for the active card (pure, deterministic). */
  const tokenEstimate = useMemo(() => estimateCardTokens(card, preserved), [card, preserved]);
  const renderGreeting = (): ReactNode => card.first_mes.split(/(\*[^*]+\*|"[^"]+")/g).filter(Boolean).map((part, index) => part.startsWith("*") && part.endsWith("*") ? <em key={index} className="text-muted-foreground">{part}</em> : part.startsWith('"') && part.endsWith('"') ? <strong key={index} className="text-foreground">{part}</strong> : <span key={index}>{part}</span>);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(currentExport.envelope, null, 2));
    toastWarnings(currentExport.warnings);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const json = JSON.stringify(currentExport.envelope, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilename(card.name || "character")}_${specVersion}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastWarnings(currentExport.warnings);
    toast({ title: "Downloaded", description: `Character card ${specVersion.toUpperCase()} JSON downloaded.` });
  };

  const handleDownloadPng = async () => {
    if (!pngFile) {
      toast({ title: "No image", description: "Upload a PNG image first to embed the card.", variant: "destructive" });
      return;
    }
    if (pngFile.size > MAX_PNG_BYTES) {
      toast({ title: "File too large", description: `PNG embedding limit is ${MAX_PNG_LABEL}.`, variant: "destructive" });
      return;
    }
    try {
      const chunkName = specVersion === "v3" ? "ccv3" : "chara";
      const blob = await embedCardInPng(pngFile, currentExport.envelope, chunkName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilename(card.name || "character")}_${specVersion}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toastWarnings(currentExport.warnings);
      toast({
        title: "Downloaded",
        description: specVersion === "v3"
          ? "Card embedded as ccv3 (V3 draft) chunk; any legacy chara chunk was replaced."
          : "Card embedded as chara chunk; any ccv3 chunk was replaced.",
      });
    } catch (err) {
      toast({ title: "Error", description: errMsg(err) || "Failed to embed card in PNG.", variant: "destructive" });
    }
  };

  const handleGenerateField = async (fieldName: keyof CardData) => {
    if (!supabase) {
      toast({ title: "Unavailable", description: "AI generation is unavailable because Supabase is not configured.", variant: "destructive" });
      return;
    }
    setGeneratingField(fieldName);
    try {
      const { data, error } = await supabase.functions.invoke("venice-ai", {
        body: { action: "generate-field", fieldName, fieldDescription: fieldDescriptions[fieldName], existingFields: card, keywords: Array.isArray(card[fieldName]) ? (card[fieldName] as string[]).join(", ") : card[fieldName] || undefined },
      });
      if (error) throw error;
      if (data?.result) {
        if (ARRAY_FIELDS.has(fieldName)) {
          updateList(fieldName, toList(data.result));
        } else {
          updateField(fieldName, data.result);
        }
      }
    } catch (err) {
      toast({ title: "Error", description: errMsg(err) || "Failed to generate field.", variant: "destructive" });
    } finally {
      setGeneratingField(null);
    }
  };

  const handleGenerateAll = async () => {
    if (!supabase) {
      toast({ title: "Unavailable", description: "AI generation is unavailable because Supabase is not configured.", variant: "destructive" });
      return;
    }
    setGeneratingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("venice-ai", {          body: { action: "generate-all", existingFields: card, generationMode },
      });
      if (error) throw error;
      if (data?.result && typeof data.result === "object" && !data.parseError) {
        setCard((prev) => {
          const updated = { ...prev };
          for (const [key, value] of Object.entries(data.result)) {
            if (key in updated) {
              const record = updated as Record<string, unknown>;
              if (ARRAY_FIELDS.has(key) && typeof value === "string") {
                record[key] = toList(value);
              } else if (typeof value === "string") {
                record[key] = value;
              } else if (Array.isArray(value)) {
                record[key] = value.map(String);
              }
            }
          }
          return updated;
        });
        toast({ title: "Generated", description: "All fields have been generated/enhanced by AI." });
      } else if (data?.parseError) {
        toast({ title: "Partial result", description: "AI response couldn't be parsed. Try generating individual fields.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: errMsg(err) || "Failed to generate.", variant: "destructive" });
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "image/png") {
      if (file.size > MAX_PNG_BYTES) {
        toast({ title: "File too large", description: `PNG import limit is ${MAX_PNG_LABEL}.`, variant: "destructive" });
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extracted = extractCardFromPng(bytes);
      if (extracted.status === "ok") {
        try {
          const result = importCard(extracted.data);
          applyImport(result);
          toast({ title: "Imported", description: `Extracted ${extracted.chunkName} card from PNG.` });
          setPngFile(file);
        } catch (err) {
          toast({ title: "Error", description: errMsg(err) || "Failed to parse embedded card.", variant: "destructive" });
        }
      } else if (extracted.status === "no-card") {
        toast({ title: "No card found", description: "This PNG doesn't contain an embedded character card.", variant: "destructive" });
      } else {
        toast({ title: "Invalid PNG", description: extracted.reason, variant: "destructive" });
      }
    } else {
      if (file.size > MAX_JSON_BYTES) {
        toast({ title: "File too large", description: `Text/JSON import limit is ${MAX_JSON_LABEL}.`, variant: "destructive" });
        return;
      }
      const text = await file.text();
      setImportText(text);
      setShowImport(true);
    }
    if (fileImportRef.current) fileImportRef.current.value = "";
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setImportError("Paste V1, V2, or V3-draft Character Card JSON before importing.");
      return;
    }

    // Only accept valid JSON that is a recognizable card.
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(importText);
    } catch {
      setImportError("Not valid JSON. Use V1, V2, or V3-draft Character Card JSON.");
      return;
    }

    if (typeof parsedJson !== "object" || parsedJson === null) {
      setImportError("Not a recognized Character Card. Use V1, V2, or V3-draft Character Card JSON.");
      return;
    }

    try {
      const result = importCard(parsedJson);
      applyImport(result);
      setImportError(null);
      toast({
        title: "Imported",
        description: result.format === "v1"
          ? "V1 card loaded — it will export as V2 (upgraded)."
          : result.format === "v3"
            ? "V3 draft card loaded."
            : "V2 character card loaded.",
      });
      setShowImport(false);
      setImportText("");
    } catch (err) {
      setImportError(err instanceof CardImportError ? err.message : errMsg(err) || "Failed to import character card.");
    }
  };

  const handleClearAll = () => {
    setCard(emptyCardData());
    setPreserved(emptyPreserved());
    setImportedFormat(null);
    setImportWarnings([]);
    setPngFile(null);
    toast({ title: "Cleared", description: "All fields have been reset." });
  };

  const v2Fields: { key: keyof CardData; label: string; multiline?: boolean; placeholder: string }[] = [
    { key: "name", label: "Character Name", placeholder: "Luna Starweaver" },
    { key: "creator", label: "Creator", placeholder: "Your name or handle" },
    { key: "character_version", label: "Character Version", placeholder: "1.0" },
    { key: "description", label: "Description", multiline: true, placeholder: "A mysterious sorceress who dwells in the ancient tower..." },
    { key: "personality", label: "Personality", multiline: true, placeholder: "Confident, seductive, witty, caring, slightly mischievous..." },
    { key: "scenario", label: "Scenario", multiline: true, placeholder: "{{user}} has stumbled upon {{char}}'s tower while seeking shelter..." },
    { key: "first_mes", label: "First Message", multiline: true, placeholder: "*Luna looks up from her ancient tome* \"Well, well...\"" },
    { key: "mes_example", label: "Example Dialogue", multiline: true, placeholder: "<START>\n{{user}}: What are you reading?\n{{char}}: *She tilts the book*..." },
    { key: "system_prompt", label: "System Prompt", multiline: true, placeholder: "Write {{char}}'s next reply in a roleplay with {{user}}..." },
    { key: "post_history_instructions", label: "Post History Instructions", multiline: true, placeholder: "End each response with an action or question..." },
    { key: "creator_notes", label: "Creator Notes", multiline: true, placeholder: "This character works best with creative/roleplay models..." },
    { key: "tags", label: "Tags (comma-separated)", placeholder: "fantasy, romance, nsfw, sorceress, original character" },
  ];

  const v3ExtraFields: { key: keyof CardData; label: string; multiline?: boolean; placeholder: string }[] = [
    { key: "nickname", label: "Nickname", placeholder: "Luna, Star" },
  ];

  const fields = specVersion === "v3" ? [...v2Fields, ...v3ExtraFields] : v2Fields;
  const generatableFields = new Set(Object.keys(emptyCardData()).filter((k) => k !== "creator" && k !== "character_version"));

  const updateAssets = (next: CardAsset[]) => setPreserved((prev) => ({ ...prev, assets: next }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground mb-2">Character Card Builder</h2>
        <p className="text-sm text-muted-foreground">
          Import V1/V2/V3 cards, export validated V2 JSON/PNG or V3 draft JSON/PNG with embedded data, and use AI to generate or enhance fields.
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
              Manual editing, import, JSON export, and PNG embedding still work. AI generation buttons are disabled until the backend is reachable again.
            </p>
            {ai.reason && <p className="mt-1 text-xs text-muted-foreground/80">{ai.reason}</p>}
          </div>
        </div>
      )}

      {/* Spec version toggle */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
        <span className={`text-sm font-medium ${specVersion === "v2" ? "text-foreground" : "text-muted-foreground"}`}>V2</span>
        <Switch
          checked={specVersion === "v3"}
          onCheckedChange={(checked) => setSpecVersion(checked ? "v3" : "v2")}
          aria-label="Use V3 draft format"
          aria-describedby="character-card-version-help"
        />
        <span className={`text-sm font-medium ${specVersion === "v3" ? "text-foreground" : "text-muted-foreground"}`}>V3 (draft)</span>
        <span id="character-card-version-help" className="text-xs text-muted-foreground ml-2">
          {specVersion === "v3"
            ? "chara_card_v3 (draft spec) — includes nickname, source, assets, multilingual notes. May not be fully supported by all frontends."
            : "chara_card_v2 — stable, widely supported"}
        </span>
      </div>

      {/* Imported format badge + preservation / export notices */}
      {(importedFormat || allNotices.length > 0) && (
        <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3 space-y-1.5" role="status" aria-live="polite">
          {importedFormat && (
            <p className="text-sm font-medium text-foreground">
              {importedFormat === "v1" && "Imported as V1 — this card will export as V2 (upgraded)."}
              {importedFormat === "v2" && "Imported as V2 character card."}
              {importedFormat === "v3" && "Imported as V3 draft character card."}
            </p>
          )}
          {allNotices.map((notice, index) => (
            <p key={index} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {notice}
            </p>
          ))}
        </div>
      )}

      {/* Top action bar */}
      <div className="flex flex-wrap gap-3">
        <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) { setImportText(""); setImportError(null); } }}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Upload className="h-4 w-4" /> Import (Text)
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby="character-import-description">
            <DialogTitle>Import Character Card JSON</DialogTitle>
            <DialogDescription id="character-import-description">
              Paste V1, V2, or V3-draft JSON. Unrecognized formats are rejected locally.
            </DialogDescription>
            {importError && (
              <div role="alert" aria-live="assertive" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {importError}
              </div>
            )}
            <Textarea id="character-import-text" aria-label="Character Card JSON" placeholder="Paste character data here..." value={importText} onChange={(e) => { setImportText(e.target.value); if (importError) setImportError(null); }} className="min-h-[150px] bg-secondary border-border font-mono text-sm" />
            <DialogFooter>
              <Button onClick={handleImport}>
                <Upload className="h-4 w-4" /> Import
              </Button>
              <Button variant="ghost" onClick={() => { setShowImport(false); setImportText(""); setImportError(null); }}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div>
          <input ref={fileImportRef} id="character-card-file" type="file" accept=".json,.png,.txt,.yaml,.yml" className="sr-only" aria-label="Character Card file" aria-describedby="character-card-file-help" onChange={handleFileImport} />
          <p id="character-card-file-help" className="sr-only">Accepts JSON, PNG, TXT, YAML, or YML files. JSON files are limited to 5 megabytes and PNG files to 25 megabytes.</p>
          <Button variant="outline" onClick={() => fileImportRef.current?.click()} aria-describedby="character-card-file-help">
            <Upload className="h-4 w-4" /> Import (File/PNG)
          </Button>
        </div>
        <div className="flex items-center gap-1"><Button onClick={handleGenerateAll} disabled={generatingAll || aiUnavailable}>
          {generatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generatingAll ? "Generating..." : "Generate All Fields"}
        </Button><Button variant="outline" size="icon" onClick={() => setShowGenerationSettings((value) => !value)} aria-label="Generation settings" title="Generation settings"><Settings2 className="h-4 w-4" /></Button></div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Clear All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>This clears all fields and removes the uploaded PNG. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearAll}>Clear All Fields</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {showGenerationSettings && <div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-primary" /><p className="text-sm font-medium text-foreground">AI generation settings</p></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setGenerationMode("default")} className={`rounded-md border px-3 py-1.5 text-xs ${generationMode === "default" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>Default Free API</button><button onClick={() => setGenerationMode("byok")} className={`rounded-md border px-3 py-1.5 text-xs ${generationMode === "byok" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>Custom OpenRouter / BYOK</button></div><p className="mt-2 text-xs text-muted-foreground">Privacy: the default mode uses the configured app backend. BYOK mode is a setting placeholder until a custom key is entered; keys should remain in memory and never be logged.</p></div>}

      {/* Fields */}
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={`card-field-${field.key}`} className="text-sm font-medium text-foreground">{field.label}</label>
              <div className="flex items-center gap-2">
                {recommendedMax[field.key] && (
                  <CharCountIndicator current={String(card[field.key]).length} max={recommendedMax[field.key]} />
                )}
                {generatableFields.has(field.key) && (
                  <Button variant="ghost" size="sm" onClick={() => handleGenerateField(field.key)} disabled={generatingField === field.key || aiUnavailable} className="h-7 px-2 text-xs text-muted-foreground hover:text-primary">
                    {generatingField === field.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {generatingField === field.key ? "Generating..." : "AI Generate"}
                  </Button>
                )}
              </div>
            </div>
            {field.multiline ? (
              <Textarea id={`card-field-${field.key}`} placeholder={field.placeholder} value={String(card[field.key])} onChange={(e) => updateField(field.key, e.target.value)} className="min-h-[100px] bg-secondary border-border text-sm" />
            ) : (
              <Input id={`card-field-${field.key}`} placeholder={field.placeholder} value={String(card[field.key])} onChange={(e) => updateField(field.key, e.target.value)} className="bg-secondary border-border" />
            )}
          </div>
        ))}

        {/* Alternate greetings list editor */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">Alternate Greetings</span>
            <span className="text-xs text-muted-foreground">Multiple opening scenarios for the same character</span>
          </div>
          <ListEditor
            items={card.alternate_greetings}
            onChange={(items) => updateList("alternate_greetings", items)}
            placeholder={'*A different opening message* "An alternate way to start..."'}
            addLabel="Add alternate greeting"
            fieldLabel="Alternate greeting"
          />
        </div>

        {/* V3-only list fields */}
        {specVersion === "v3" && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">Source</span>
                <span className="text-xs text-muted-foreground">URLs or IDs where this card originated</span>
              </div>
              <ListEditor
                items={card.source}
                onChange={(items) => updateList("source", items)}
                placeholder="https://chub.ai/characters/..."
                addLabel="Add source"
                fieldLabel="Source URL"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">Group-Only Greetings</span>
                <span className="text-xs text-muted-foreground">Greetings used only in group chats</span>
              </div>
              <ListEditor
                items={card.group_only_greetings}
                onChange={(items) => updateList("group_only_greetings", items)}
                placeholder="*A greeting that acknowledges the other characters in the room*"
                addLabel="Add group greeting"
                fieldLabel="Group-only greeting"
              />
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
              <div><p className="text-sm font-medium text-foreground">Assets (V3 draft)</p><p className="text-xs text-muted-foreground">Declare optional files without uploading them. Each asset needs a spec type, name, URI, and lowercase file extension (e.g. png).</p></div>
              {preserved.assets.map((asset, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[150px_1fr_1fr_90px_auto]">
                  <select
                    value={asset.type}
                    onChange={(event) => updateAssets(preserved.assets.map((item, i) => i === index ? { ...item, type: event.target.value } : item))}
                    className="h-10 rounded-md border border-border bg-secondary px-2 text-sm"
                    aria-label={`Asset ${index + 1} type`}
                  >
                    {CANONICAL_ASSET_TYPES.map((type) => (
                      <option key={type} value={type}>{ASSET_TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                  <Input value={asset.name} onChange={(event) => updateAssets(preserved.assets.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder="Asset name" className="bg-secondary" aria-label={`Asset ${index + 1} name`} />
                  <Input value={asset.uri} onChange={(event) => updateAssets(preserved.assets.map((item, i) => i === index ? { ...item, uri: event.target.value } : item))} placeholder="assets/expressions/happy.png" className="bg-secondary" aria-label={`Asset ${index + 1} URI`} />
                  <Input value={asset.ext} onChange={(event) => updateAssets(preserved.assets.map((item, i) => i === index ? { ...item, ext: event.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") } : item))} placeholder="png" className="bg-secondary" aria-label={`Asset ${index + 1} extension`} />
                  <Button variant="ghost" size="sm" onClick={() => updateAssets(preserved.assets.filter((_, i) => i !== index))} className="text-destructive" aria-label={`Remove asset ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => updateAssets([...preserved.assets, { type: "icon", name: "", uri: "", ext: "png" }])}><Plus className="h-4 w-4" /> Add asset declaration</Button>
            </div>
          </>
        )}

        {/* Multilingual JSON validation indicator */}
        {specVersion === "v3" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="card-field-creator-notes-multilingual" className="text-sm font-medium text-foreground">Creator Notes (Multilingual JSON)</label>
              {card.creator_notes_multilingual.trim() && (
                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
                  multilingual.valid
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}>
                  {multilingual.valid ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {multilingual.valid ? "Valid JSON" : "Invalid JSON"}
                </span>
              )}
            </div>
            <Textarea
              id="card-field-creator-notes-multilingual"
              placeholder='{"es": "Notas en español", "ja": "日本語のノート"}'
              value={card.creator_notes_multilingual}
              onChange={(e) => updateField("creator_notes_multilingual", e.target.value)}
              className="min-h-[80px] bg-secondary border-border font-mono text-sm"
            />
            {!multilingual.valid && (
              <p className="mt-1 text-xs text-destructive">
                {multilingual.error} — this field will be excluded from the exported card.
              </p>
            )}
            {multilingual.valid && multilingual.value && (
              <p className="mt-1 text-xs text-green-400">
                ✓ Parsed {Object.keys(multilingual.value).length} language(s): {Object.keys(multilingual.value).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* PNG image for embedding */}
      <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">PNG Image for Card Embedding</p>
        <p className="text-xs text-muted-foreground">
          Upload a character portrait PNG (max {MAX_PNG_LABEL}) to export as an embedded card (used by SillyTavern, RisuAI, etc.)
        </p>
        <input ref={pngInputRef} id="character-card-png" type="file" accept="image/png" className="sr-only" aria-label="Character portrait PNG" aria-describedby="character-card-png-help" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPngFile(f); }} />
        <p id="character-card-png-help" className="sr-only">PNG images only, maximum size {MAX_PNG_LABEL}. The image stays in your browser and is used for local card embedding.</p>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => pngInputRef.current?.click()} aria-describedby="character-card-png-help">
            <Image className="h-4 w-4" />
            {pngFile ? pngFile.name : "Choose PNG"}
          </Button>
          {pngFile && <span className="text-xs text-muted-foreground">{(pngFile.size / 1024).toFixed(0)} KB</span>}
        </div>
        {pngPreviewUrl && (
          <div className="mt-2">
            <img src={pngPreviewUrl} alt="Card preview" className="max-h-48 rounded-md border border-border object-contain" />
          </div>
        )}
      </div>

      {/* Export actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleCopyJson}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : `Copy ${specVersion === "v3" ? "V3 (draft)" : "V2"} JSON`}
        </Button>
        <Button variant="outline" onClick={handleDownloadJson}>
          <Download className="h-4 w-4" /> Download JSON
        </Button>
        <Button variant="outline" onClick={handleDownloadPng} disabled={!pngFile}>
          <Image className="h-4 w-4" /> Export as PNG
        </Button>
      </div>

      {/* Approximate token estimate */}
      <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground" id="card-token-estimate-label">Approx. tokens</p>
            <p className="text-xs text-muted-foreground">Local estimate based on characters; actual token counts vary by model.</p>
          </div>
          <output aria-labelledby="card-token-estimate-label" className="text-xl font-semibold text-foreground tabular-nums">
            {tokenEstimate.total.toLocaleString()}
          </output>
        </div>
        <details className="text-xs text-muted-foreground">
          <summary>What&apos;s included?</summary>
          <p className="mt-2">Estimate = total relevant characters ÷ 4, rounded up. Only text that travels with the card is counted.</p>
          {tokenEstimate.fields.length > 0 ? (
            <ul className="mt-2 list-disc pl-4 space-y-1">
              {tokenEstimate.fields.map((f) => (
                <li key={f.key}>{f.label}: {f.chars.toLocaleString()} characters</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2">No populated text fields yet.</p>
          )}
          <p className="mt-2">Excluded: {tokenEstimate.excluded.join("; ")}.</p>
          <p className="mt-2">Opaque data is not guessed at; this is not a tokenizer and not model-exact.</p>
        </details>
      </div>

      {/* Preview */}
      <div>
        <div className="mb-2 flex items-center justify-between"><h3 className="font-display font-semibold text-foreground">Live preview</h3><div className="flex gap-2"><Button variant={previewMode === "json" ? "default" : "outline"} size="sm" onClick={() => setPreviewMode("json")}><FileJson className="h-4 w-4" /> JSON</Button><Button variant={previewMode === "chat" ? "default" : "outline"} size="sm" onClick={() => setPreviewMode("chat")}><Eye className="h-4 w-4" /> Chat bubble</Button></div></div>
          {previewMode === "json" ? <pre tabIndex={0} aria-label="Exported card JSON preview" className="rounded-lg border border-border bg-secondary/50 p-4 text-xs text-muted-foreground overflow-auto max-h-[400px] whitespace-pre-wrap font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{JSON.stringify(currentExport.envelope, null, 2)}</pre> : (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                {pngPreviewUrl ? (
                  <img src={pngPreviewUrl} alt={card.name ? `${card.name} portrait preview` : "Character portrait preview"} className="h-10 w-10 rounded-full object-cover border border-border" />
                ) : (
                  <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">{card.name ? card.name.slice(0, 1).toUpperCase() : "?"}</div>
                )}
                <div>
                  <p className="font-semibold text-foreground">{card.name || "Character preview"}</p>
                  <p className="text-xs text-muted-foreground">Opening scene{specVersion === "v3" ? " · V3 draft" : ""}</p>
                </div>
              </div>
              {card.scenario.trim() && (
                <p className="text-xs text-muted-foreground">Scenario: {card.scenario}</p>
              )}
              <div className="max-w-2xl rounded-2xl rounded-tl-sm bg-secondary p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {card.first_mes.trim() ? renderGreeting() : <span className="text-muted-foreground">Add a first message to preview the opening chat bubble.</span>}
              </div>
              <div className="flex justify-end">
                <div className="max-w-2xl rounded-2xl rounded-tr-sm bg-primary/10 p-4 text-sm leading-relaxed text-foreground">Hi — tell me about yourself.</div>
              </div>
              <p className="text-xs text-muted-foreground">Presentation-only preview: it does not generate dialogue, does not simulate platform behavior, and is not a guarantee of how another frontend will render the card.</p>
            </div>
          )}
      </div>
    </div>
  );
};
