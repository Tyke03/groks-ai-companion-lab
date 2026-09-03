import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles, BookOpen, PenLine, Users, FileText, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { chatbots, categoryLabels } from "@/data/chatbots";
import { platformDocs } from "@/data/documentation";
import { blogPosts } from "@/data/blogPosts";
import { communityResources } from "@/data/communityResources";
import { isOrderedSubsequence } from "@/lib/search";
import { useNavigate } from "react-router-dom";

type Group = "platform" | "doc" | "blog" | "community";

interface SearchResult {
  id: string;
  group: Group;
  title: string;
  subtitle: string;
  icon: typeof Search;
  action: () => void;
}

const groupLabels: Record<Group, string> = {
  platform: "Platforms",
  doc: "Documentation",
  blog: "Blog",
  community: "Community",
};

const groupOrder: Group[] = ["platform", "doc", "blog", "community"];
const MAX_VISIBLE = 5;

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Controlled selection. cmdk's keyboard navigation (ArrowUp/ArrowDown/Enter)
  // drives this value through onValueChange; we reset it deterministically to
  // the first match whenever the query changes so selection never goes stale.
  const [value, setValue] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Reset state when the dialog is opened/closed so every open starts fresh.
  useEffect(() => {
    if (open) {
      setExpanded({});
    } else {
      setQuery("");
    }
  }, [open]);

  const allResults = useMemo<SearchResult[]>(() => {
    const list: SearchResult[] = [];
    for (const bot of chatbots) {
      list.push({
        id: `bot-${bot.slug}`,
        group: "platform",
        title: bot.name,
        subtitle: `${categoryLabels[bot.category]} · ${bot.model || bot.type}`,
        icon: Sparkles,
        action: () =>
          platformDocs[bot.slug]
            ? navigate(`/docs/${bot.slug}`)
            : navigate("/", { state: { q: bot.name } }),
      });
    }
    for (const doc of Object.values(platformDocs)) {
      list.push({
        id: `doc-${doc.slug}`,
        group: "doc",
        title: `${doc.name} Guide`,
        subtitle: doc.overview.slice(0, 90),
        icon: BookOpen,
        action: () => navigate(`/docs/${doc.slug}`),
      });
    }
    for (const post of blogPosts) {
      list.push({
        id: `blog-${post.id}`,
        group: "blog",
        title: post.title,
        subtitle: `${post.category} · ${post.readTime} · ${post.excerpt.slice(0, 80)}`,
        icon: PenLine,
        action: () => navigate(`/blog/${post.id}`),
      });
    }
    for (const resource of communityResources) {
      list.push({
        id: `community-${resource.name}`,
        group: "community",
        title: resource.name,
        subtitle: resource.description.slice(0, 90),
        icon: resource.type === "discord" ? Users : FileText,
        action: () => window.open(resource.url, "_blank", "noopener,noreferrer"),
      });
    }
    return list;
  }, [navigate]);

  const filteredGroups = useMemo(() => {
    const groups: Record<Group, SearchResult[]> = {
      platform: [],
      doc: [],
      blog: [],
      community: [],
    };
    for (const result of allResults) {
      // Platform suggestions match on the platform NAME only, so that a query
      // like "ai" cannot match via a subtitle (e.g. SillyTavern's "OpenAI"
      // backend mention). Other groups match on title + subtitle.
      const haystack = result.group === "platform" ? result.title : `${result.title} ${result.subtitle}`;
      if (isOrderedSubsequence(query, haystack)) {
        groups[result.group].push(result);
      }
    }
    // Deterministic A-Z ordering for platforms (cmdk filtering is disabled, so
    // nothing else can re-rank these).
    groups.platform.sort((a, b) => a.title.localeCompare(b.title));
    return groups;
  }, [allResults, query]);

  const hasResults = groupOrder.some((group) => filteredGroups[group].length > 0);

  // First visible result for the current query (selection resets to this).
  const firstResultId = useMemo(() => {
    for (const group of groupOrder) {
      if (filteredGroups[group].length > 0) return filteredGroups[group][0].id;
    }
    return "";
  }, [filteredGroups]);

  const prevQueryRef = useRef(query);
  useEffect(() => {
    if (prevQueryRef.current !== query) {
      prevQueryRef.current = query;
      setValue(firstResultId);
    }
  }, [query, firstResultId]);

  const renderGroup = (group: Group) => {
    const items = filteredGroups[group];
    if (items.length === 0) return null;
    const visible = expanded[group] ? items : items.slice(0, MAX_VISIBLE);
    return (
      <CommandGroup key={group} heading={groupLabels[group]}>
        {visible.map((result) => {
          const Icon = result.icon;
          return (
            <CommandItem
              key={result.id}
              value={result.id}
              onSelect={() => {
                setOpen(false);
                result.action();
              }}
            >
              <Icon className="mr-2 h-4 w-4 text-primary" />
              <div className="min-w-0">
                <span className="block truncate">{result.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
              </div>
            </CommandItem>
          );
        })}
        {items.length > MAX_VISIBLE && (
          <CommandItem
            value={`toggle-${group}`}
            onSelect={() => setExpanded((prev) => ({ ...prev, [group]: !prev[group] }))}
          >
            {expanded[group] ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
            <span className="text-xs">
              {expanded[group] ? "Show fewer" : `Show all ${items.length} ${groupLabels[group].toLowerCase()}`}
            </span>
          </CommandItem>
        )}
      </CommandGroup>
    );
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
        aria-label="Search the site"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">Search...</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">⌘K</kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        shouldFilter={false}
        value={value}
        onValueChange={setValue}
        title="Search platforms, docs, articles, and communities"
      >
        <CommandInput
          placeholder="Search platforms, docs, articles, communities..."
          aria-label="Search platforms, docs, articles, and communities"
          onValueChange={setQuery}
        />
        <CommandList>
          {!hasResults && <CommandEmpty>No results found for “{query}”.</CommandEmpty>}
          {groupOrder.map(renderGroup)}
        </CommandList>
      </CommandDialog>
    </>
  );
};
