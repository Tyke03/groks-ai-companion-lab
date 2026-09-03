export interface BlogSection {
  heading?: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
  tags: string[];
  sections: BlogSection[];
}

export const blogPosts: BlogPost[] = [
  {
    id: "sillytavern-vs-risuai",
    title: "SillyTavern vs RisuAI: Which Frontend Should You Run?",
    excerpt:
      "The two most popular local AI chat frontends compared across setup, customization, group chats, scripting, and ecosystem — and when to pick one over the other.",
    category: "Comparisons",
    date: "2026-08-10",
    readTime: "9 min",
    tags: ["sillytavern", "risuai", "comparison"],
    sections: [
      {
        paragraphs: [
          "If you're serious about character cards, you've probably hit the same fork in the road: SillyTavern, the established giant with the biggest plugin ecosystem in the space, or RisuAI, the newer cross-platform contender that's been winning converts with its polish and regex scripting. Both are free, both are local-first, and both speak fluent V2/V3 character cards. The differences that actually matter are about how you work.",
        ],
      },
      {
        heading: "Setup and first impressions",
        paragraphs: [
          "SillyTavern requires Node.js 18+, a clone or download of the repo, and a quick start script — then you're on localhost:8000. It's been refined over years, so the default experience is stable, and the community has answered basically every setup question you can have. RisuAI is even faster to try: the web build works in a browser tab with zero installation, and desktop builds exist for Windows, macOS, and Linux with a mobile app on Android.",
          "If you want to test-drive a frontend before committing, RisuAI's web version wins the first five minutes. If you want something that just runs forever with no surprises, SillyTavern's maturity shows.",
        ],
      },
      {
        heading: "Customization and scripting",
        paragraphs: [
          "This is where the two diverge hardest. SillyTavern's strength is its extension ecosystem: TTS, expression images, translation, lorebook tools, and a thousand community extensions. Anything you can imagine doing with a character, someone has probably built a SillyTavern extension for it. The cost is complexity — settings live behind multiple nested menus, and the theming system, while powerful, is its own learning curve.",
          "RisuAI puts scripting first-class. Its regex scripting is genuinely the best in any frontend: you can write conditional replacement rules, inject context mid-conversation, and build behaviors that would take several SillyTavern extensions to approximate. Group chats are also more comfortable out of the box, with per-character settings and multi-character banter that feels natural. Emotion images are built in rather than bolted on.",
        ],
      },
      {
        heading: "Backend compatibility",
        paragraphs: [
          "Both frontends are backend-agnostic, which is the entire point. SillyTavern's API config covers OpenAI, Claude, NovelAI, KoboldAI, Oobabooga, and OpenRouter — the OpenRouter integration is the one most power users run today because one key unlocks hundreds of models. RisuAI supports the same major backends plus its own presets, and its connection settings are slightly friendlier to people who juggle multiple providers.",
          "The practical advice: if you switch backends often or run OpenRouter as your daily driver, you'll be fine with either. If you use a local stack (KoboldAI or Oobabooga on the same machine), both connect over localhost without drama.",
        ],
      },
      {
        heading: "The verdict",
        bullets: [
          "Choose SillyTavern if you want the biggest ecosystem, the most extensions, and the longest track record — and you don't mind the menu sprawl.",
          "Choose RisuAI if you want the best scripting, cleaner group chats, cross-platform polish, and a gentler learning curve.",
          "There's no wrong answer — both import the same cards, and plenty of people run both and switch by mood. The directory lists both with full setup docs if you want to go deeper.",
        ],
        paragraphs: [
          "The honest bottom line: SillyTavern is the safe default, RisuAI is the better first impression. Try RisuAI's web build for an afternoon, and if the regex scripting hooks you, keep it. If you find yourself wanting extensions nobody has built for it yet, SillyTavern is waiting.",
        ],
      },
    ],
  },
  {
    id: "perfect-character-card",
    title: "How to Create the Perfect Character Card (V2 & V3)",
    excerpt:
      "A field-by-field guide to character cards that stay in character — covering descriptions, example dialogue, alternate greetings, and the V3 fields most creators ignore.",
    category: "Tutorials",
    date: "2026-08-06",
    readTime: "11 min",
    tags: ["character cards", "tutorial", "V2", "V3"],
    sections: [
      {
        paragraphs: [
          "A character card is a JSON blob — optionally embedded in a PNG — that tells an AI who a character is and how to play them. The difference between a card that sings and a card that drifts into a generic chatbot by message ten is almost never the model. It's how the card is written. Here's the field-by-field playbook, for both the V2 spec that every frontend supports and the V3 fields that most creators still skip.",
        ],
      },
      {
        heading: "The description is the character",
        paragraphs: [
          "The description field is what the model leans on most. Two to four paragraphs is the sweet spot: physical appearance, background, abilities, and the personality traits that actually drive behavior. Write it in third person, concrete over abstract. 'She is confident' tells the model almost nothing. 'She runs the only tavern in a town that hates her kind, and she greets trouble with a smile and a knife within reach' gives the model a character to act from.",
          "One rule that separates good cards from great ones: every sentence in the description should change how the character would respond in at least one realistic scenario. If a sentence wouldn't affect a single reply, cut it.",
        ],
      },
      {
        heading: "Example dialogue is a teaching tool",
        paragraphs: [
          "mes_example is where you teach the model the character's voice — and it's the most underused field in the spec. Format it as <START> blocks alternating {{user}} and {{char}} turns. Three or four exchanges that show the character at their most characteristic beats ten paragraphs of description. Show them teasing, angry, tender, and mid-action. The model generalizes from examples, so variety beats volume.",
          "Common mistake: writing example dialogue that's too long. Models imitate the length and pacing of examples, so if your examples are three paragraphs each, you'll get walls of text. Match the example length to the response length you actually want.",
        ],
      },
      {
        heading: "Alternate greetings: the free replayability multiplier",
        paragraphs: [
          "alternate_greetings is an array of opening messages — the same character, several different doors into the story. Most frontends pick one at random or let the user choose. This is the cheapest feature in the spec: three good greetings triple the shelf life of a card, because the first message sets the tone for everything after it. Write greetings that start in medias res — mid-scene, mid-conversation, mid-crisis — instead of the character waiting for the user to do something.",
          "For V2 cards, keep alternate_greetings short and punchy. For V3, you also get group_only_greetings, which are the greetings used when the card appears in a group chat — write these so they acknowledge the other characters in the room, not just the user.",
        ],
      },
      {
        heading: "The V3 fields everyone skips",
        paragraphs: [
          "V3 adds nickname, source, creator_notes_multilingual, and assets. The one that matters most in practice is creator_notes_multilingual — a JSON object mapping language codes to translated notes. If your card has a following outside English, this is how it travels. The frontend shows the note in the language matching the user's locale, which is a subtle but real quality signal.",
          "assets is where creators can attach images and other resources referenced by extensions. If you don't use it, an empty array is fine — but knowing what belongs there (reference images, expression packs, audio) means you can adopt it the moment your frontend supports it.",
        ],
      },
      {
        heading: "Character version and hygiene",
        paragraphs: [
          "Set character_version to a real version string ('1.0', '2.1') instead of leaving the default. It costs nothing and it's how users know whether they're running your latest card. Tags should be specific enough to be searchable ('fantasy', 'romance', 'slow-burn') and honest — mistagged cards get refunded or ignored on libraries like Chub.ai.",
          "Finally: use a builder with live validation (like ours on the Tools page) so your JSON never silently drops a field, and export a PNG with the card embedded so it survives every import path in the ecosystem.",
        ],
      },
    ],
  },
  {
    id: "local-gpu-guide-2026",
    title: "Running Uncensored Models Locally: The 2026 GPU Guide",
    excerpt:
      "VRAM math, quantization tiers, the models that are actually good for roleplay right now, and how to wire local backends into SillyTavern and RisuAI.",
    category: "Guides",
    date: "2026-08-01",
    readTime: "12 min",
    tags: ["local", "GPU", "hardware", "models"],
    sections: [
      {
        paragraphs: [
          "The appeal of running models locally is simple: no filters, no rate limits, no service that can change its terms overnight — just you, a GPU, and weights you actually control. The trade-off is that 'local' means you become the infrastructure. Here's the 2026 reality check on what hardware you need, which models are worth the VRAM, and how to wire it all into a frontend.",
        ],
      },
      {
        heading: "The VRAM math that actually matters",
        paragraphs: [
          "Context window and model size compete for the same memory, and most people only budget for the weights. A 7B model at Q4 quantization needs roughly 4–5 GB of VRAM for weights, plus about 1 GB per 4K tokens of context — and the context grows fast with lorebooks and long chat histories. A 13B model at Q4 is closer to 8 GB. The 70B class is a 40+ GB proposition even heavily quantized, which is why most people stop at 13B–14B unless they have serious hardware.",
          "The good news: 2026's mid-range cards — 12–16 GB VRAM — hit the sweet spot. That's enough for a 13B model at Q4 with a comfortable 8K context, which is genuinely good roleplay territory.",
        ],
      },
      {
        heading: "Which models are good for roleplay right now",
        paragraphs: [
          "The open-weight landscape moves fast, but the pattern is stable: the best roleplay models are merges and fine-tunes of the Llama and Mistral lines that were trained to follow detailed system prompts and stay in character. For uncensored work, the community favorites are the 'abliterated' variants of strong base models — weights with refusal behavior removed by targeted fine-tuning — plus dedicated RP fine-tunes like Mythomax-style merges, which remain reliable picks for their size class.",
          "A practical note from the SillyTavern community: character adherence matters more than raw benchmark scores. A slightly older 13B fine-tune that was built for RP will usually beat a newer general-purpose 7B at staying in character, because it was trained on the right data.",
        ],
      },
      {
        heading: "Backends: KoboldAI vs Oobabooga",
        paragraphs: [
          "Two backends cover the practical spectrum. KoboldAI is the friendlier of the two: it bundles generation settings tuned for writing, has world info built in, and exposes a simple API that SillyTavern and RisuAI both support out of the box. Oobabooga's text-generation-webui is the power user's choice — more model formats, better tooling for swapping and testing models, and the same localhost API your frontend will happily connect to.",
          "Both integrate the same way: run the backend, enable its API mode, then add a custom endpoint in your frontend's API settings pointing at localhost. The SillyTavern and RisuAI docs on this site walk through each pairing step by step.",
        ],
      },
      {
        heading: "The free alternative: KoboldAI Horde",
        paragraphs: [
          "If you don't have the hardware, the KoboldAI Horde is worth knowing: a crowdsourced network of volunteers running models, where you queue requests with your API key. It's free, it's uncensored, and it's genuinely usable for casual roleplay — just don't expect consistent latency, because you're at the mercy of whoever's GPU picks up your request. It's a great way to try local-model quality before you buy hardware.",
        ],
      },
      {
        heading: "Final configuration checklist",
        bullets: [
          "Pick a model size by VRAM, not by hype: 7B for ≤8 GB, 13B for 12–16 GB, and rent a cloud box if you're serious about 70B.",
          "Budget context: 4K tokens ≈ 1 GB VRAM on top of the weights.",
          "Use a Q4 quantization as the default — Q5/Q8 buy quality at a steep VRAM cost.",
          "Keep your frontend's context trim: prune old messages or use a lorebook instead of letting history balloon.",
          "Test character adherence with a card you know well before judging a new model.",
        ],
        paragraphs: [
          "Local is more setup than a hosted platform — there's no avoiding that. But the payoff is the one thing no subscription can offer: the stack is yours, end to end, and it stays yours.",
        ],
      },
    ],
  },
  {
    id: "lorebook-mastery",
    title: "Lorebook Mastery: Building Worlds That Persist",
    excerpt:
      "How world info and lorebooks actually work under the hood — keywords, insertion order, constant entries — and a workflow for worlds that stay consistent across 10,000 messages.",
    category: "Tutorials",
    date: "2026-07-25",
    readTime: "9 min",
    tags: ["lorebooks", "world-building", "advanced"],
    sections: [
      {
        paragraphs: [
          "Every roleplay hits the same wall: message 500, and the AI has forgotten the kingdom's capital, the character's dead brother, or that the world runs on blood-magic. That's not the model being stupid — it's context running out and history winning the space. Lorebooks (world info, in SillyTavern terms) are the fix: a database of setting facts injected into context only when they're relevant. Master them, and your world survives conversations that would otherwise erase it.",
        ],
      },
      {
        heading: "How injection actually works",
        paragraphs: [
          "Each lorebook entry has keyword triggers and a body of text. When a trigger appears in the chat, the entry's body gets injected into the prompt at a configured position and priority. That's the entire mechanism — and it explains both the power and the failure modes. An entry only helps if its keywords actually fire, and it only stays in context as long as the trigger keeps appearing. The classic failure is an entry about a location that stops being mentioned in chat; once the keyword vanishes, so does the fact.",
        ],
      },
      {
        heading: "Write entries like encyclopedia fragments, not essays",
        paragraphs: [
          "An injected entry is competing for a limited budget. Write each entry as a dense, factual fragment: what it is, how it behaves, what it means for the scene — three to five sentences of pure information. If you find yourself writing narrative prose, that belongs in a character's description or an example message, not a lorebook. The best entries read like a wiki article written by someone who knows exactly what the model needs to roleplay correctly.",
        ],
      },
      {
        heading: "Keywords: the craft is in the triggers",
        paragraphs: [
          "Keyword design is where lorebooks are won and lost. Single words over-trigger ('tower' firing every tower mention in any context); entire phrases under-trigger. The workable pattern is a core keyword plus variants: for the Crystal of Binding, use 'crystal of binding', 'crystal', 'binding', 'the crystal'. Remember that models paraphrase — the trigger needs to survive the user and the AI both. When an entry mysteriously stops firing, the trigger word was probably the first casualty of paraphrasing, so add the synonyms you actually observe in chat.",
        ],
      },
      {
        heading: "Insertion order and constant entries",
        paragraphs: [
          "Every entry has an insertion order (a priority number) and an optional constant flag. Constant entries are always injected, regardless of keywords — use these sparingly, for facts the story can never forget (the current quest, the tone of the world, a central relationship). Regular entries should be sorted by importance: the lower the priority number, the earlier the entry sits in context, which means the model treats it as more foundational. A good rule of thumb is to keep the top five entries as your constants and let everything else float on keywords.",
          "In SillyTavern you can also set per-entry token budgets and 'recursive' scanning depth — recursive scanning checks whether keyword matches appear inside other entries, which is essential for connected worlds where one fact references another.",
        ],
      },
      {
        heading: "A workflow that scales",
        bullets: [
          "Start with the world's spine: 5–10 constant entries covering the setting's non-negotiables.",
          "Add location entries only when the party arrives — build lazily, not up front.",
          "After every session, skim the log for facts the AI got wrong and fix or add the entry that should have prevented it.",
          "Audit triggers monthly: entries that never fire get deleted or re-keyworded.",
          "Keep total injected lore under ~25% of context so the model has room to actually roleplay.",
        ],
        paragraphs: [
          "Lorebooks reward patience. The first session with a new world is mostly keyword tuning, but every entry you fix is a fact that stops being wrong forever — and that's the closest thing to persistence a roleplay can get.",
        ],
      },
    ],
  },
];

export const getBlogPost = (id: string) => blogPosts.find((p) => p.id === id);

export const blogCategories = [...new Set(blogPosts.map((p) => p.category))];
