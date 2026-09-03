import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Download, FileJson, Plus, Search, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface LorebookEntry {
  id: string;
  keys: string[];
  secondaryKeys: string;
  insertionOrder: number;
  position: "before_char" | "after_char" | "top_of_context";
  content: string;
  constant: boolean;
}

const emptyEntry = (id = crypto.randomUUID()): LorebookEntry => ({ id, keys: [], secondaryKeys: "", insertionOrder: 100, position: "before_char", content: "", constant: false });
const tokenCount = (value: string) => Math.ceil(value.trim().split(/\s+/).filter(Boolean).length * 1.3);

const LorebookBuilder = () => {
  const [entries, setEntries] = useState<LorebookEntry[]>([emptyEntry()]);
  const [selectedId, setSelectedId] = useState("");
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [search, setSearch] = useState("");
  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");
  const [importText, setImportText] = useState("");
  const { toast } = useToast();
  const selected = entries.find((entry) => entry.id === selectedId) || entries[0];
  const activeEntries = entries.filter((entry) => entry.constant || entry.keys.length > 0);
  const totalTokens = activeEntries.reduce((sum, entry) => sum + tokenCount(entry.content), 0);
  const filteredEntries = entries.filter((entry) => `${entry.keys.join(" ")} ${entry.content}`.toLowerCase().includes(search.toLowerCase()));

  const updateEntry = (patch: Partial<LorebookEntry>) => {
    if (!selected) return;
    setEntries((previous) => previous.map((entry) => entry.id === selected.id ? { ...entry, ...patch } : entry));
  };
  const addEntry = () => {
    const entry = emptyEntry();
    setEntries((previous) => [...previous, entry]);
    setSelectedId(entry.id);
  };
  const removeEntry = () => {
    if (!selected) return;
    setEntries((previous) => previous.filter((entry) => entry.id !== selected.id));
    setSelectedId("");
  };
  const replaceAll = () => {
    if (!replaceFrom) return;
    setEntries((previous) => previous.map((entry) => ({ ...entry, content: entry.content.split(replaceFrom).join(replaceTo), keys: entry.keys.map((key) => key.split(replaceFrom).join(replaceTo)) })));
    toast({ title: "Replaced", description: "Search and replace applied to all entries." });
  };
  const exportJson = (format: "sillytavern" | "agnaistic") => {
    const payload = format === "sillytavern"
      ? { spec: "world_info", spec_version: 2, entries: Object.fromEntries(entries.map((entry, index) => [String(index), { uid: index, key: entry.keys, keysecondary: entry.secondaryKeys, comment: "", content: entry.content, constant: entry.constant, selective: Boolean(entry.secondaryKeys), order: entry.insertionOrder, position: entry.position, disable: false }])) }
      : { name: "AI Companion Hub Lorebook", entries: entries.map((entry) => ({ keys: entry.keys, secondary_keys: entry.secondaryKeys, content: entry.content, insertion_order: entry.insertionOrder, position: entry.position, constant: entry.constant })) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `lorebook-${format}.json`; anchor.click(); URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${format === "sillytavern" ? "SillyTavern World Info v2" : "Agnaistic"} JSON downloaded.` });
  };
  const importJson = () => {
    try {
      const parsed = JSON.parse(importText);
      const rawEntries = parsed.entries && !Array.isArray(parsed.entries) ? Object.values(parsed.entries) : parsed.entries;
      if (!Array.isArray(rawEntries)) throw new Error("No entries array found");
      const imported = rawEntries.map((raw) => {
        const item = raw as Record<string, unknown>;
        const rawKeys = item.key || item.keys || [];
        return {
          id: crypto.randomUUID(),
          keys: Array.isArray(rawKeys) ? rawKeys.map(String) : String(rawKeys).split(",").map((key) => key.trim()).filter(Boolean),
          secondaryKeys: String(item.keysecondary || item.secondary_keys || ""),
          insertionOrder: Number(item.order ?? item.insertion_order ?? 100),
          position: (item.position || "before_char") as LorebookEntry["position"],
          content: String(item.content || ""),
          constant: Boolean(item.constant),
        };
      });
      setEntries(imported.length ? imported : [emptyEntry()]); setSelectedId(""); setImportText("");
      toast({ title: "Imported", description: `${imported.length} lorebook entries loaded.` });
    } catch (error) { toast({ title: "Invalid lorebook JSON", description: error instanceof Error ? error.message : "Could not parse the file.", variant: "destructive" }); }
  };
  const selectedTokens = useMemo(() => selected ? tokenCount(selected.content) : 0, [selected]);

  return (
    <div className="max-w-5xl space-y-6">
      <div><h2 className="font-display text-xl font-semibold text-foreground">Lorebook / World Info Builder</h2><p className="mt-2 text-sm text-muted-foreground">Create contextual entries for SillyTavern, Agnaistic, and compatible frontends. Keys and constant entries are kept separate from your exported body text.</p></div>
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 flex gap-2"><Input aria-label="Search lorebook entries" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search entries" className="bg-secondary" /><Button size="icon" variant="outline" onClick={addEntry} aria-label="Add lorebook entry"><Plus className="h-4 w-4" /></Button></div>
          <div className="space-y-1">{filteredEntries.map((entry, index) => <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} aria-pressed={selected?.id === entry.id} className={`w-full rounded-md px-3 py-2 text-left text-xs ${selected?.id === entry.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}><span className="block truncate">{entry.keys[0] || `Untitled entry ${index + 1}`}</span><span>{tokenCount(entry.content)} tokens{entry.constant ? " · constant" : ""}</span></button>)}</div>
        </aside>
        <section className="space-y-4">
          {selected && <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-foreground">Entry editor</h3><p className="text-xs text-muted-foreground">This entry: {selectedTokens} tokens · Active budget: {totalTokens} tokens</p></div><Button variant="ghost" size="sm" onClick={removeEntry} className="text-destructive"><Trash2 className="h-4 w-4" /> Delete</Button></div>
            <div><label htmlFor="lore-keys" className="text-sm font-medium">Keys / Trigger Words</label><Input id="lore-keys" value={selected.keys.join(", ")} onChange={(event) => updateEntry({ keys: event.target.value.split(",").map((key) => key.trim()).filter(Boolean) })} placeholder="castle, royal court, kingdom" className="mt-1 bg-secondary" /></div>
            <div><label htmlFor="lore-secondary-keys" className="text-sm font-medium">Secondary Keys / Logic (AND / NOT)</label><Input id="lore-secondary-keys" value={selected.secondaryKeys} onChange={(event) => updateEntry({ secondaryKeys: event.target.value })} placeholder="AND: moon, NOT: modern" className="mt-1 bg-secondary" /></div>
            <div className="grid gap-4 sm:grid-cols-3"><div><label htmlFor="lore-insertion-order" className="text-sm font-medium">Insertion order / priority</label><Input id="lore-insertion-order" type="number" value={selected.insertionOrder} onChange={(event) => updateEntry({ insertionOrder: Number(event.target.value) })} className="mt-1 bg-secondary" /></div><div><label htmlFor="lore-position" className="text-sm font-medium">Position</label><select id="lore-position" value={selected.position} onChange={(event) => updateEntry({ position: event.target.value as LorebookEntry["position"] })} className="mt-1 h-10 w-full rounded-md border border-border bg-secondary px-3 text-sm"><option value="before_char">Before character</option><option value="after_char">After character</option><option value="top_of_context">Top of context</option></select></div><div className="flex items-baseline gap-2 pt-6"><label htmlFor="lore-constant" className="flex items-center gap-2 text-sm"><Switch id="lore-constant" checked={selected.constant} onCheckedChange={(constant) => updateEntry({ constant })} /><span>Constant / always active</span></label></div></div>
            <div><div className="flex justify-between"><label htmlFor="lore-content" className="text-sm font-medium">Content / Body</label><span className="text-xs text-muted-foreground">{selectedTokens} tokens</span></div><Textarea id="lore-content" value={selected.content} onChange={(event) => updateEntry({ content: event.target.value })} placeholder="Write dense, factual world information injected when this entry activates..." className="mt-1 min-h-[220px] bg-secondary font-mono text-sm" /></div>
          </div>}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3"><h3 className="font-semibold text-foreground">Bulk operations</h3><div className="grid gap-3 md:grid-cols-3"><Input aria-label="Set keywords on all entries" value={bulkKeywords} onChange={(event) => setBulkKeywords(event.target.value)} placeholder="Replace all keywords with..." className="bg-secondary" /><Button variant="outline" onClick={() => setEntries((previous) => previous.map((entry) => ({ ...entry, keys: bulkKeywords.split(",").map((key) => key.trim()).filter(Boolean) })))}><Search className="h-4 w-4" /> Set keys on all</Button><div className="flex gap-2"><Input aria-label="Find text in entries" value={replaceFrom} onChange={(event) => setReplaceFrom(event.target.value)} placeholder="Find" className="bg-secondary" /><Input aria-label="Replace with text" value={replaceTo} onChange={(event) => setReplaceTo(event.target.value)} placeholder="Replace" className="bg-secondary" /><Button variant="outline" onClick={replaceAll}>Apply</Button></div></div></div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3"><h3 className="font-semibold text-foreground">Import / export</h3><Textarea aria-label="Lorebook JSON to import" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste SillyTavern World Info spec_version 2 or Agnaistic JSON" className="min-h-[100px] bg-secondary font-mono text-xs" /><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={importJson}><Upload className="h-4 w-4" /> Import JSON</Button><Button onClick={() => exportJson("sillytavern")}><Download className="h-4 w-4" /> SillyTavern v2</Button><Button variant="outline" onClick={() => exportJson("agnaistic")}><FileJson className="h-4 w-4" /> Agnaistic</Button></div><p className="text-xs text-muted-foreground">Active budget: {totalTokens} tokens across {activeEntries.length} entries. This approximation uses 1.3 tokens per whitespace-delimited word.</p></div>
        </section>
      </div>
    </div>
  );
};

export default LorebookBuilder;
