import {
  type Chatbot,
  categoryColors,
  categoryLabels,
  contentLevelColors,
  contentLevelLabels,
} from "@/data/chatbots";
import {
  ExternalLink, BookOpen, Globe, Monitor, HardDrive, Smartphone, Code,
  Image, Mic, MessageSquare, Database, ShieldCheck, CalendarDays, Plus, Check, Star,
} from "lucide-react";
import { Link } from "react-router-dom";
import { platformDocs } from "@/data/documentation";
import { useState } from "react";

const accessTypeIcons: Record<string, { icon: typeof Globe; label: string }> = {
  Web: { icon: Globe, label: "Web" },
  Desktop: { icon: Monitor, label: "Desktop" },
  Local: { icon: HardDrive, label: "Local" },
  Mobile: { icon: Smartphone, label: "Mobile" },
  API: { icon: Code, label: "API" },
};

function getAccessTypes(type: string): string[] {
  const t = type.toLowerCase();
  const types: string[] = [];
  if (t.includes("web") || t.includes("character library") || t.includes("story") || t.includes("image") || t.includes("telegram") || t.includes("aggregator")) types.push("Web");
  if (t.includes("desktop")) types.push("Desktop");
  if (t.includes("local")) types.push("Local");
  if (t.includes("mobile")) types.push("Mobile");
  if (t.includes("api") || t.includes("open source")) types.push("API");
  if (types.length === 0) types.push("Web");
  return types;
}

const apiAccessLabel: Record<string, string> = {
  none: "No API",
  open: "API: open key",
  subscription: "API: paid plan",
};

export const ChatbotCard = ({
  bot,
  compareSelected,
  onCompareToggle,
}: {
  bot: Chatbot;
  compareSelected?: boolean;
  onCompareToggle?: (slug: string) => void;
}) => {
  // A badge is only meaningful when both the record and the internal guide exist.
  const hasDocs = bot.docsAvailable && !!platformDocs[bot.slug];
  const [favorite, setFavorite] = useState(() => localStorage.getItem(`favorite_platform_${bot.slug}`) === "1");
  const toggleFavorite = () => { const next = !favorite; setFavorite(next); localStorage.setItem(`favorite_platform_${bot.slug}`, next ? "1" : "0"); };
  const accessTypes = getAccessTypes(bot.type);

  return (
    <div className="card-glow group flex flex-col rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
          {bot.name}
        </h2>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={toggleFavorite} title={favorite ? "Remove bookmark" : "Bookmark platform"} aria-label={favorite ? `Remove ${bot.name} bookmark` : `Bookmark ${bot.name}`} className={`flex h-7 w-7 items-center justify-center rounded-md border ${favorite ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-primary"}`}><Star className={`h-3.5 w-3.5 ${favorite ? "fill-current" : ""}`} /></button>
          {onCompareToggle && (
            <button
              onClick={() => onCompareToggle(bot.slug)}
              title={compareSelected ? "Remove from comparison" : "Add to comparison"}
              aria-label={compareSelected ? `Remove ${bot.name} from comparison` : `Add ${bot.name} to comparison`}
              className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                compareSelected
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:text-primary hover:border-primary/40"
              }`}
            >
              {compareSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          )}
          <a
            href={bot.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
            title={`Visit ${bot.name}`}
            aria-label={`Visit ${bot.name}`}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" focusable="false" />
          </a>
        </div>
      </div>

      {/* Badges row */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${categoryColors[bot.category]}`}>
          {categoryLabels[bot.category]}
        </span>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${contentLevelColors[bot.contentLevel]}`}
          title={`Content level ${bot.contentLevel}/5 — ${contentLevelLabels[bot.contentLevel]} (based on platform claims)`}
        >
          {contentLevelLabels[bot.contentLevel]}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground" title="Last verified">
          <CalendarDays className="h-3 w-3" />
          {bot.lastVerified}
        </span>
      </div>

      {/* Capability icons */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {accessTypes.map((at) => {
          const config = accessTypeIcons[at];
          if (!config) return null;
          const Icon = config.icon;
          return (
            <span key={at} className="flex items-center gap-1 text-xs text-muted-foreground" title={config.label}>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{config.label}</span>
            </span>
          );
        })}
        {bot.hasExplicitChat && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Explicit chat supported">
            <MessageSquare className="h-3.5 w-3.5 text-primary/80" />
            <span className="hidden sm:inline">Explicit chat</span>
          </span>
        )}
        {bot.hasImageGen && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Image generation">
            <Image className="h-3.5 w-3.5 text-primary/80" />
            <span className="hidden sm:inline">Image gen</span>
          </span>
        )}
        {bot.hasVoice && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Voice support">
            <Mic className="h-3.5 w-3.5 text-primary/80" />
            <span className="hidden sm:inline">Voice</span>
          </span>
        )}
        {bot.apiAccess && bot.apiAccess !== "none" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title={apiAccessLabel[bot.apiAccess]}>
            <Database className="h-3.5 w-3.5 text-primary/80" />
            <span className="hidden sm:inline">{apiAccessLabel[bot.apiAccess]}</span>
          </span>
        )}
      </div>

      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
        {bot.description}
      </p>

      {/* Quick facts */}
      <div className="mb-3 space-y-1.5 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
        {bot.model && (
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Model</span>
            <span className="text-foreground/90">{bot.model}</span>
          </div>
        )}
        {bot.contextWindow && (
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Context</span>
            <span className="text-foreground/90">{bot.contextWindow}</span>
          </div>
        )}
        {bot.pricing && (
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Pricing</span>
            <span className="text-foreground/90">{bot.pricing}</span>
          </div>
        )}
        {bot.memory && (
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Memory</span>
            <span className="text-foreground/90">{bot.memory}</span>
          </div>
        )}
        {bot.knownIssues && (
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Known issues</span>
            <span className="text-destructive">{bot.knownIssues}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3 mt-auto">
        <span className="text-xs text-muted-foreground flex items-center gap-1" title="Character card format">
          <ShieldCheck className="h-3 w-3" />
          {bot.cardFormat || bot.type}
        </span>
        <div className="flex items-center gap-3">
          {hasDocs && (
            <Link
              to={`/docs/${bot.slug}`}
              className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <BookOpen className="h-3 w-3" />
              Docs
            </Link>
          )}
          <a
            href={bot.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            Visit →
          </a>
        </div>
      </div>
    </div>
  );
};
