import { useState, useMemo, useEffect, type ReactNode } from "react";
import { Search, Scale, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  chatbots, categoryLabels, contentLevelLabels,
  type Chatbot,
} from "@/data/chatbots";
import { ChatbotCard } from "@/components/ChatbotCard";
import { Layout } from "@/components/Layout";
import { useDebounce } from "@/hooks/useDebounce";
import { Helmet } from "react-helmet-async";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DirectoryFilters } from "@/components/directory/DirectoryFilters";
import {
  filterChatbots,
  countByCategory,
  isFilterActive,
  contentLabels,
  featureLabels,
  accessLabels,
  cardLabels,
  type DirectoryFilterState,
  type CategoryFilter,
  type ContentFilter,
  type FeatureKey,
  type AccessTag,
  type CardSpec,
} from "@/lib/filters";

const MAX_COMPARE = 5;

const apiAccessLabel: Record<string, string> = {
  none: "None",
  open: "Open key",
  subscription: "Paid plan",
};

interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [content, setContent] = useState<ContentFilter>("all");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [access, setAccess] = useState<AccessTag[]>([]);
  const [cards, setCards] = useState<CardSpec[]>([]);
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 250);

  // Support global search navigation: /  with state { q }
  useEffect(() => {
    const q = (location.state as { q?: string } | null)?.q;
    if (q) {
      setSearch(q);
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  const toggleCompare = (slug: string) => {
    setCompareSet((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else if (next.size < MAX_COMPARE) next.add(slug);
      return next;
    });
  };

  const toggleFeature = (feature: FeatureKey) =>
    setFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature],
    );
  const toggleAccess = (tag: AccessTag) =>
    setAccess((prev) => (prev.includes(tag) ? prev.filter((a) => a !== tag) : [...prev, tag]));
  const toggleCard = (spec: CardSpec) =>
    setCards((prev) => (prev.includes(spec) ? prev.filter((c) => c !== spec) : [...prev, spec]));

  const filterState = useMemo<DirectoryFilterState>(
    () => ({ search: debouncedSearch, category, content, features, access, cards }),
    [debouncedSearch, category, content, features, access, cards],
  );

  const filtered = useMemo(() => filterChatbots(chatbots, filterState), [filterState]);
  const categoryCounts = useMemo(() => countByCategory(chatbots, filterState), [filterState]);
  const filterActive = isFilterActive(filterState);

  const activeFilterCount =
    (category !== "all" ? 1 : 0) +
    (content !== "all" ? 1 : 0) +
    features.length +
    access.length +
    cards.length;

  const clearAll = () => {
    setCategory("all");
    setContent("all");
    setFeatures([]);
    setAccess([]);
    setCards([]);
  };

  const chips = useMemo<ActiveChip[]>(() => {
    const list: ActiveChip[] = [];
    if (category !== "all") {
      list.push({ key: "category", label: categoryLabels[category], onRemove: () => setCategory("all") });
    }
    if (content !== "all") {
      list.push({ key: "content", label: contentLabels[content], onRemove: () => setContent("all") });
    }
    for (const f of features) {
      list.push({ key: `feature-${f}`, label: featureLabels[f], onRemove: () => toggleFeature(f) });
    }
    for (const a of access) {
      list.push({ key: `access-${a}`, label: accessLabels[a], onRemove: () => toggleAccess(a) });
    }
    for (const c of cards) {
      list.push({ key: `card-${c}`, label: cardLabels[c], onRemove: () => toggleCard(c) });
    }
    return list;
  }, [category, content, features, access, cards]);

  const compareBots = useMemo(
    () => chatbots.filter((b) => compareSet.has(b.slug)),
    [compareSet],
  );

  const comparisonRows: { label: string; value: (b: Chatbot) => ReactNode }[] = [
    { label: "Category", value: (b) => categoryLabels[b.category] },
    { label: "Content level", value: (b) => `Level ${b.contentLevel} — ${contentLevelLabels[b.contentLevel]}` },
    { label: "Model", value: (b) => b.model || "—" },
    { label: "Context window", value: (b) => b.contextWindow || "—" },
    { label: "Pricing", value: (b) => b.pricing || "—" },
    { label: "API access", value: (b) => (b.apiAccess ? apiAccessLabel[b.apiAccess] : "—") },
    { label: "Memory", value: (b) => b.memory || "—" },
    { label: "Explicit chat", value: (b) => (b.hasExplicitChat ? "Yes" : "No") },
    { label: "Image gen", value: (b) => (b.hasImageGen ? "Yes" : "No") },
    { label: "Voice", value: (b) => (b.hasVoice ? "Yes" : "No") },
    { label: "Card format", value: (b) => b.cardFormat || "—" },
    { label: "Known issues", value: (b) => b.knownIssues || "—" },
    { label: "Last verified", value: (b) => b.lastVerified },
    { label: "Access type", value: (b) => b.type },
  ];

  const filterPanelProps = {
    category,
    onCategoryChange: setCategory,
    content,
    onContentChange: setContent,
    features,
    onToggleFeature: toggleFeature,
    access,
    onToggleAccess: toggleAccess,
    cards,
    onToggleCard: toggleCard,
    categoryCounts,
  };

  return (
    <Layout>
      <Helmet>
        <title>AI Companion Hub — AI Platforms Compared</title>
        <meta
          name="description"
          content="Browse and compare AI companion platforms, local frontends, model providers, and creator tools. Filtered by category, access type, features, card specs, and content level."
        />
      </Helmet>

      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-8 sm:py-12">
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-5xl glow-text mb-3">
            AI Companion Hub
          </h1>
          <span className="sr-only">NSFW AI Chatbot Directory</span>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Discover {chatbots.length}+ AI companion platforms — from local privacy-first
            tools to web-based companions. Curated, categorized, and uncensored.
          </p>
        </div>
      </header>

      {/* Filters */}
      <div className="sticky top-[57px] z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex flex-col gap-4 px-4 py-4">
          {/* Search + result count + clear-all */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search platforms, models, pricing..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-secondary border-border"
                aria-label="Search platforms"
              />
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {filtered.length} of {chatbots.length} platforms
              </p>
              <Button variant="outline" size="sm" onClick={clearAll} disabled={!filterActive}>
                <X className="h-4 w-4" />
                Clear all
              </Button>
            </div>
          </div>

          {/* Mobile filter trigger (below md) */}
          <div className="md:hidden">
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>

          {/* Desktop filter panel (md and up) */}
          <div className="hidden md:block">
            <DirectoryFilters {...filterPanelProps} />
          </div>

          {/* Active filter chips */}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Active:</span>
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label} filter`}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors hover:border-primary"
                >
                  {chip.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-8">
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-lg text-muted-foreground">
              No platforms match your search and filters.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={clearAll}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((bot) => (
              <ChatbotCard
                key={bot.name}
                bot={bot}
                compareSelected={compareSet.has(bot.slug)}
                onCompareToggle={toggleCompare}
              />
            ))}
          </div>
        )}
        <p className="mt-8 text-xs text-muted-foreground">
          Content levels (1–5) are based on platform claims and community reports, not first-party
          audits — policies change, so always verify before relying on them. Each card shows a
          last-verified date.
        </p>
      </main>

      {/* Mobile filter sheet */}
      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Refine the directory by category, content, features, access, and card specs.
            </SheetDescription>
          </SheetHeader>
          <DirectoryFilters {...filterPanelProps} />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear all
            </Button>
            <Button size="sm" onClick={() => setMobileFiltersOpen(false)}>
              Show {filtered.length} results
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Compare bar */}
      {compareBots.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur">
            <span className="text-sm text-muted-foreground">
              {compareBots.length} selected
              {compareBots.length >= MAX_COMPARE && " (max)"}
            </span>
            <div className="flex -space-x-2">
              {compareBots.slice(0, 5).map((b) => (
                <span
                  key={b.slug}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-foreground"
                  title={b.name}
                >
                  {b.name.slice(0, 2).toUpperCase()}
                </span>
              ))}
            </div>
            <Button size="sm" onClick={() => { setCompareOpen(true); navigate(`/compare?platforms=${compareBots.map((bot) => bot.slug).join(",")}`); }} disabled={compareBots.length < 2}>
              <Scale className="h-4 w-4" />
              Compare ({compareBots.length})
            </Button>
            <button
              onClick={() => setCompareSet(new Set())}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear comparison"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Compare drawer */}
      <Sheet open={compareOpen} onOpenChange={setCompareOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Compare Platforms</SheetTitle>
            <SheetDescription>
              Side-by-side attributes for {compareBots.length} selected platforms.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 bg-background px-3 py-2 text-left font-medium text-muted-foreground w-32">Attribute</th>
                  {compareBots.map((b) => (
                    <th key={b.slug} className="px-3 py-2 text-left font-display font-semibold text-foreground">
                      <div className="flex items-center justify-between gap-2">
                        {b.name}
                        <button
                          onClick={() => toggleCompare(b.slug)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={`Remove ${b.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/60">
                    <td className="sticky left-0 bg-background px-3 py-2 text-xs font-medium text-muted-foreground align-top">{row.label}</td>
                    {compareBots.map((b) => (
                      <td key={b.slug} className="px-3 py-2 text-xs text-foreground/90 align-top">
                        {row.value(b)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setCompareSet(new Set())}>
              <X className="h-4 w-4" />
              Clear all
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Layout>
  );
};

export default Index;
