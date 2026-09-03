import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Users, ExternalLink, Copy, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { communityResources as resources, communityTypeLabels as typeLabels, type CommunityResource } from "@/data/communityResources";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

interface CommunityCard { id: string; title: string; description: string; tags: string[]; content_rating: string; card_json: unknown; created_at: string; }

const Community = () => {
  const [subName, setSubName] = useState("");
  const [subUrl, setSubUrl] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [subNotes, setSubNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [galleryCards, setGalleryCards] = useState<CommunityCard[]>([]);
  const [galleryQuery, setGalleryQuery] = useState("");
  const [galleryRating, setGalleryRating] = useState<"all" | "SFW" | "NSFW">("all");
  const [galleryStatus, setGalleryStatus] = useState<"loading" | "ready" | "error" | "unconfigured">("loading");

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setGalleryStatus("unconfigured");
      setGalleryCards([]);
      return;
    }
    setGalleryStatus("loading");
    supabase.from("community_cards").select("id,title,description,tags,content_rating,card_json,created_at").order("created_at", { ascending: false }).limit(50)
      .then(
        ({ data, error }) => {
          if (error) { setGalleryCards([]); setGalleryStatus("error"); return; }
          setGalleryCards((data || []) as CommunityCard[]);
          setGalleryStatus("ready");
        },
        () => { setGalleryCards([]); setGalleryStatus("error"); },
      );
  }, []);

  const grouped = {
    reddit: resources.filter((r) => r.type === "reddit"),
    discord: resources.filter((r) => r.type === "discord"),
    site: resources.filter((r) => r.type === "site"),
    forum: resources.filter((r) => r.type === "forum"),
    wiki: resources.filter((r) => r.type === "wiki"),
  };


  const canSubmit = subName.trim() && subUrl.trim();

  const handleCopySummary = () => {
    const text = `Platform: ${subName}\nURL: ${subUrl}\nCategory: ${subCategory || "Not sure"}\nNotes: ${subNotes}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderCard = (r: CommunityResource) => (
    <a
      key={r.name}
      href={r.url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors group"
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium rounded border px-2 py-0.5 ${typeLabels[r.type].color}`}>
          {typeLabels[r.type].label}
        </span>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" focusable="false" />
      </div>
      <h3 className="font-semibold text-foreground mb-1">{r.name}</h3>
      <p className="text-sm text-muted-foreground">{r.description}</p>
    </a>
  );

  const visibleCards = galleryCards.filter((card) => (galleryRating === "all" || card.content_rating === galleryRating) && `${card.title} ${card.description} ${(card.tags || []).join(" ")}`.toLowerCase().includes(galleryQuery.toLowerCase()));

  return (
    <Layout>
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-2">
            <Users className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-primary">Community</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-5xl glow-text mb-3">
            Community & Resources
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Reddit threads, Discord servers, character libraries, and community hubs for the NSFW AI chatbot ecosystem.
          </p>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-8 space-y-10">
        {/* Reddit */}
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mb-4">Reddit Communities</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.reddit.map(renderCard)}
          </div>
        </section>

        {/* Discord */}
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mb-4">Discord Servers</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.discord.map(renderCard)}
          </div>
        </section>

        {/* Sites & Libraries */}
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mb-4">Character Libraries & Tools</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.site.map(renderCard)}
          </div>
        </section>

        {/* Forums */}
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mb-4">Forums & Boards</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.forum.map(renderCard)}
          </div>
        </section>

        {/* Documentation */}
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mb-4">Official Documentation</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.wiki.map(renderCard)}
          </div>
        </section>

        {/* Community card showcase */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-display text-xl font-semibold text-foreground mb-2">Community Card Showcase</h2>
          <p className="text-sm text-muted-foreground mb-4">A read-only preview of cards shared to the public gallery. Publishing cards from the Card Builder isn't enabled yet, so this list is usually empty.</p>
          <div className="flex flex-wrap gap-2 mb-4"><div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={galleryQuery} onChange={(event) => setGalleryQuery(event.target.value)} placeholder="Search cards or tags" className="pl-9 bg-secondary" /></div>{(["all", "SFW", "NSFW"] as const).map((rating) => <button key={rating} type="button" aria-pressed={galleryRating === rating} onClick={() => setGalleryRating(rating)} className={`rounded-md border px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${galleryRating === rating ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>{rating === "all" ? "All ratings" : rating}</button>)}</div>
          {galleryStatus === "loading" && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Loading shared cards…</p>}
          {galleryStatus === "unconfigured" && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Community publishing isn't configured yet, so the gallery is read-only and empty. Check back later.</p>}
          {galleryStatus === "error" && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Couldn't load shared cards right now. Please try again later.</p>}
          {galleryStatus === "ready" && (visibleCards.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleCards.map((card) => <article key={card.id} className="rounded-lg border border-border bg-secondary/30 p-4"><div className="flex justify-between gap-2"><h3 className="font-semibold text-foreground">{card.title}</h3><span className="text-xs text-muted-foreground">{card.content_rating}</span></div><p className="mt-1 text-sm text-muted-foreground line-clamp-3">{card.description}</p><div className="mt-2 flex flex-wrap gap-1">{(card.tags || []).map((tag) => <span key={tag} className="rounded bg-background px-2 py-0.5 text-[11px] text-muted-foreground">#{tag}</span>)}</div><a href="/tools" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">Open Card Builder</a></article>)}</div> : <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No cards have been shared yet. Community publishing is coming soon.</p>)}
        </section>

        {/* Submit a platform */}
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="font-display text-xl font-semibold text-foreground mb-2">
            Submit a Platform
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
            Know a platform that's missing from the directory? Fill this out, then copy the summary and share it in the community Discord. Direct submissions aren't open yet.
          </p>
          <div className="space-y-4 max-w-2xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="submission-platform-name" className="text-sm font-medium text-foreground mb-1 block">Platform name *</label>
                <Input
                  id="submission-platform-name"
                  placeholder="Example AI"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              <div>
                <label htmlFor="submission-platform-url" className="text-sm font-medium text-foreground mb-1 block">URL *</label>
                <Input
                  id="submission-platform-url"
                  placeholder="https://example.ai"
                  value={subUrl}
                  onChange={(e) => setSubUrl(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
            </div>
            <div>
              <label htmlFor="submission-category" className="text-sm font-medium text-foreground mb-1 block">Best-fit category</label>
              <Select value={subCategory} onValueChange={setSubCategory}>
                <SelectTrigger id="submission-category" className="bg-secondary border-border">
                  <SelectValue placeholder="Select a category..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local Frontend</SelectItem>
                  <SelectItem value="hosted">Hosted RP Platform</SelectItem>
                  <SelectItem value="libraries">Character Library</SelectItem>
                  <SelectItem value="companion">Companion App</SelectItem>
                  <SelectItem value="providers">Model Provider</SelectItem>
                  <SelectItem value="hybrid">Image + Chat Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="submission-notes" className="text-sm font-medium text-foreground mb-1 block">Notes (model, pricing, why it belongs)</label>
              <Textarea
                id="submission-notes"
                placeholder="What model does it run? Is there an API? What makes it worth listing?"
                value={subNotes}
                onChange={(e) => setSubNotes(e.target.value)}
                className="min-h-[100px] bg-secondary border-border text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleCopySummary} disabled={!canSubmit}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy Summary"}
              </Button>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
                Submissions are not open yet — copy the summary and share it in the community Discord.
              </span>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
};

export default Community;
