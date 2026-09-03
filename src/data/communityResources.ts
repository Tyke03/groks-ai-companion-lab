export interface CommunityResource {
  name: string;
  url: string;
  type: "reddit" | "discord" | "forum" | "wiki" | "site";
  description: string;
}

export const communityResources: CommunityResource[] = [
  // Reddit communities
  {
    name: "r/SillyTavernAI",
    url: "https://reddit.com/r/SillyTavernAI",
    type: "reddit",
    description: "Official SillyTavern subreddit — setup guides, character sharing, troubleshooting.",
  },
  {
    name: "r/CharacterAI",
    url: "https://reddit.com/r/CharacterAI",
    type: "reddit",
    description: "Largest Character.AI community — tips, workarounds, character recommendations.",
  },
  {
    name: "r/CharacterAI_NSFW",
    url: "https://reddit.com/r/CharacterAI_NSFW",
    type: "reddit",
    description: "NSFW workarounds and filter override techniques for Character.AI.",
  },
  {
    name: "r/PygmalionAI",
    url: "https://reddit.com/r/PygmalionAI",
    type: "reddit",
    description: "PygmalionAI model discussion, setup guides, and model comparisons.",
  },
  {
    name: "r/NovelAi",
    url: "https://reddit.com/r/NovelAi",
    type: "reddit",
    description: "NovelAI community — creative writing, image generation, model tips.",
  },
  {
    name: "r/JanitorAI",
    url: "https://reddit.com/r/JanitorAI",
    type: "reddit",
    description: "JanitorAI platform discussion, character creation, and API configuration.",
  },
  {
    name: "r/LocalLLaMA",
    url: "https://reddit.com/r/LocalLLaMA",
    type: "reddit",
    description: "Local AI model running — hardware guides, model releases, optimization tips.",
  },
  {
    name: "r/KoboldAI",
    url: "https://reddit.com/r/KoboldAI",
    type: "reddit",
    description: "KoboldAI backend discussion — model hosting and API setup.",
  },
  {
    name: "r/AICompanions",
    url: "https://reddit.com/r/AICompanions",
    type: "reddit",
    description: "General AI companion discussion, app recommendations, memory systems, and user experiences.",
  },
  {
    name: "r/Replika",
    url: "https://reddit.com/r/replika",
    type: "reddit",
    description: "Replika users discussing product changes, memory, relationship modes, and policy history.",
  },
  // Discord servers
  {
    name: "SillyTavern Discord",
    url: "https://discord.gg/sillytavern",
    type: "discord",
    description: "Official SillyTavern Discord — the largest card-maker and frontend community, with setup help, model talk, and extension support.",
  },
  {
    name: "Chub.ai Discord",
    url: "https://discord.gg/chub",
    type: "discord",
    description: "Official Chub.ai server — card sharing, creator feedback, and Venus AI discussion.",
  },
  {
    name: "AICharacterCards Discord",
    url: "https://discord.com/invite/aicharactercards",
    type: "discord",
    description: "Character card creators sharing cards, builder techniques, and feedback across compatible frontends.",
  },
  {
    name: "Kobold Horde Discord",
    url: "https://discord.gg/koboldai",
    type: "discord",
    description: "KoboldAI and Horde users discussing volunteer inference, models, queue behavior, and API usage.",
  },
  // Key sites
  {
    name: "Chatbots Webring",
    url: "https://chatbots.neocities.org",
    type: "site",
    description: "Webring of 50+ card-creator sites on Neocities — browse the network of sites like this one and discover new creators.",
  },
  {
    name: "AICharacterCards.com",
    url: "https://aicharactercards.com",
    type: "site",
    description: "Community character card library with thousands of downloadable characters.",
  },
  {
    name: "Chub.ai",
    url: "https://chub.ai",
    type: "site",
    description: "Largest character card repository — browse, download, and share V2 cards.",
  },
  {
    name: "RisuRealm",
    url: "https://realm.risuai.net",
    type: "site",
    description: "RisuAI's character sharing platform with community creations.",
  },
  {
    name: "HuggingFace — NSFW Models",
    url: "https://huggingface.co/models?search=uncensored",
    type: "site",
    description: "Browse and download uncensored AI models for local use.",
  },
  // Forums & boards
  {
    name: "/aicg/ — AI Chat & Girls",
    url: "https://boards.4channel.org/aicg/",
    type: "forum",
    description: "The /aicg/ (AI Chat & Girls) board on 4chan, covering character cards, roleplay frontends, local models, and image workflows. Unmoderated; browse at your own discretion.",
  },
  // Wikis & Guides
  {
    name: "SillyTavern Docs",
    url: "https://docs.sillytavern.app",
    type: "wiki",
    description: "Official SillyTavern documentation — complete setup and configuration reference.",
  },
  {
    name: "NovelAI Docs",
    url: "https://docs.novelai.net",
    type: "wiki",
    description: "Official NovelAI documentation — models, features, and API reference.",
  },
  {
    name: "SpicyChat Docs",
    url: "https://docs.spicychat.ai",
    type: "wiki",
    description: "Official SpicyChat AI documentation — platform features and character creation.",
  },
  {
    name: "Agnaistic Guide",
    url: "https://agnai.guide",
    type: "wiki",
    description: "Agnaistic setup and usage guide — self-hosting, API config, persona formats.",
  },
];

export const communityTypeLabels: Record<string, { label: string; color: string }> = {
  reddit: { label: "Reddit", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  discord: { label: "Discord", color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
  forum: { label: "Forum", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  wiki: { label: "Docs/Wiki", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  site: { label: "Resource", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
};
