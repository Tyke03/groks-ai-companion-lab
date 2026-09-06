import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Download, FileJson, Link2, Plus, Search, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadCardLibrary, type StoredCardSlot } from "@/lib/cardStorage";
import {
  DEFAULT_LOREBOOK_NAME,
  emptyEntry,
  extractImportedName,
  loadLorebook,
  lorebookHasContent,
  mergeEntries,
  detectLorebookImportShape,
  parseImportedEntries,
  replaceEntries,
  saveLorebook,
  toggleBoundCard,
  type LorebookEntry,
  type StoredLorebook,
} from "@/lib/lorebookStorage";

export type { LorebookEntry };

const tokenCount = (value: string) => Math.ceil(value.trim().split(/\s+/).filter(Boolean).length * 1.3);

const LorebookBuilder = () => {
  const [book, setBook] = useState<StoredLorebook>(() => loadLorebook());
  const [selectedId, setSelectedId] = useState("");
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [search, setSearch] = useState("");
  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");
  const [importText, setImportText] = useState("");
  const [pendingImport, setPendingImport] = useState<{
    entries: LorebookEntry[];
    importedName: string | null;
    normalizedFromSt?: boolean;
  } | null>(null);
  const [cardSlots, setCardSlots] = useState<StoredCardSlot[]>([]);
  const { toast } = useToast();

  const entries = book.entries;
  const selected = entries.find((entry) => entry.id === selectedId) || entries[0];
  const activeEntries = entries.filter((entry) => entry.constant || entry.keys.length > 0);
  const totalTokens = activeEntries.reduce((sum, entry) => sum + tokenCount(entry.content), 0);
  const filteredEntries = entries.filter((entry) =>
    `${entry.keys.join(" ")} ${entry.content}`.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    saveLorebook(book);
  }, [book]);

  useEffect(() => {
    setCardSlots(loadCardLibrary().cards);
  }, []);

  const patchBook = (updater: (previous: StoredLorebook) => StoredLorebook) => {
    setBook((previous) => updater(previous));
  };

  const updateEntry = (patch: Partial<LorebookEntry>) => {
    if (!selected) return;
    patchBook((previous) => ({
      ...previous,
      entries: previous.entries.map((entry) =>
        entry.id === selected.id ? { ...entry, ...patch } : entry,
      ),
      updatedAt: Date.now(),
    }));
  };

  const addEntry = () => {
    const entry = emptyEntry();
    patchBook((previous) => ({
      ...previous,
      entries: [...previous.entries, entry],
      updatedAt: Date.now(),
    }));
    setSelectedId(entry.id);
  };

  const removeEntry = () => {
    if (!selected) return;
    patchBook((previous) => {
      const nextEntries = previous.entries.filter((entry) => entry.id !== selected.id);
      return {
        ...previous,
        entries: nextEntries.length ? nextEntries : [emptyEntry()],
        updatedAt: Date.now(),
      };
    });
    setSelectedId("");
  };

  const replaceAll = () => {
    if (!replaceFrom) return;
    patchBook((previous) => ({
      ...previous,
      entries: previous.entries.map((entry) => ({
        ...entry,
        content: entry.content.split(replaceFrom).join(replaceTo),
        keys: entry.keys.map((key) => key.split(replaceFrom).join(replaceTo)),
      })),
      updatedAt: Date.now(),
    }));
    toast({ title: "Replaced", description: "Search and replace applied to all entries." });
  };

  const exportJson = (format: "sillytavern" | "agnaistic") => {
    const loreName = book.name.trim() || DEFAULT_LOREBOOK_NAME;
    const payload =
      format === "sillytavern"
        ? {
            spec: "world_info",
            spec_version: 2,
            name: loreName,
            entries: Object.fromEntries(
              entries.map((entry, index) => [
                String(index),
                {
                  uid: index,
                  key: entry.keys,
                  keysecondary: entry.secondaryKeys,
                  comment: "",
                  content: entry.content,
                  constant: entry.constant,
                  selective: Boolean(entry.secondaryKeys),
                  order: entry.insertionOrder,
                  position: entry.position,
                  disable: false,
                },
              ]),
            ),
          }
        : {
            name: loreName,
            entries: entries.map((entry) => ({
              keys: entry.keys,
              secondary_keys: entry.secondaryKeys,
              content: entry.content,
              insertion_order: entry.insertionOrder,
              position: entry.position,
              constant: entry.constant,
            })),
          };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lorebook-${format}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Exported",
      description: `${format === "sillytavern" ? "SillyTavern World Info v2" : "Agnaistic"} JSON downloaded.`,
    });
  };

  const applyImport = (
    mode: "merge" | "replace",
    imported: LorebookEntry[],
    importedName: string | null,
    options?: { normalizedFromSt?: boolean },
  ) => {
    const normalizedFromSt = Boolean(options?.normalizedFromSt);
    patchBook((previous) => {
      const nextEntries =
        mode === "merge"
          ? mergeEntries(previous.entries, imported)
          : replaceEntries(imported);
      const nextName =
        previous.name.trim() && previous.name !== DEFAULT_LOREBOOK_NAME
          ? previous.name
          : importedName || previous.name;
      return {
        ...previous,
        name: nextName,
        entries: nextEntries,
        updatedAt: Date.now(),
      };
    });
    setSelectedId("");
    setImportText("");
    setPendingImport(null);
    const actionTitle = mode === "merge" ? "Merged" : "Replaced";
    toast({
      title: normalizedFromSt ? `Normalized & ${actionTitle}` : actionTitle,
      description:
        mode === "merge"
          ? normalizedFromSt
            ? `${imported.length} SillyTavern nested entries normalized and merged; prior entries kept.`
            : `${imported.length} lorebook entries merged; prior entries kept.`
          : normalizedFromSt
            ? `${imported.length} SillyTavern nested entries normalized and loaded (previous entries replaced).`
            : `${imported.length} lorebook entries loaded (previous entries replaced).`,
    });
  };

  const beginImport = () => {
    try {
      const parsed = JSON.parse(importText);
      const shape = detectLorebookImportShape(parsed);
      const imported = parseImportedEntries(parsed);
      const importedName = extractImportedName(parsed);
      const normalizedFromSt = shape === "sillytavern-data";
      if (normalizedFromSt && lorebookHasContent(book) && imported.length > 0) {
        toast({
          title: "Normalized SillyTavern import",
          description: "Found entries under data.entries — choose Merge or Replace below.",
        });
      }
      if (lorebookHasContent(book) && imported.length > 0) {
        setPendingImport({ entries: imported, importedName, normalizedFromSt });
        return;
      }
      applyImport("merge", imported, importedName, { normalizedFromSt });
    } catch (error) {
      toast({
        title: "Invalid lorebook JSON",
        description: error instanceof Error ? error.message : "Could not parse the file.",
        variant: "destructive",
      });
    }
  };

  const selectedTokens = useMemo(() => (selected ? tokenCount(selected.content) : 0), [selected]);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground">Lorebook / World Info Builder</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create contextual entries for SillyTavern, Agnaistic, and compatible frontends. Name the world, bind
          character cards from your local library, and import with merge by default so prior entries are not wiped.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div>
          <label htmlFor="lorebook-name" className="text-sm font-medium">
            Lorebook / world name
          </label>
          <Input
            id="lorebook-name"
            aria-label="Lorebook name"
            value={book.name}
            onChange={(event) =>
              patchBook((previous) => ({
                ...previous,
                name: event.target.value,
                updatedAt: Date.now(),
              }))
            }
            placeholder="e.g. Crystal Court, Neon Harbor"
            className="mt-1 bg-secondary"
          />
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Link2 className="h-4 w-4" />
            Bound character cards
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Link this lorebook to cards from the Character Card Builder library (localStorage). Bindings survive reload.
          </p>
          {cardSlots.length === 0 ? (
            <p className="text-xs text-muted-foreground">No cards in the local library yet.</p>
          ) : (
            <ul className="space-y-2" aria-label="Bound character cards">
              {cardSlots.map((slot) => {
                const checked = book.boundCardIds.includes(slot.id);
                return (
                  <li key={slot.id}>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => patchBook((previous) => toggleBoundCard(previous, slot.id))}
                        aria-label={`Bind card ${slot.label}`}
                      />
                      <span className="truncate">{slot.label || "Untitled card"}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 flex gap-2">
            <Input
              aria-label="Search lorebook entries"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search entries"
              className="bg-secondary"
            />
            <Button size="icon" variant="outline" onClick={addEntry} aria-label="Add lorebook entry">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1">
            {filteredEntries.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedId(entry.id)}
                aria-pressed={selected?.id === entry.id}
                className={`w-full rounded-md px-3 py-2 text-left text-xs ${
                  selected?.id === entry.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <span className="block truncate">{entry.keys[0] || `Untitled entry ${index + 1}`}</span>
                <span>
                  {tokenCount(entry.content)} tokens{entry.constant ? " · constant" : ""}
                </span>
              </button>
            ))}
          </div>
        </aside>
        <section className="space-y-4">
          {selected && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">Entry editor</h3>
                  <p className="text-xs text-muted-foreground">
                    This entry: {selectedTokens} tokens · Active budget: {totalTokens} tokens
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={removeEntry} className="text-destructive">
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
              <div>
                <label htmlFor="lore-keys" className="text-sm font-medium">
                  Keys / Trigger Words
                </label>
                <Input
                  id="lore-keys"
                  value={selected.keys.join(", ")}
                  onChange={(event) =>
                    updateEntry({
                      keys: event.target.value
                        .split(",")
                        .map((key) => key.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="castle, royal court, kingdom"
                  className="mt-1 bg-secondary"
                />
              </div>
              <div>
                <label htmlFor="lore-secondary-keys" className="text-sm font-medium">
                  Secondary Keys / Logic (AND / NOT)
                </label>
                <Input
                  id="lore-secondary-keys"
                  value={selected.secondaryKeys}
                  onChange={(event) => updateEntry({ secondaryKeys: event.target.value })}
                  placeholder="AND: moon, NOT: modern"
                  className="mt-1 bg-secondary"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="lore-insertion-order" className="text-sm font-medium">
                    Insertion order / priority
                  </label>
                  <Input
                    id="lore-insertion-order"
                    type="number"
                    value={selected.insertionOrder}
                    onChange={(event) => updateEntry({ insertionOrder: Number(event.target.value) })}
                    className="mt-1 bg-secondary"
                  />
                </div>
                <div>
                  <label htmlFor="lore-position" className="text-sm font-medium">
                    Position
                  </label>
                  <select
                    id="lore-position"
                    value={selected.position}
                    onChange={(event) =>
                      updateEntry({ position: event.target.value as LorebookEntry["position"] })
                    }
                    className="mt-1 h-10 w-full rounded-md border border-border bg-secondary px-3 text-sm"
                  >
                    <option value="before_char">Before character</option>
                    <option value="after_char">After character</option>
                    <option value="top_of_context">Top of context</option>
                  </select>
                </div>
                <div className="flex items-baseline gap-2 pt-6">
                  <label htmlFor="lore-constant" className="flex items-center gap-2 text-sm">
                    <Switch
                      id="lore-constant"
                      checked={selected.constant}
                      onCheckedChange={(constant) => updateEntry({ constant })}
                    />
                    <span>Constant / always active</span>
                  </label>
                </div>
              </div>
              <div>
                <div className="flex justify-between">
                  <label htmlFor="lore-content" className="text-sm font-medium">
                    Content / Body
                  </label>
                  <span className="text-xs text-muted-foreground">{selectedTokens} tokens</span>
                </div>
                <Textarea
                  id="lore-content"
                  value={selected.content}
                  onChange={(event) => updateEntry({ content: event.target.value })}
                  placeholder="Write dense, factual world information injected when this entry activates..."
                  className="mt-1 min-h-[220px] bg-secondary font-mono text-sm"
                />
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-foreground">Bulk operations</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                aria-label="Set keywords on all entries"
                value={bulkKeywords}
                onChange={(event) => setBulkKeywords(event.target.value)}
                placeholder="Replace all keywords with..."
                className="bg-secondary"
              />
              <Button
                variant="outline"
                onClick={() =>
                  patchBook((previous) => ({
                    ...previous,
                    entries: previous.entries.map((entry) => ({
                      ...entry,
                      keys: bulkKeywords
                        .split(",")
                        .map((key) => key.trim())
                        .filter(Boolean),
                    })),
                    updatedAt: Date.now(),
                  }))
                }
              >
                <Search className="h-4 w-4" /> Set keys on all
              </Button>
              <div className="flex gap-2">
                <Input
                  aria-label="Find text in entries"
                  value={replaceFrom}
                  onChange={(event) => setReplaceFrom(event.target.value)}
                  placeholder="Find"
                  className="bg-secondary"
                />
                <Input
                  aria-label="Replace with text"
                  value={replaceTo}
                  onChange={(event) => setReplaceTo(event.target.value)}
                  placeholder="Replace"
                  className="bg-secondary"
                />
                <Button variant="outline" onClick={replaceAll}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-foreground">Import / export</h3>
            <Textarea
              aria-label="Lorebook JSON to import"
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setPendingImport(null);
              }}
              placeholder="Paste SillyTavern World Info spec_version 2 or Agnaistic JSON"
              className="min-h-[100px] bg-secondary font-mono text-xs"
            />
            {pendingImport ? (
              <div
                className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2"
                role="region"
                aria-label="Import merge or replace"
              >
                <p className="text-sm text-foreground">
                  This lorebook already has entries. Merge keeps prior entries (default). Replace wipes them.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      applyImport("merge", pendingImport.entries, pendingImport.importedName, { normalizedFromSt: pendingImport.normalizedFromSt })
                    }
                  >
                    <Upload className="h-4 w-4" /> Merge import
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      applyImport("replace", pendingImport.entries, pendingImport.importedName, { normalizedFromSt: pendingImport.normalizedFromSt })
                    }
                  >
                    Replace all
                  </Button>
                  <Button variant="ghost" onClick={() => setPendingImport(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={beginImport}>
                  <Upload className="h-4 w-4" /> Import JSON
                </Button>
                <Button onClick={() => exportJson("sillytavern")}>
                  <Download className="h-4 w-4" /> SillyTavern v2
                </Button>
                <Button variant="outline" onClick={() => exportJson("agnaistic")}>
                  <FileJson className="h-4 w-4" /> Agnaistic
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Active budget: {totalTokens} tokens across {activeEntries.length} entries. Import defaults to merge when
              you already have content. This approximation uses 1.3 tokens per whitespace-delimited word.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LorebookBuilder;
