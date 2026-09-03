import { useState, useMemo, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { chatbots, categoryLabels, contentLevelLabels, type Chatbot } from "@/data/chatbots";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, X, Search, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";

/* ── Criterion groups ────────────────────────────────────────────────────── */

interface CriterionGroup {
  label: string;
  rows: { label: string; value: (bot: Chatbot) => string }[];
}

const criterionGroups: CriterionGroup[] = [
  {
    label: "Getting started",
    rows: [
      { label: "Hosting type", value: (bot) => `${categoryLabels[bot.category]} · ${bot.type}` },
      { label: "Content level", value: (bot) => `${contentLevelLabels[bot.contentLevel]} (level ${bot.contentLevel}/5)` },
      { label: "Pricing model", value: (bot) => bot.pricing || "Not disclosed" },
    ],
  },
  {
    label: "Chat and character experience",
    rows: [
      { label: "Context length limits", value: (bot) => bot.contextWindow || "Not disclosed" },
      { label: "Memory / lorebook", value: (bot) => bot.memory || "Not disclosed" },
      { label: "Card import / export", value: (bot) => bot.cardFormat || "Platform native" },
      { label: "Image generation", value: (bot) => bot.hasImageGen ? "Supported" : "Not listed" },
      { label: "Voice / TTS", value: (bot) => bot.hasVoice ? "Supported" : "Not listed" },
    ],
  },
  {
    label: "Privacy, access, and pricing",
    rows: [
      {
        label: "Privacy / logging policy",
        value: (bot) =>
          bot.category === "local"
            ? "Local-first; verify backend logging"
            : bot.category === "providers"
              ? "Provider-dependent; review provider policy"
              : "Hosted; review platform policy",
      },
      { label: "Supported APIs", value: (bot) =>
        bot.apiAccess === "open" ? "Open / BYOK" : bot.apiAccess === "subscription" ? "Subscription / platform API" : "No public API"
      },
    ],
  },
  {
    label: "Maintenance",
    rows: [
      { label: "Last verified", value: (bot) => bot.lastVerified },
    ],
  },
];

/* ── Unique categories for filter dropdown ───────────────────────────────── */

const categoryOptions = Array.from(new Set(chatbots.map((b) => b.category)));

/* ── Component ───────────────────────────────────────────────────────────── */

const Compare = () => {
  const [params, setParams] = useSearchParams();
  const initialSlugs = (params.get("platforms") || "").split(",").filter(Boolean).slice(0, 5);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(() => new Set(initialSlugs));
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  /* ── Filtered platform list ──────────────────────────────────────────── */

  const filteredPlatforms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chatbots.filter((bot) => {
      if (category && bot.category !== category) return false;
      if (q && !bot.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, category]);

  const selected = useMemo(
    () => chatbots.filter((bot) => selectedSlugs.has(bot.slug)),
    [selectedSlugs],
  );

  /* ── Selection handlers ──────────────────────────────────────────────── */

  const MAX = 5;

  const toggleSlug = useCallback((slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else if (next.size < MAX) next.add(slug);
      return next;
    });
  }, []);

  const removeSlug = useCallback((slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      next.delete(slug);
      return next;
    });
  }, []);

  const hasFilters = search.trim() !== "" || category !== "";
  const clearFilters = useCallback(() => { setSearch(""); setCategory(""); }, []);

  /* ── URL sync ────────────────────────────────────────────────────────── */
  // Keep URL params in sync for shareability
  useMemo(() => {
    const slugStr = [...selectedSlugs].join(",");
    const next = new URLSearchParams(params);
    if (slugStr) next.set("platforms", slugStr);
    else next.delete("platforms");
    setParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlugs]);

  /* ── Helper: is boolean-like row? ────────────────────────────────────── */
  const isBooleanRow = (label: string) =>
    label === "Image generation" || label === "Voice / TTS";

  return (
    <Layout>
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-8 sm:py-12">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Directory
          </Link>
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-5xl glow-text">
            Compare Platforms
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Search and select platforms, then view a side-by-side matrix of features, pricing, and compatibility.
          </p>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-8">
        {/* ── Platform selector ──────────────────────────────────────── */}
        <section aria-label="Platform selector" className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">
            Select platforms to compare
          </h2>

          {/* Search + category filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="compare-search"
                type="search"
                placeholder="Search platforms…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                aria-label="Search platforms by name"
              />
            </div>
            <div>
              <label htmlFor="compare-category" className="sr-only">Filter by category</label>
              <select
                id="compare-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All categories</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{categoryLabels[c] || c}</option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-9 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Clear all filters"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Result count */}
          <p className="text-xs text-muted-foreground mb-3" aria-live="polite" aria-atomic="true">
            {filteredPlatforms.length === chatbots.length
              ? `Showing all ${chatbots.length} platforms.`
              : `Showing ${filteredPlatforms.length} of ${chatbots.length} platforms.`}
          </p>

          {/* Platform grid */}
          {filteredPlatforms.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No platforms match your search.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2" role="group" aria-label="Available platforms">
              {filteredPlatforms.map((bot) => {
                const isSelected = selectedSlugs.has(bot.slug);
                return (
                  <button
                    key={bot.slug}
                    type="button"
                    onClick={() => toggleSlug(bot.slug)}
                    disabled={!isSelected && selectedSlugs.size >= MAX}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? "Remove" : "Add"} ${bot.name} ${isSelected ? "from" : "to"} comparison${!isSelected && selectedSlugs.size >= MAX ? " (maximum reached)" : ""}`}
                    className={[
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-foreground/80 hover:border-primary/50 hover:bg-accent",
                      !isSelected && selectedSlugs.size >= MAX ? "opacity-50 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <span className={[
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    ].join(" ")}>
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{bot.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {selected.map((bot) => (
                <span
                  key={bot.slug}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-foreground"
                >
                  {bot.name}
                  <button
                    type="button"
                    onClick={() => removeSlug(bot.slug)}
                    className="rounded-full p-0.5 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${bot.name} from comparison`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── Comparison matrix ──────────────────────────────────────── */}
        {selected.length >= 2 ? (
          <section aria-label="Comparison matrix" className="mt-6">
            {/* How to read disclosure */}
            <details className="rounded-xl border border-border bg-card mb-4">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                How to read this comparison
              </summary>
              <div className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground space-y-1.5">
                <p>This comparison is a <strong className="text-foreground/80">guide, not a guarantee</strong>. Platform features, pricing, and policies can change at any time.</p>
                <p>Values reflect the site's currently documented comparison data. <strong className="text-foreground/80">"Not disclosed" or "Not listed" does not necessarily mean a feature is absent</strong> — it means we do not have verified documentation for that attribute.</p>
                <p>Always verify important requirements (pricing, API access, content policies, data handling) directly with the platform before relying on them.</p>
              </div>
            </details>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-sm" role="table">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 w-48 bg-secondary/80 px-4 py-4 text-left text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      Attribute
                    </th>
                    {selected.map((bot) => (
                      <th
                        key={bot.slug}
                        scope="col"
                        className="px-4 py-4 text-left font-display text-base text-foreground"
                      >
                        {bot.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {criterionGroups.map((group) => (
                    <CriterionGroupSection
                      key={group.label}
                      group={group}
                      selected={selected}
                      isBooleanRow={isBooleanRow}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Data reflects site documentation as of the "Last verified" date shown above. Always confirm directly with the platform.
            </p>
          </section>
        ) : selected.length === 1 ? (
          <div className="mt-6 rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Select at least <strong className="text-foreground/80">one more platform</strong> to see the comparison matrix.
            </p>
          </div>
        ) : null}
      </main>
    </Layout>
  );
};

/* ── Criterion group section ─────────────────────────────────────────────── */

function CriterionGroupSection({
  group,
  selected,
  isBooleanRow,
}: {
  group: CriterionGroup;
  selected: Chatbot[];
  isBooleanRow: (label: string) => boolean;
}) {
  return (
    <>
      <tr className="bg-secondary/30">
        <th
          colSpan={selected.length + 1}
          scope="colgroup"
          className="sticky left-0 z-10 bg-secondary/60 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground/70"
        >
          {group.label}
        </th>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label} className="border-b border-border/70 last:border-0">
          <th
            scope="row"
            className="sticky left-0 z-10 bg-background px-4 py-3 text-left text-xs font-medium text-muted-foreground"
          >
            {row.label}
          </th>
          {selected.map((bot) => (
            <td
              key={bot.slug}
              className="px-4 py-3 align-top text-xs leading-relaxed text-foreground/90"
            >
              {row.value(bot)}
              {isBooleanRow(row.label) && (
                row.value(bot) === "Supported"
                  ? <Check className="ml-1 inline h-3.5 w-3.5 text-green-400" />
                  : <X className="ml-1 inline h-3.5 w-3.5 text-muted-foreground" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default Compare;
