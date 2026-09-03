import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import {
  getPrimaryCompatibility,
  normalizeLocalTemplate,
  normalizeLocalTemplates,
  promptTemplates,
  type PromptTemplate,
} from "@/data/promptTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Heart, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const customKey = "ai-companion-hub-custom-prompts";
const favoriteKey = "ai-companion-hub-favorite-prompts";

const labelFor = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const readLocalTemplates = (): PromptTemplate[] => {
  try {
    return normalizeLocalTemplates(JSON.parse(localStorage.getItem(customKey) || "[]"));
  } catch {
    return [];
  }
};

const Prompts = () => {
  const [custom, setCustom] = useState<PromptTemplate[]>(readLocalTemplates);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(favoriteKey) || "[]"); } catch { return []; }
  });
  const [query, setQuery] = useState("");
  const [showCreator, setShowCreator] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [template, setTemplate] = useState("");
  const { toast } = useToast();
  const all = useMemo(() => [...promptTemplates, ...custom], [custom]);
  const filtered = useMemo(
    () => all.filter((item) => `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase())),
    [all, query],
  );

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem(favoriteKey, JSON.stringify(next));
  };

  const copyRaw = async (item: PromptTemplate) => {
    await navigator.clipboard.writeText(item.template);
    toast({ title: "Copied", description: `${item.name} copied as a raw template. Fill author fields in the Prompt Builder.` });
  };

  const saveCustom = () => {
    if (!name.trim() || !template.trim()) return;
    const item = normalizeLocalTemplate({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      category: tags.trim() || "Custom",
      description: `User-created local template${tags.trim() ? ` · ${tags.trim()}` : ""}`,
      template,
      variables: [],
    });
    if (!item) return;
    const next = [...custom, item];
    setCustom(next);
    localStorage.setItem(customKey, JSON.stringify(next));
    setName("");
    setTags("");
    setTemplate("");
    setShowCreator(false);
    toast({ title: "Template saved", description: "Saved locally as Universal · Plain text." });
  };

  return (
    <Layout>
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-8 sm:py-12">
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-5xl glow-text">Prompt Library</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">Verified platform guidance plus Universal plain-text styles, scenarios, and genre starters. Custom templates stay local to your browser.</p>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap gap-3">
          <Input aria-label="Search prompt templates" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search prompts, styles, genres..." className="max-w-md bg-secondary" />
          <Button onClick={() => setShowCreator((value) => !value)}><Plus className="h-4 w-4" /> Create Custom Template</Button>
        </div>

        {showCreator && (
          <div className="mb-8 max-w-2xl space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex justify-between"><h2 className="font-semibold">Create Custom Template</h2><button type="button" onClick={() => setShowCreator(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
            <Input aria-label="Custom template name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Template name" className="bg-secondary" />
            <Input aria-label="Custom template tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Custom tags (comma-separated)" className="bg-secondary" />
            <Textarea aria-label="Custom template text" value={template} onChange={(event) => setTemplate(event.target.value)} placeholder="Write plain text. Use [Character Name] for author fields; custom templates are always Universal." className="min-h-[140px] bg-secondary font-mono text-sm" />
            <Button onClick={saveCustom} disabled={!name.trim() || !template.trim()}>Save locally</Button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const compatibility = getPrimaryCompatibility(item);
            const isVerified = compatibility.lane === "verified-platform";
            return (
              <article key={item.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs text-primary">{item.category}</span>
                    <h2 className="mt-1 font-display text-lg font-semibold text-foreground">{item.name}</h2>
                  </div>
                  <button type="button" onClick={() => toggleFavorite(item.id)} aria-label={favorites.includes(item.id) ? `Remove ${item.name} favorite` : `Favorite ${item.name}`} className={favorites.includes(item.id) ? "text-primary" : "text-muted-foreground"}>
                    {favorites.includes(item.id) ? <Heart className="h-4 w-4 fill-current" /> : <Heart className="h-4 w-4" />}
                  </button>
                </div>

                <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                  <div><dt className="text-muted-foreground">Target</dt><dd className="font-medium text-foreground">{compatibility.target}</dd></div>
                  <div><dt className="text-muted-foreground">Artifact</dt><dd className="font-medium text-foreground">{labelFor(compatibility.artifactType)}</dd></div>
                  <div><dt className="text-muted-foreground">Format</dt><dd className="font-medium text-foreground">{compatibility.format === "plain-text" ? "Plain text" : "Platform-native"}</dd></div>
                  <div><dt className="text-muted-foreground">Confidence</dt><dd className="font-medium text-foreground">{item.userCreated ? "User-created" : isVerified ? "Verified" : "Universal"}</dd></div>
                  <div className="col-span-2"><dt className="text-muted-foreground">Runtime macros</dt><dd className="font-mono text-foreground">{compatibility.runtimeMacros.length > 0 ? compatibility.runtimeMacros.join(", ") : "None"}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">{compatibility.pasteInstructions}</p>
                {compatibility.caveats?.map((caveat) => <p key={caveat} className="mt-2 text-xs text-amber-300/90">Note: {caveat}</p>)}
                <pre tabIndex={0} className="my-4 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/60 p-3 text-xs text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.template}</pre>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => copyRaw(item)}><Copy className="h-3.5 w-3.5" /> Copy raw template</Button>
                  <Button size="sm" variant="outline" asChild><Link to={`/tools?tab=prompts&template=${encodeURIComponent(item.id)}`}>Open in Builder</Link></Button>
                </div>
              </article>
            );
          })}
        </div>
        {filtered.length === 0 && <p className="py-16 text-center text-muted-foreground">No prompts match this search.</p>}
      </main>
    </Layout>
  );
};

export default Prompts;
