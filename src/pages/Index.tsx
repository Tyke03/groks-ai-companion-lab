import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Scale, X, SlidersHorizontal, Wrench, Compass } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  chatbots, categoryLabels,
} from "@/data/chatbots";
import { ChatbotCard } from "@/components/ChatbotCard";
import { Layout } from "@/components/Layout";
import { useDebounce } from "@/hooks/useDebounce";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const directoryRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [content, setContent] = useState<ContentFilter>("all");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [access, setAccess] = useState<AccessTag[]>([]);
  const [cards, setCards] = useState<CardSpec[]>([]);
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 250);

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

  const scrollToDirectory = () => {
    directoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openComparePage = () => {
    if (compareBots.length >= 2) {
      navigate(`/compare?platforms=${compareBots.map((bot) => bot.slug).join(",")}`);
    } else {
      navigate("/compare");
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>AI Companion Hub — Verification-first directory and local workbench</title>
        <meta
          name="description"
          content="Compare AI companion platforms with dated evidence, then build cards and prompts on your machine. We do not host models, run live chat, or take payments."
        />
      </Helmet>

      <header className="relative border-b border-border section-band overflow-hidden">
        <div className="lab-grid absolute inset-0 opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="container relative mx-auto px-4 py-10 sm:py-14">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Evidence lab · Local workbench
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-5xl mb-4 max-w-3xl">
            AI Companion Hub
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg leading-relaxed">
            Verification-first directory and local workbench: compare companion platforms with dated
            evidence, then build cards and prompts on your machine — we do not run the models.
          </p>

          <div className="mt-5 flex flex-wrap gap-2" role="list" aria-label="Product honesty">
            <span className="honesty-pill" role="listitem">No hosted models</span>
            <span className="honesty-pill" role="listitem">No live chat</span>
            <span className="honesty-pill" role="listitem">No payments</span>
            <span className="honesty-pill" role="listitem">{chatbots.length} platforms cataloged</span>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={scrollToDirectory} className="gap-2">
              <Compass className="h-4 w-4" />
              Browse platforms
            </Button>
            <Button size="lg" variant="outline" asChild className="gap-2">
              <Link to="/compare">
                <Scale className="h-4 w-4" />
                Compare platforms
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="gap-2">
              <Link to="/tools">
                <Wrench className="h-4 w-4" />
                Open workbench
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div
        id="directory"
        ref={directoryRef}
        className="sticky top-[57px] z-30 border-b border-border bg-background/80 backdrop-blur-xl"
      >
        <div className="container mx-auto flex flex-col gap-4 px-4 py-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">Discover platforms</h2>
              <p className="text-xs text-muted-foreground">
                Filter by category, features, access, and content level. Each card shows a last-verified date.
              </p>
            </div>
          </div>

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

          <div className="hidden md:block">
            <DirectoryFilters {...filterPanelProps} />
          </div>

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
            <Button
              size="sm"
              onClick={openComparePage}
              disabled={compareBots.length < 2}
            >
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
    </Layout>
  );
};

export default Index;
