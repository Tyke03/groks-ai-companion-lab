import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { EvidenceMetadataDisplay } from "@/components/EvidenceMetadataDisplay";
import { platformDocs } from "@/data/documentation";
import { chatbots, categoryLabels, contentLevelLabels } from "@/data/chatbots";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Github, ChevronRight, CalendarDays, Copy, Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTION_LABELS: { id: string; label: string }[] = [
  { id: "quick-facts", label: "Quick Facts" },
  { id: "setup", label: "Setup Guide" },
  { id: "features", label: "Features" },
  { id: "api", label: "API Configuration" },
  { id: "character-format", label: "Character Card Format" },
  { id: "nsfw", label: "NSFW Settings" },
  { id: "policy-history", label: "Policy History" },
  { id: "community", label: "Community Resources" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

const CopySnippet = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary" aria-label="Copy snippet">{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied ? "Copied" : "Copy"}</button>;
};

const PlatformDocs = () => {
  const { slug } = useParams<{ slug: string }>();
  const doc = slug ? platformDocs[slug] : undefined;
  const bot = chatbots.find((b) => b.slug === slug);
  const [activeSection, setActiveSection] = useState<string>("");
  const [favorite, setFavorite] = useState(() => slug ? localStorage.getItem(`favorite_doc_${slug}`) === "1" : false);
  const toggleFavorite = () => { if (!slug) return; const next = !favorite; setFavorite(next); localStorage.setItem(`favorite_doc_${slug}`, next ? "1" : "0"); };

  useEffect(() => {
    if (!doc) return;
    const sections = SECTION_LABELS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => !!el,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [doc]);

  if (!doc || !bot) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-lg text-muted-foreground mb-4">Documentation not found.</p>
          <Link to="/docs" className="text-primary hover:underline">
            ← Back to Documentation Hub
          </Link>
        </div>
      </Layout>
    );
  }

  const sectionIds = SECTION_LABELS.map((s) => s.id).filter((id) => {
    if (id === "quick-facts") return true;
    if (id === "setup") return !!doc.setupSteps;
    if (id === "features") return !!doc.features;
    if (id === "api") return !!doc.apiConfig;
    if (id === "character-format") return !!doc.characterFormat;
    if (id === "nsfw") return !!doc.nsfwSettings;
    if (id === "policy-history") return !!doc.policyHistory;
    if (id === "community") return !!doc.community;
    if (id === "troubleshooting") return !!doc.troubleshooting;
    return false;
  });

  const quickFacts: { label: string; value: string }[] = [
    { label: "Category", value: categoryLabels[bot.category] },
    { label: "Content level", value: `Level ${bot.contentLevel}/5 — ${contentLevelLabels[bot.contentLevel]}` },
    ...(bot.model ? [{ label: "Model", value: bot.model }] : []),
    ...(bot.pricing ? [{ label: "Pricing", value: bot.pricing }] : []),
    ...(bot.contextWindow ? [{ label: "Context window", value: bot.contextWindow }] : []),
    ...(bot.apiAccess
      ? [{ label: "API access", value: bot.apiAccess === "none" ? "None" : bot.apiAccess === "open" ? "Open key" : "Paid plan required" }]
      : []),
    ...(bot.memory ? [{ label: "Memory", value: bot.memory }] : []),
    ...(bot.cardFormat ? [{ label: "Card format", value: bot.cardFormat }] : []),
    { label: "Last verified", value: bot.lastVerified },
  ];

  return (
    <Layout>
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-8">
          <Link to="/docs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Documentation Hub
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl glow-text mb-2">
              {doc.name}
            </h1>
            {doc.lastReviewed && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground" title="Guide last reviewed">
                <CalendarDays className="h-3 w-3" />
                Guide reviewed {doc.lastReviewed}
              </span>
            )}
          </div>
          <p className="text-muted-foreground max-w-3xl">{doc.overview}</p>
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <button onClick={toggleFavorite} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${favorite ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}><Star className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} /> {favorite ? "Saved" : "Save guide"}</button>
            <a
              href={bot.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" focusable="false" />
              Visit {doc.name}
            </a>
            {doc.officialDocs && (
              <a href={doc.officialDocs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Official Docs
              </a>
            )}
            {doc.github && (
              <a href={doc.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <Github className="h-4 w-4" aria-hidden="true" focusable="false" />
                GitHub
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* In-page TOC */}
          <nav className="hidden lg:block w-56 shrink-0" aria-label="On this page">
            <div className="sticky top-24 space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">On this page</p>
              {sectionIds.map((id) => {
                const label = SECTION_LABELS.find((s) => s.id === id)?.label ?? id;
                return (
                  <a
                    key={id}
                    href={`#${id}`}
                    className={cn(
                      "block rounded-md px-3 py-1.5 text-sm transition-colors border-l-2",
                      activeSection === id
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                    )}
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          </nav>

          <div className="max-w-3xl flex-1 space-y-10 min-w-0">
            {/* Quick Facts */}
            <section id="quick-facts">
              <h2 className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                <ChevronRight className="h-5 w-5 text-primary" />
                Quick Facts
              </h2>
              <div className="rounded-lg border border-border bg-secondary/40 p-4">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {quickFacts.map((f) => (
                    <div key={f.label} className="flex gap-2 text-sm">
                      <dt className="w-28 shrink-0 text-muted-foreground/70">{f.label}</dt>
                      <dd className="text-foreground/90">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {bot.evidenceMetadata && (
                <div className="mt-3">
                  <EvidenceMetadataDisplay metadata={bot.evidenceMetadata} />
                </div>
              )}
            </section>

            {/* Setup Steps */}
            {doc.setupSteps && (
              <section id="setup">
                <h2 className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ChevronRight className="h-5 w-5 text-primary" />
                  Setup Guide
                </h2>
                <ol className="space-y-3 ml-4">
                  {doc.setupSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">{i + 1}</span>
                      <span className="flex-1 text-sm text-muted-foreground pt-0.5">{step}</span>
                      {/(git clone|npm |docker |https?:\/\/|--api|localhost)/i.test(step) && <CopySnippet text={step} />}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Features */}
            {doc.features && (
              <section id="features">
                <h2 className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ChevronRight className="h-5 w-5 text-primary" />
                  Features
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {doc.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-primary mt-1">•</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* API Configuration */}
            {doc.apiConfig && (
              <section id="api">
                <h2 className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ChevronRight className="h-5 w-5 text-primary" />
                  API Configuration
                </h2>
                <div className="space-y-3">
                  {doc.apiConfig.map((config, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-sm text-muted-foreground">
                      <span className="font-mono text-xs leading-relaxed">{config}</span><CopySnippet text={config} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Character Format */}
            {doc.characterFormat && (
              <section id="character-format">
                <h2 className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ChevronRight className="h-5 w-5 text-primary" />
                  Character Card Format
                </h2>
                <div className="rounded-lg border border-border bg-secondary/50 p-4 text-sm text-muted-foreground leading-relaxed">
                  {doc.characterFormat}
                </div>
              </section>
            )}

            {/* NSFW Settings */}
            {doc.nsfwSettings && (
              <section id="nsfw">
                <h2 className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ChevronRight className="h-5 w-5 text-primary" />
                  NSFW Settings
                </h2>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground leading-relaxed">
                  {doc.nsfwSettings}
                </div>
              </section>
            )}

            {/* Policy History */}
            {doc.policyHistory && (
              <section id="policy-history">
                <h2 className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ChevronRight className="h-5 w-5 text-primary" />
                  Policy History
                </h2>
                <div className="space-y-3">
                  {doc.policyHistory.map((item, i) => (
                    <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Community */}
            {doc.community && (
              <section id="community">
                <h2 className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ChevronRight className="h-5 w-5 text-primary" />
                  Community Resources
                </h2>
                <ul className="space-y-2">
                  {doc.community.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-primary mt-1">→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Troubleshooting */}
            {doc.troubleshooting && (
              <section id="troubleshooting">
                <h2 className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ChevronRight className="h-5 w-5 text-primary" />
                  Troubleshooting
                </h2>
                <div className="space-y-3">
                  {doc.troubleshooting.map((item, i) => (
                    <div key={i} className="rounded-lg border border-border bg-secondary/50 p-3 text-sm text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </Layout>
  );
};

export default PlatformDocs;
