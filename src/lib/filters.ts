import {
  type Category,
  type Chatbot,
  type AccessTag,
  type CardSpec,
  getPlatformFilterFacts,
} from "@/data/chatbots";

// Re-export the trait types so consumers can import everything from one place.
export type { AccessTag, CardSpec };

/**
 * Directory filter selector layer — the single source of truth for how the
 * directory grid, the result count, and the per-category counts are computed.
 *
 * Trait matching reads ONLY structured fields (capability booleans on the
 * record and the reviewed `platformFilterFacts` map). It never regex/scans
 * free-text, so unknown/omitted traits never falsely match.
 */

export const CATEGORIES: Category[] = [
  "local",
  "hosted",
  "libraries",
  "companion",
  "providers",
  "hybrid",
];

export type CategoryFilter = Category | "all";
export type ContentFilter = "all" | "sfw" | "unfiltered" | "toggleable";

export type FeatureKey = "image" | "voice" | "group" | "multimodal";

export interface DirectoryFilterState {
  search: string;
  category: CategoryFilter;
  content: ContentFilter;
  features: FeatureKey[];
  access: AccessTag[];
  cards: CardSpec[];
}

export const EMPTY_FILTER_STATE: DirectoryFilterState = {
  search: "",
  category: "all",
  content: "all",
  features: [],
  access: [],
  cards: [],
};

export const featureKeys: FeatureKey[] = ["image", "voice", "group", "multimodal"];
export const accessKeys: AccessTag[] = ["foss", "free", "byok", "paid"];
export const cardKeys: CardSpec[] = ["v2", "v3", "json", "native"];

export const contentKeys: ContentFilter[] = ["all", "sfw", "unfiltered", "toggleable"];

export const featureLabels: Record<FeatureKey, string> = {
  image: "Image",
  voice: "Voice/TTS",
  group: "Group chat",
  multimodal: "Multi-modal",
};

export const accessLabels: Record<AccessTag, string> = {
  foss: "FOSS",
  free: "Free tier",
  byok: "BYOK / API",
  paid: "Paid",
};

export const cardLabels: Record<CardSpec, string> = {
  v2: "V2",
  v3: "V3",
  json: "JSON",
  native: "Platform native",
};

export const contentLabels: Record<ContentFilter, string> = {
  all: "All levels",
  sfw: "SFW only",
  unfiltered: "Unfiltered / NSFW",
  toggleable: "Toggleable",
};

export function isFilterActive(state: DirectoryFilterState): boolean {
  return (
    state.category !== "all" ||
    state.content !== "all" ||
    state.features.length > 0 ||
    state.access.length > 0 ||
    state.cards.length > 0
  );
}

export function matchesSearch(bot: Chatbot, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystacks = [
    bot.name,
    bot.description,
    bot.type,
    bot.nsfwPolicy,
    bot.category,
    bot.model ?? "",
    bot.pricing ?? "",
    bot.contextWindow ?? "",
    bot.memory ?? "",
    bot.knownIssues ?? "",
  ];
  return haystacks.some((h) => h.toLowerCase().includes(q));
}

export function matchesContent(bot: Chatbot, content: ContentFilter): boolean {
  switch (content) {
    case "all":
      return true;
    case "sfw":
      return bot.contentLevel === 1;
    case "unfiltered":
      return bot.contentLevel >= 3;
    case "toggleable":
      return getPlatformFilterFacts(bot).hasSfwNsfwToggle === true;
  }
}

export function matchesFeature(bot: Chatbot, feature: FeatureKey): boolean {
  const facts = getPlatformFilterFacts(bot);
  switch (feature) {
    case "image":
      return bot.hasImageGen === true;
    case "voice":
      return bot.hasVoice === true;
    case "group":
      return facts.hasGroupChat === true;
    case "multimodal":
      return facts.hasMultimodal === true;
  }
}

export function matchesAccess(bot: Chatbot, tag: AccessTag): boolean {
  return (getPlatformFilterFacts(bot).accessTags ?? []).includes(tag);
}

export function matchesCard(bot: Chatbot, spec: CardSpec): boolean {
  return (getPlatformFilterFacts(bot).cardSpecs ?? []).includes(spec);
}

export function filterChatbots(bots: Chatbot[], state: DirectoryFilterState): Chatbot[] {
  return bots.filter((bot) => {
    if (!matchesSearch(bot, state.search)) return false;
    if (state.category !== "all" && bot.category !== state.category) return false;
    if (!matchesContent(bot, state.content)) return false;
    if (!state.features.every((f) => matchesFeature(bot, f))) return false;
    if (!state.access.every((a) => matchesAccess(bot, a))) return false;
    if (!state.cards.every((c) => matchesCard(bot, c))) return false;
    return true;
  });
}

/**
 * Per-category counts computed against every active constraint EXCEPT the
 * category itself, so the chips reflect how many results remain per category
 * after the other filters (search/content/features/access/cards) are applied.
 */
export function countByCategory(
  bots: Chatbot[],
  state: DirectoryFilterState,
): Record<CategoryFilter, number> {
  const matching = filterChatbots(bots, { ...state, category: "all" });
  const counts = { all: matching.length } as Record<CategoryFilter, number>;
  for (const category of CATEGORIES) {
    counts[category] = matching.filter((b) => b.category === category).length;
  }
  return counts;
}
