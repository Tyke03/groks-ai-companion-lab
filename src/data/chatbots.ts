export type Category =
  | "local"
  | "hosted"
  | "libraries"
  | "companion"
  | "providers"
  | "hybrid";

/** Structured content level: 1 = SFW, 2 = Light NSFW, 3 = Moderate, 4 = Explicit, 5 = Fully uncensored */
export type ContentLevel = 1 | 2 | 3 | 4 | 5;

/** Whether the platform exposes an API you can plug into SillyTavern/RisuAI */
export type ApiAccess = "none" | "open" | "subscription";

/** Access/pricing filter trait (see platformFilterFacts below). */
export type AccessTag = "foss" | "free" | "byok" | "paid";

/** Character-card spec filter trait (see platformFilterFacts below). */
export type CardSpec = "v2" | "v3" | "json" | "native";

/** Optional evidence metadata for future editorial review. */
export interface EvidenceMetadata {
  /** ISO date string, e.g. "2026-08" */
  lastVerified?: string;
  /** Absolute HTTPS source URL */
  sourceUrl?: string;
  /** Review status */
  reviewStatus?: "documented" | "needs-review" | "unverified";
}

export interface Chatbot {
  name: string;
  slug: string;
  type: string;
  nsfwPolicy: string;
  /** Structured content level (drives badge color + filtering) */
  contentLevel: ContentLevel;
  hasExplicitChat?: boolean;
  hasImageGen?: boolean;
  hasVoice?: boolean;
  description: string;
  category: Category;
  url: string;
  docsAvailable: boolean;
  /** LLM backend / model family */
  model?: string;
  /** Pricing: free tier / paid tiers */
  pricing?: string;
  /** Context window, e.g. "8K", "128K", "Not disclosed" */
  contextWindow?: string;
  /** API access: none / open (anyone can get a key) / subscription (paid plan required) */
  apiAccess?: ApiAccess;
  /** Memory system note */
  memory?: string;
  /** Known issues / negatives */
  knownIssues?: string;
  /** Character card format support */
  cardFormat?: string;
  /** Last verification date, "YYYY-MM" */
  lastVerified: string;
  /** Optional evidence metadata for editorial review */
  evidenceMetadata?: EvidenceMetadata;
}

export const chatbots: Chatbot[] = [
  // ============ Local Frontends ============
  {
    name: "SillyTavern", slug: "sillytavern", type: "Local UI + Cloud", nsfwPolicy: "Full uncensored", contentLevel: 5,
    hasExplicitChat: true, hasVoice: true,
    description: "Extensive local frontend with multi-API support, character cards, lorebooks, and expression images.",
    category: "local", url: "https://sillytavern.app", docsAvailable: true,
    model: "Bring-your-own (OpenAI, Claude, local, etc.)", pricing: "Free (open source)", contextWindow: "Depends on backend",
    apiAccess: "open", memory: "Lorebooks, summaries, author's notes, chat history", knownIssues: "Requires setup; no built-in model",
    cardFormat: "V1/V2/V3 PNG + JSON", lastVerified: "2026-08",
  },
  {
    name: "TavernAI", slug: "tavernai", type: "Local UI", nsfwPolicy: "Uncensored", contentLevel: 5,
    hasExplicitChat: true,
    description: "Original local chat UI that inspired SillyTavern. Multi-API backend support.",
    category: "local", url: "https://github.com/TavernAI/TavernAI", docsAvailable: true,
    model: "Bring-your-own", pricing: "Free (open source)", contextWindow: "Depends on backend",
    apiAccess: "open", memory: "Lorebooks (basic)", knownIssues: "Less maintained than SillyTavern",
    cardFormat: "V1/V2 PNG + JSON", lastVerified: "2026-08",
  },
  {
    name: "RisuAI", slug: "risuai", type: "Web/Desktop/Mobile", nsfwPolicy: "Uncensored", contentLevel: 5,
    hasExplicitChat: true,
    description: "Multi-API support with emotion images, group chats, regex scripting, and themes.",
    category: "local", url: "https://risuai.net", docsAvailable: true,
    model: "Bring-your-own (OpenAI, Claude, local)", pricing: "Free (open source)", contextWindow: "Depends on backend",
    apiAccess: "open", memory: "Lorebooks, memory, group chat state", knownIssues: "Smaller ecosystem than SillyTavern",
    cardFormat: "V1/V2 PNG + JSON", lastVerified: "2026-08",
  },
  {
    name: "Agnaistic", slug: "agnaistic", type: "Open source", nsfwPolicy: "Uncensored", contentLevel: 5,
    hasExplicitChat: true,
    description: "Self-hostable, multi-user platform with memory books and persona formats.",
    category: "local", url: "https://agnai.chat", docsAvailable: true,
    model: "Bring-your-own", pricing: "Free / self-host", contextWindow: "Depends on backend",
    apiAccess: "open", memory: "Memory books, personas (W++/SBF)", knownIssues: "Self-hosting complexity",
    cardFormat: "W++/SBF/Boostyle + JSON", lastVerified: "2026-08",
  },
  {
    name: "Hammer AI", slug: "hammer-ai", type: "Desktop app", nsfwPolicy: "Full uncensored", contentLevel: 5,
    hasExplicitChat: true,
    description: "100% free, no login required. Local-first with GPU acceleration and full privacy.",
    category: "local", url: "https://www.hammerai.com", docsAvailable: true,
    model: "Local models (BYO)", pricing: "Free", contextWindow: "Depends on model",
    apiAccess: "open", memory: "Local context only", knownIssues: "Requires capable hardware",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "text-generation-webui (Oobabooga)", slug: "oobabooga", type: "Local UI", nsfwPolicy: "Uncensored", contentLevel: 5,
    hasExplicitChat: true,
    description: "Popular local web UI for running open-weight models — the standard Oobabooga backend for SillyTavern.",
    category: "local", url: "https://github.com/oobabooga/text-generation-webui", docsAvailable: true,
    model: "Any local model (Llama, Mistral, etc.)", pricing: "Free (open source)", contextWindow: "Depends on model/VRAM",
    apiAccess: "open", memory: "Chat history + extensions", knownIssues: "Requires GPU/VRAM; setup complexity",
    cardFormat: "V1/V2-compatible", lastVerified: "2026-08",
  },
  {
    name: "KoboldAI", slug: "koboldai", type: "Local UI", nsfwPolicy: "Uncensored", contentLevel: 5,
    hasExplicitChat: true,
    description: "Local AI backend with world info and API mode — a classic SillyTavern backend, plus the KoboldAI Horde for free crowdsourced compute.",
    category: "local", url: "https://github.com/KoboldAI/KoboldAI-Client", docsAvailable: true,
    model: "Local models + KoboldAI Horde", pricing: "Free (open source)", contextWindow: "Depends on model",
    apiAccess: "open", memory: "World info, memory", knownIssues: "Requires setup; older UI",
    cardFormat: "V1/V2-compatible", lastVerified: "2026-08",
  },

  // ============ Hosted RP Platforms ============
  {
    name: "Janitor AI", slug: "janitor-ai", type: "Web platform", nsfwPolicy: "NSFW allowed", contentLevel: 3,
    hasExplicitChat: true,
    description: "Popular web-based AI chatbot platform with character creation and community library.",
    category: "hosted", url: "https://janitorai.com", docsAvailable: true,
    model: "Proprietary + BYO API keys", pricing: "Free tier + premium", contextWindow: "~8K (varies)",
    apiAccess: "subscription", memory: "Basic chat memory", knownIssues: "Free-tier queues; occasional API instability",
    cardFormat: "JSON export (SillyTavern-compatible)", lastVerified: "2026-08",
  },
  {
    name: "CrushOn.AI", slug: "crushon-ai", type: "Web platform", nsfwPolicy: "Uncensored", contentLevel: 5,
    hasExplicitChat: true,
    description: "Unfiltered AI chat with community-driven characters and API access.",
    category: "hosted", url: "https://crushon.ai", docsAvailable: true,
    model: "Proprietary + community models", pricing: "Free tier + paid", contextWindow: "~8K",
    apiAccess: "open", memory: "Basic", knownIssues: "Free-tier queues",
    cardFormat: "Platform-native + import", lastVerified: "2026-08",
  },
  {
    name: "Character.AI", slug: "character-ai", type: "Web/Mobile", nsfwPolicy: "Filtered (workarounds)", contentLevel: 1,
    hasVoice: true,
    description: "Largest AI chat platform. NSFW filtered but community workarounds documented.",
    category: "hosted", url: "https://character.ai", docsAvailable: true,
    model: "Proprietary (c.ai)", pricing: "Free + c.ai+", contextWindow: "~8K",
    apiAccess: "none", memory: "Basic", knownIssues: "Strict filtering; personality drift",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "NovelAI", slug: "novelai", type: "Story/Chat", nsfwPolicy: "Uncensored", contentLevel: 5,
    hasExplicitChat: true, hasImageGen: true,
    description: "AI storytelling and chat with custom models, image generation, and detailed writer tools.",
    category: "hosted", url: "https://novelai.net", docsAvailable: true,
    model: "Kayra, Clio (custom)", pricing: "Subscription $10–$25/mo", contextWindow: "2K–8K configurable",
    apiAccess: "subscription", memory: "Lorebook, memory, author's note, summarization", knownIssues: "No free tier",
    cardFormat: "V2-compatible JSON/PNG import", lastVerified: "2026-08",
  },
  {
    name: "Venus AI", slug: "venus-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true,
    description: "GPT-4/Claude wrapper with uncensored access and character library.",
    category: "hosted", url: "https://venus.chub.ai", docsAvailable: false,
    model: "GPT-4/Claude (BYO)", pricing: "Free with own key", contextWindow: "Depends on model",
    apiAccess: "open", memory: "Basic", knownIssues: "Requires your own API key",
    cardFormat: "V2-compatible", lastVerified: "2026-08",
  },
  {
    name: "Charstar AI", slug: "charstar-ai", type: "Web", nsfwPolicy: "NSFW allowed", contentLevel: 3,
    hasExplicitChat: true,
    description: "Character chat platform with mobile apps and community characters.",
    category: "hosted", url: "https://charstar.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Limited free messages",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Botify AI", slug: "botify-ai", type: "Web/Mobile", nsfwPolicy: "NSFW allowed", contentLevel: 3,
    hasExplicitChat: true, hasVoice: true,
    description: "Anime-focused AI chat with voice features and character customization.",
    category: "hosted", url: "https://botifyai.com", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Anime-focused content",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "SpicyChat AI", slug: "spicychat-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true,
    description: "Roleplay-focused chatbot platform with user-created scenarios and extensive documentation.",
    category: "hosted", url: "https://spicychat.ai", docsAvailable: true,
    model: "Proprietary", pricing: "Freemium", contextWindow: "~4K–8K",
    apiAccess: "none", memory: "Basic", knownIssues: "Free-tier limits",
    cardFormat: "Platform-native + export", lastVerified: "2026-08",
  },
  {
    name: "Erogen AI", slug: "erogen-ai", type: "Web", nsfwPolicy: "NSFW focused", contentLevel: 3,
    hasExplicitChat: true,
    description: "Customizable adult AI characters with rich personality systems.",
    category: "hosted", url: "https://erogen.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Less established platform",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "FapAI", slug: "fapai", type: "Web", nsfwPolicy: "Sexting focus", contentLevel: 4,
    hasExplicitChat: true,
    description: "Specialized adult chat platform focused on intimate conversations.",
    category: "hosted", url: "https://fapai.com", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Niche focus",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Soulkyn", slug: "soulkyn", type: "Web", nsfwPolicy: "NSFW", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true,
    description: "Chat, sexting, and image generation in one platform with comprehensive help guides.",
    category: "hosted", url: "https://soulkyn.com", docsAvailable: true,
    model: "Proprietary", pricing: "Credit-based freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Credit costs",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Alice AI", slug: "alice-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "Free unlimited image and voice chat capabilities.",
    category: "hosted", url: "https://aliceai.chat", docsAvailable: false,
    model: "Proprietary", pricing: "Free (ad-supported)", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Ad-supported free tier",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "FallFor.AI", slug: "fallfor-ai", type: "Web", nsfwPolicy: "Unrestricted", contentLevel: 5,
    hasExplicitChat: true,
    description: "Adult-themed AI conversations with no restrictions.",
    category: "hosted", url: "https://fallfor.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Lesser-known platform",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Fantasy AI", slug: "fantasy-ai", type: "Web", nsfwPolicy: "Interactive", contentLevel: 3,
    hasExplicitChat: true,
    description: "Customizable fantasy companions with rich scenarios.",
    category: "hosted", url: "https://fantasyai.app", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Scenario tracking", knownIssues: "Less documentation",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "LeeLee AI", slug: "leelee-ai", type: "Web", nsfwPolicy: "Personalized", contentLevel: 3,
    hasExplicitChat: true, hasVoice: true,
    description: "Quick response AI with personalized conversation styles.",
    category: "hosted", url: "https://leelee.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Personalized style learning", knownIssues: "Quick-response focus",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Kink AI", slug: "kink-ai", type: "Web", nsfwPolicy: "Fetish focus", contentLevel: 4,
    hasExplicitChat: true,
    description: "Fantasy exploration platform for specific interests.",
    category: "hosted", url: "https://kinkai.me", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Niche focus",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "JuicyChat.AI", slug: "juicychat-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 4,
    hasExplicitChat: true,
    description: "Unfiltered character library with community content.",
    category: "hosted", url: "https://juicychat.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Community content quality varies",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "PepHop AI", slug: "pephop-ai", type: "Web", nsfwPolicy: "SFW/NSFW", contentLevel: 2,
    hasExplicitChat: true,
    description: "4,000+ characters across both SFW and NSFW categories.",
    category: "hosted", url: "https://pephop.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "SFW/NSFW split library",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "RPRP.ai", slug: "rprp-ai", type: "Web", nsfwPolicy: "Roleplay writing", contentLevel: 2,
    description: "Story and roleplay focused writing platform.",
    category: "hosted", url: "https://rprp.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Story state", knownIssues: "Writing-focused, less explicit",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "MagicBuddy", slug: "magicbuddy", type: "Telegram", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true,
    description: "AI chatbot integrated directly into Telegram.",
    category: "hosted", url: "https://magicbuddy.chat", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Telegram-only",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Miku.gg", slug: "miku-gg", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true,
    description: "Growing community character platform with an interesting in-house model and active user base.",
    category: "hosted", url: "https://miku.gg", docsAvailable: false,
    model: "Proprietary + community", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Growing but smaller community",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "FlowGPT", slug: "flowgpt", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true,
    description: "Large community prompt and character platform with a broad library of user-created bots.",
    category: "hosted", url: "https://flowgpt.com", docsAvailable: false,
    model: "Proprietary + community prompts", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Prompt quality varies widely",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Joyland AI", slug: "joyland-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true,
    description: "Active roleplay platform with a decent character library and NSFW support.",
    category: "hosted", url: "https://joyland.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Less documentation",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },

  // ============ Character Libraries ============
  {
    name: "Chub.ai", slug: "chub-ai", type: "Character library", nsfwPolicy: "NSFW content", contentLevel: 3,
    description: "Massive character card library compatible with SillyTavern and other frontends.",
    category: "libraries", url: "https://chub.ai", docsAvailable: true,
    model: "N/A (library)", pricing: "Free (donations)", contextWindow: "N/A",
    apiAccess: "open", memory: "N/A", knownIssues: "Quality varies by creator",
    cardFormat: "V1/V2/V3 PNG + JSON", lastVerified: "2026-08",
  },

  // ============ Companion Apps ============
  {
    name: "Candy AI", slug: "candy-ai", type: "Web/Mobile", nsfwPolicy: "Full NSFW", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "AI girlfriend simulator with image generation and voice features.",
    category: "companion", url: "https://candy.ai", docsAvailable: false,
    model: "Proprietary (GPT-based)", pricing: "Freemium — ~$12.99/mo+", contextWindow: "~4K (not disclosed)",
    apiAccess: "none", memory: "Basic chat memory", knownIssues: "Paywalled features; mid-scene filtering reported",
    cardFormat: "Platform-native only", lastVerified: "2026-08",
  },
  {
    name: "GirlfriendGPT", slug: "girlfriendgpt", type: "Web platform", nsfwPolicy: "NSFW focused", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "AI companion platform with customizable personalities and scenarios.",
    category: "companion", url: "https://girlfriendgpt.com", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Inconsistent quality; subscription required for full features",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "DreamGF", slug: "dreamgf", type: "Web platform", nsfwPolicy: "Full NSFW", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "AI girlfriend generator with image creation and chat features.",
    category: "companion", url: "https://dreamgf.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium — paid tiers", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Image gen limits on free tier",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Kupid AI", slug: "kupid-ai", type: "Web", nsfwPolicy: "Romance/NSFW", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "Dating progression narrative with relationship-building mechanics.",
    category: "companion", url: "https://kupid.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Dating progression state", knownIssues: "Gated relationship stages",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Lovescape AI", slug: "lovescape-ai", type: "Web", nsfwPolicy: "Romance-first", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "Emotional arc storytelling with narrative progression before intimate content.",
    category: "companion", url: "https://lovescape.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Emotional arc tracking", knownIssues: "Slow-burn pacing",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Swipey AI", slug: "swipey-ai", type: "Web", nsfwPolicy: "Gamified dating", contentLevel: 2,
    hasExplicitChat: true, hasImageGen: true,
    description: "Tinder-style AI dating interface with swipe mechanics.",
    category: "companion", url: "https://swipey.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Gamified mechanics may feel shallow",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Secret Desires", slug: "secret-desires", type: "Web", nsfwPolicy: "NSFW", contentLevel: 4,
    hasExplicitChat: true,
    description: "AI girlfriend/boyfriend management with scenario creation.",
    category: "companion", url: "https://secretdesires.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Lesser-known platform",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "LustGF AI", slug: "lustgf-ai", type: "Web", nsfwPolicy: "Uncensored", contentLevel: 5,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "AI girlfriend simulation with full customization.",
    category: "companion", url: "https://lustgf.com", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Full customization paywalled",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "EDEN AI", slug: "eden-ai", type: "Web", nsfwPolicy: "Adult-oriented", contentLevel: 4,
    hasExplicitChat: true,
    description: "EVA AI companion platform with adult themes.",
    category: "companion", url: "https://edenai.chat", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "EVA AI rebrand confusion",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "CuteChat AI", slug: "cutechat-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true,
    description: "Visual customization focus for AI companion creation.",
    category: "companion", url: "https://cutechat.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Visual-first focus",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "HotChat AI", slug: "hotchat-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true,
    description: "Immersive AI companionship experiences.",
    category: "companion", url: "https://hotchat.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Generic companion features",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Sedux AI", slug: "sedux-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true,
    description: "Create, chat, and build connections with AI partners.",
    category: "companion", url: "https://sedux.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Less established",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Yume AI", slug: "yume-ai", type: "Web", nsfwPolicy: "Anime/NSFW", contentLevel: 3,
    hasExplicitChat: true,
    description: "Anime-focused emotional bonds with AI companions.",
    category: "companion", url: "https://yume.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Emotional bond tracking", knownIssues: "Anime-focused",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "GoLove AI", slug: "golove-ai", type: "Web", nsfwPolicy: "Free dating", contentLevel: 2,
    hasExplicitChat: true,
    description: "Free AI girlfriend dating simulation.",
    category: "companion", url: "https://golove.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Free", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Free-tier limits",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Couple.me", slug: "couple-me", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true,
    description: "Create AI girlfriends and boyfriends.",
    category: "companion", url: "https://couple.me", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Less known",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Kindroid", slug: "kindroid", type: "Web/Mobile", nsfwPolicy: "NSFW capable", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "Long-term companion app widely considered the best in the category, with the strongest memory system.",
    category: "companion", url: "https://kindroid.ai", docsAvailable: true,
    model: "Proprietary (GPT-based)", pricing: "Freemium — ~$15/mo+", contextWindow: "~4K base + long-term memory",
    apiAccess: "none", memory: "Best-in-class long-term memory (journals, shared memories, selfies)", knownIssues: "Cost for full features; occasional memory drift",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Nomi AI", slug: "nomi-ai", type: "Web/Mobile", nsfwPolicy: "NSFW capable", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "Companion app with strong long-term memory and support for multiple companions.",
    category: "companion", url: "https://www.nomi.ai", docsAvailable: true,
    model: "Proprietary", pricing: "Freemium — ~$10–20/mo", contextWindow: "~4K + memory",
    apiAccess: "none", memory: "Strong multi-Nomi long-term memory", knownIssues: "No API; slower updates",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Replika", slug: "replika", type: "Web/Mobile", nsfwPolicy: "Filtered (was uncensored)", contentLevel: 2,
    hasExplicitChat: true, hasVoice: true,
    description: "Largest companion app by user count. Its February 2023 ERP removal is the most important policy event in the category's history.",
    category: "companion", url: "https://replika.com", docsAvailable: true,
    model: "Proprietary (Replika LLM)", pricing: "Freemium — ~$20/mo", contextWindow: "~4K",
    apiAccess: "none", memory: "Session memory + diary", knownIssues: "Feb 2023 ERP removal; ongoing moderation changes",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },

  // ============ Model Providers ============
  {
    name: "PygmalionAI", slug: "pygmalionai", type: "Open source", nsfwPolicy: "Uncensored", contentLevel: 5,
    hasExplicitChat: true,
    description: "Open-source conversational AI models fine-tuned for roleplay and chat.",
    category: "providers", url: "https://pygmalion.chat", docsAvailable: true,
    model: "Pygmalion (open-source 7B/13B)", pricing: "Free (open weights)", contextWindow: "2K–8K depending on model",
    apiAccess: "open", memory: "None built-in", knownIssues: "Older models; requires local GPU or hosted backend",
    cardFormat: "N/A (model provider)", lastVerified: "2026-08",
  },
  {
    name: "OpenRouter", slug: "openrouter", type: "API aggregator", nsfwPolicy: "Model-dependent", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true,
    description: "The API aggregator every SillyTavern/RisuAI power user runs as their primary backend — 400+ models, one key.",
    category: "providers", url: "https://openrouter.ai", docsAvailable: true,
    model: "400+ models (Llama, Mistral, Claude, GPT, etc.)", pricing: "Pay-per-token (free tiers exist)", contextWindow: "Varies by model (up to 128K+)",
    apiAccess: "open", memory: "None (bring your own)", knownIssues: "Requires API key; costs add up",
    cardFormat: "N/A (API provider)", lastVerified: "2026-08",
  },

  // ============ Image + Chat Hybrids ============
  {
    name: "OurDream AI", slug: "ourdream-ai", type: "Web", nsfwPolicy: "Video + NSFW", contentLevel: 4,
    hasExplicitChat: true,
    description: "Unique video generation capability combined with NSFW chat.",
    category: "hybrid", url: "https://ourdream.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Video gen costs credits",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "SoulGen", slug: "soulgen", type: "Image/Chat", nsfwPolicy: "NSFW", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true,
    description: "AI image generation platform with chat features and creative tools.",
    category: "hybrid", url: "https://www.soulgen.net", docsAvailable: false,
    model: "Proprietary (image + chat)", pricing: "Freemium — credit-based", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Image credits run out fast",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Promptchan AI", slug: "promptchan-ai", type: "Image/Chat", nsfwPolicy: "NSFW", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true,
    description: "AI-powered image generation and chat platform with creative prompting tools.",
    category: "hybrid", url: "https://promptchan.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium — credit-based", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Heavy credit consumption",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Krush AI", slug: "krush-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true,
    description: "Character creation with image generation features.",
    category: "hybrid", url: "https://krush.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Image gen limits",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "eHentai AI", slug: "ehentai-ai", type: "Web", nsfwPolicy: "Hentai focus", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true,
    description: "Anime and hentai generation with chat features.",
    category: "hybrid", url: "https://ehentai.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Anime/hentai niche",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Nectar AI", slug: "nectar-ai", type: "Web", nsfwPolicy: "NSFW", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true,
    description: "Three-stage companion creation with feature guides and tutorials.",
    category: "hybrid", url: "https://nectar.ai", docsAvailable: true,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Three-stage creation", knownIssues: "Guides-heavy onboarding",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "aiAllure", slug: "aiallure", type: "Web", nsfwPolicy: "Image/Video", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true,
    description: "Visual-focused AI content generation.",
    category: "hybrid", url: "https://aiallure.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Basic", knownIssues: "Visual-first",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Muah AI", slug: "muah-ai", type: "Web", nsfwPolicy: "Voice + images", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true, hasVoice: true,
    description: "Multi-modal AI companion with voice and image features.",
    category: "hybrid", url: "https://muah.ai", docsAvailable: false,
    model: "Proprietary", pricing: "Freemium", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Multi-modal context", knownIssues: "Voice/image costs",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  // ============ Additional ecosystem platforms ============
  {
    name: "Backyard AI", slug: "backyard-ai", type: "Desktop/Web", nsfwPolicy: "Model-dependent", contentLevel: 4,
    hasExplicitChat: true,
    description: "Local-first character chat client with downloadable models, persistent character memory, and a creator-focused workflow.",
    category: "local", url: "https://backyard.ai", docsAvailable: false,
    model: "Local and hosted open models", pricing: "Free tier + paid plans", contextWindow: "Depends on model",
    apiAccess: "open", memory: "Character memory and chat history", knownIssues: "Model availability varies by hardware",
    cardFormat: "JSON import / platform-native", lastVerified: "2026-08",
  },
  {
    name: "LM Studio", slug: "lm-studio", type: "Desktop local server", nsfwPolicy: "Model-dependent", contentLevel: 4,
    hasExplicitChat: true,
    description: "Polished desktop app for downloading GGUF models and exposing an OpenAI-compatible local API to roleplay frontends.",
    category: "local", url: "https://lmstudio.ai", docsAvailable: false,
    model: "GGUF open-weight models", pricing: "Free for personal use", contextWindow: "Depends on model",
    apiAccess: "open", memory: "Provided by connected frontend", knownIssues: "Requires suitable RAM/VRAM",
    cardFormat: "N/A (backend)", lastVerified: "2026-08",
  },
  {
    name: "Ollama", slug: "ollama", type: "Local API runtime", nsfwPolicy: "Model-dependent", contentLevel: 4,
    hasExplicitChat: true,
    description: "Command-line-friendly local model runtime with a simple API, ideal as a private backend for SillyTavern and Open WebUI.",
    category: "providers", url: "https://ollama.com", docsAvailable: false,
    model: "Llama, Mistral, Gemma, and community models", pricing: "Free (open source runtime)", contextWindow: "Depends on model",
    apiAccess: "open", memory: "Provided by connected frontend", knownIssues: "Model downloads use substantial disk space",
    cardFormat: "N/A (backend)", lastVerified: "2026-08",
  },
  {
    name: "Open WebUI", slug: "open-webui", type: "Self-hosted web UI", nsfwPolicy: "Model-dependent", contentLevel: 4,
    hasExplicitChat: true, hasImageGen: true,
    description: "Self-hosted ChatGPT-style interface that connects to Ollama and OpenAI-compatible APIs, with model and workspace management.",
    category: "local", url: "https://openwebui.com", docsAvailable: false,
    model: "Ollama and OpenAI-compatible backends", pricing: "Free (open source)", contextWindow: "Depends on backend",
    apiAccess: "open", memory: "Chats, knowledge bases, and workspace memory", knownIssues: "Docker setup adds operational overhead",
    cardFormat: "JSON / platform-native", lastVerified: "2026-08",
  },
  {
    name: "Perchance", slug: "perchance", type: "Web creative platform", nsfwPolicy: "Community/model-dependent", contentLevel: 3,
    hasExplicitChat: true, hasImageGen: true,
    description: "Browser-based generator ecosystem with public AI character, image, and interactive story tools.",
    category: "hosted", url: "https://perchance.org", docsAvailable: false,
    model: "Platform/community models", pricing: "Free", contextWindow: "Not disclosed",
    apiAccess: "none", memory: "Generator-dependent", knownIssues: "Individual generators vary in quality and policy",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "Mistral Le Chat", slug: "mistral-le-chat", type: "Web/Mobile", nsfwPolicy: "Filtered/model policy", contentLevel: 1,
    hasVoice: true,
    description: "Mistral's hosted general-purpose assistant with large context, web search, and multimodal capabilities.",
    category: "hosted", url: "https://chat.mistral.ai", docsAvailable: false,
    model: "Mistral Large and current Mistral models", pricing: "Free tier + Pro", contextWindow: "Model-dependent",
    apiAccess: "subscription", memory: "Projects and conversation history", knownIssues: "General-purpose safety policy",
    cardFormat: "Platform-native", lastVerified: "2026-08",
  },
  {
    name: "TavernAI (legacy)", slug: "tavernai-legacy", type: "Local UI", nsfwPolicy: "Backend-dependent", contentLevel: 5,
    hasExplicitChat: true,
    description: "The original TavernAI project and legacy lineage; distinct from the actively developed SillyTavern fork.",
    category: "local", url: "https://github.com/TavernAI/TavernAI", docsAvailable: false,
    model: "Bring-your-own backend", pricing: "Free (open source)", contextWindow: "Depends on backend",
    apiAccess: "open", memory: "Basic chat history and world info", knownIssues: "Legacy project; use SillyTavern for active development",
    cardFormat: "V1/V2 PNG + JSON", lastVerified: "2026-08",
  },
];

/**
 * Structured filter facts — the single source of truth for the directory
 * filter selector.
 *
 * These are manually reviewed facts keyed by the same slug used in the
 * `chatbots` array (never a duplicate platform list). Rules applied:
 *
 * - `cardSpecs` is normalized from each platform's curated `cardFormat` string
 *   (e.g. "V1/V2/V3 PNG + JSON" -> ["v2", "v3", "json"]).
 * - `accessTags` is normalized from curated `pricing` + `apiAccess` (+ explicit
 *   BYO-key mentions). "Freemium" implies both `free` and `paid`.
 * - `hasGroupChat`, `hasMultimodal`, and `hasSfwNsfwToggle` are only set when
 *   there is explicit evidence (structured capability flags, or an explicit
 *   mention in the curated description/policy). They are OMITTED when unknown,
 *   and an omitted field never matches its claimed trait.
 *
 * Platforms with ambiguous traits are intentionally left unpopulated rather
 * than guessed (see docs/site-audit.md and the Batch 1A review report).
 */
export interface PlatformFilterFacts {
  hasGroupChat?: boolean;
  hasMultimodal?: boolean;
  hasSfwNsfwToggle?: boolean;
  accessTags?: AccessTag[];
  cardSpecs?: CardSpec[];
}

export const platformFilterFacts: Record<string, PlatformFilterFacts> = {
  // Local frontends
  sillytavern: { accessTags: ["foss", "free", "byok"], cardSpecs: ["v2", "v3", "json"] },
  tavernai: { accessTags: ["foss", "free", "byok"], cardSpecs: ["v2", "json"] },
  risuai: { hasGroupChat: true, accessTags: ["foss", "free", "byok"], cardSpecs: ["v2", "json"] },
  agnaistic: { accessTags: ["foss", "free", "byok"], cardSpecs: ["json"] },
  "hammer-ai": { accessTags: ["free", "byok"], cardSpecs: ["native"] },
  oobabooga: { accessTags: ["foss", "free", "byok"], cardSpecs: ["v2"] },
  koboldai: { accessTags: ["foss", "free", "byok"], cardSpecs: ["v2"] },

  // Hosted RP platforms
  "janitor-ai": { accessTags: ["free", "paid", "byok"], cardSpecs: ["json"] },
  "crushon-ai": { accessTags: ["free", "paid", "byok"], cardSpecs: ["native"] },
  "character-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  novelai: { accessTags: ["paid"], cardSpecs: ["v2", "json"] },
  "venus-ai": { accessTags: ["free", "byok"], cardSpecs: ["v2"] },
  "charstar-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "botify-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "spicychat-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "erogen-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  fapai: { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  soulkyn: { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "alice-ai": { accessTags: ["free"], cardSpecs: ["native"] },
  "fallfor-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "fantasy-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "leelee-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "kink-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "juicychat-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "pephop-ai": { hasSfwNsfwToggle: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "rprp-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  magicbuddy: { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "miku-gg": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  flowgpt: { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "joyland-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },

  // Character libraries
  "chub-ai": { accessTags: ["free", "byok"], cardSpecs: ["v2", "v3", "json"] },

  // Companion apps
  "candy-ai": { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  girlfriendgpt: { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  dreamgf: { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "kupid-ai": { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "lovescape-ai": { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "swipey-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "secret-desires": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "lustgf-ai": { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "eden-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "cutechat-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "hotchat-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "sedux-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "yume-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "golove-ai": { accessTags: ["free"], cardSpecs: ["native"] },
  "couple-me": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  kindroid: { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "nomi-ai": { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  replika: { accessTags: ["free", "paid"], cardSpecs: ["native"] },

  // Model providers
  pygmalionai: { accessTags: ["foss", "free", "byok"] },
  openrouter: { accessTags: ["free", "paid", "byok"] },
  ollama: { accessTags: ["foss", "free", "byok"] },

  // Image + chat hybrids
  "ourdream-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  soulgen: { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "promptchan-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "krush-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "ehentai-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "nectar-ai": { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  aiallure: { accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "muah-ai": { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },

  // Additional ecosystem platforms
  "backyard-ai": { accessTags: ["free", "paid", "byok"], cardSpecs: ["json", "native"] },
  "lm-studio": { accessTags: ["free", "byok"] },
  "open-webui": { accessTags: ["foss", "free", "byok"], cardSpecs: ["json", "native"] },
  perchance: { accessTags: ["free"], cardSpecs: ["native"] },
  "mistral-le-chat": { hasMultimodal: true, accessTags: ["free", "paid"], cardSpecs: ["native"] },
  "tavernai-legacy": { accessTags: ["foss", "free", "byok"], cardSpecs: ["v2", "json"] },
};

/** Return the structured filter facts for a platform (empty object = unknown). */
export function getPlatformFilterFacts(bot: Chatbot): PlatformFilterFacts {
  return platformFilterFacts[bot.slug] ?? {};
}

export const categoryLabels: Record<Category, string> = {
  local: "Local Frontends",
  hosted: "Hosted RP Platforms",
  libraries: "Character Libraries",
  companion: "Companion Apps",
  providers: "Model Providers",
  hybrid: "Image + Chat Hybrids",
};

export const categoryDescriptions: Record<Category, string> = {
  local: "Run on your own hardware — full control, full privacy, bring your own model.",
  hosted: "Web-based roleplay and chat platforms with built-in characters and models.",
  libraries: "Character card repositories you browse, download, and import elsewhere.",
  companion: "Long-term companion apps focused on relationship persistence.",
  providers: "Models and API gateways you plug into frontends like SillyTavern.",
  hybrid: "Chat combined with image and/or video generation.",
};

export const categoryColors: Record<Category, string> = {
  local: "bg-badge-local/15 text-badge-local border-badge-local/30",
  hosted: "bg-badge-hosted/15 text-badge-hosted border-badge-hosted/30",
  libraries: "bg-badge-libraries/15 text-badge-libraries border-badge-libraries/30",
  companion: "bg-badge-companion/15 text-badge-companion border-badge-companion/30",
  providers: "bg-badge-providers/15 text-badge-providers border-badge-providers/30",
  hybrid: "bg-badge-hybrid/15 text-badge-hybrid border-badge-hybrid/30",
};

export const contentLevelLabels: Record<ContentLevel, string> = {
  1: "SFW",
  2: "Light NSFW",
  3: "Moderate",
  4: "Explicit",
  5: "Fully uncensored",
};

export const contentLevelColors: Record<ContentLevel, string> = {
  1: "bg-muted text-muted-foreground border-border",
  2: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  3: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  4: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  5: "bg-primary/15 text-primary border-primary/30",
};