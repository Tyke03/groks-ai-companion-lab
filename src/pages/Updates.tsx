import { Layout } from "@/components/Layout";
import { CalendarDays, Bell } from "lucide-react";

const updates = [
  { date: "2026-08-19", tag: "Hub", title: "AI Companion Hub launches expanded comparison filters", body: "Directory filters now combine category, content level, capabilities, access model, and character-card compatibility." },
  { date: "2026-08-12", tag: "Models", title: "Local inference continues to move toward larger context", body: "LM Studio, Ollama, and Open WebUI make it easier to run OpenAI-compatible local endpoints for creator workflows." },
  { date: "2026-08-05", tag: "Cards", title: "Character Card V3 asset declarations added", body: "The card builder now exposes placeholders for expression sprites, alternate outfits, and greeting audio." },
  { date: "2026-07-28", tag: "Docs", title: "Platform guides receive verification dates", body: "Internal guides show their last-reviewed month so setup instructions can be checked against ecosystem changes." },
];

const Updates = () => (
  <Layout>
    <header className="border-b border-border">
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center gap-3 mb-2"><Bell className="h-6 w-6 text-primary" /><span className="text-xs font-medium uppercase tracking-widest text-primary">Changelog</span></div>
        <h1 className="font-display text-3xl font-bold text-foreground sm:text-5xl glow-text">Platform Updates</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">A small, transparent feed for model releases, directory changes, guide reviews, and service notices.</p>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="container mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-4">
        {updates.map((update) => (
          <article key={`${update.date}-${update.title}`} className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> {update.date}<span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">{update.tag}</span></div>
            <h2 className="mt-3 font-display text-lg font-semibold text-foreground">{update.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{update.body}</p>
          </article>
        ))}
      </div>
    </main>
  </Layout>
);

export default Updates;
