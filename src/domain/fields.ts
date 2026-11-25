import type { FieldName, FieldPolicy } from "./card";
import { FIELD_NAMES } from "./card";

export interface FieldContract {
  owns: string;
  mustNot: string;
  elsewhere: string;
  format: string;
}

export interface FieldDef {
  name: FieldName;
  /** Hard token budget. Tags also carry a 12×40 character cap. */
  budgetTokens: number;
  maxItems?: number;
  maxItemChars?: number;
  format: "text" | "array";
  defaultPolicy: FieldPolicy;
  /** Set by code, never by a model overwrite of an existing value. */
  derived: boolean;
  lint: string[];
  contract: FieldContract;
}

const unlocked: FieldPolicy = { locked: false, useAsContext: true, origin: "generated" };
const derivedLocked: FieldPolicy = { locked: true, useAsContext: false, origin: "manual" };

export const FIELD_REGISTRY: Record<FieldName, FieldDef> = {
  name: {
    name: "name",
    budgetTokens: 60,
    format: "text",
    defaultPolicy: { locked: true, useAsContext: false, origin: "manual" },
    derived: false,
    lint: [],
    contract: {
      owns: "the character's display name",
      mustNot: "titles essay, backstory, scene",
      elsewhere: "short substitute → nickname",
      format: "plain text, no heading",
    },
  },
  nickname: {
    name: "nickname",
    budgetTokens: 40,
    format: "text",
    defaultPolicy: derivedLocked,
    derived: true,
    lint: [],
    contract: {
      owns: "a short substitute for the display name",
      mustNot: "a second character, a scene",
      elsewhere: "display name → name",
      format: "plain text",
    },
  },
  tags: {
    name: "tags",
    budgetTokens: 120,
    maxItems: 12,
    maxItemChars: 40,
    format: "array",
    defaultPolicy: derivedLocked,
    derived: true,
    lint: ["tag schema"],
    contract: {
      owns: "search tags",
      mustNot: "sentences, prose, duplicates",
      elsewhere: "story → description",
      format: "JSON string array, lowercase, no empties",
    },
  },
  description: {
    name: "description",
    budgetTokens: 1000,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["bleed", "agency", "jargon"],
    contract: {
      owns: "physical appearance and history",
      mustNot: "current scene, greeting, mechanics, imperatives",
      elsewhere: "traits → personality; scene → scenario; mechanics → system_prompt",
      format: "third person or present-tense dossier. Plain prose, no headings, no lists.",
    },
  },
  personality: {
    name: "personality",
    budgetTokens: 600,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["agency"],
    contract: {
      owns: "traits and interiority",
      mustNot: "if {{user}}, when, stage directions, second person, scene, appearance",
      elsewhere: "body and history → description; scene → scenario",
      format: "plain prose, no headings, no lists",
    },
  },
  scenario: {
    name: "scenario",
    budgetTokens: 600,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["bleed", "stage-rubric"],
    contract: {
      owns: "immediate situation, location, time, who is present, the inciting pressure",
      mustNot: "appearance, permanent backstory, stage ladders, formatting rules, meta-instructions, JSON",
      elsewhere: "mechanics → system_prompt; reminders → post_history_instructions; human notes → creator_notes",
      format: "plain prose, single paragraph, no headings, no lists, no numbered steps",
    },
  },
  first_mes: {
    name: "first_mes",
    budgetTokens: 400,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["agency", "jargon"],
    contract: {
      owns: "the opening message the player sees",
      mustNot: "mechanics, how to use this card, permanent dossier",
      elsewhere: "psychology → personality; situation facts already owned by scenario stay implied",
      format: "in-scene, 2–4 paragraphs, end on a hook or question. {{user}} is the player.",
    },
  },
  alternate_greetings: {
    name: "alternate_greetings",
    budgetTokens: 300,
    format: "array",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["agency", "jargon", "array"],
    contract: {
      owns: "other opening messages, each a different situation",
      mustNot: "mechanics, a merged blob of several greetings in one item",
      elsewhere: "the default opener → first_mes",
      format: "JSON {\"items\": string[]}. Each item is 2–4 paragraphs and ends on a hook.",
    },
  },
  group_only_greetings: {
    name: "group_only_greetings",
    budgetTokens: 300,
    format: "array",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["agency", "jargon", "array"],
    contract: {
      owns: "openers used only when several characters share the chat",
      mustNot: "a solo scene, mechanics",
      elsewhere: "solo opener → first_mes",
      format: "JSON {\"items\": string[]}",
    },
  },
  mes_example: {
    name: "mes_example",
    budgetTokens: 1200,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["<START> structure"],
    contract: {
      owns: "example dialogue the runtime will imitate",
      mustNot: "narration of the player, mechanics essays",
      elsewhere: "the live opener → first_mes",
      format: "exactly <START> before each exchange, lines {{user}}: and {{char}}:, 2–3 exchanges",
    },
  },
  system_prompt: {
    name: "system_prompt",
    budgetTokens: 400,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["bleed"],
    contract: {
      owns: "rules for how the model plays the character",
      mustNot: "the scene, the dossier, reminders that belong after history",
      elsewhere: "short reminder → post_history_instructions",
      format: "second-person mechanics. Rules, not scene.",
    },
  },
  post_history_instructions: {
    name: "post_history_instructions",
    budgetTokens: 300,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["bleed"],
    contract: {
      owns: "a short reminder placed after chat history",
      mustNot: "a second system prompt, a scene, a stage ladder",
      elsewhere: "full rules → system_prompt",
      format: "3–6 lines",
    },
  },
  creator_notes: {
    name: "creator_notes",
    budgetTokens: 250,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["jargon"],
    contract: {
      owns: "notes for the human who downloads the card",
      mustNot: "UI control names, model-facing rules",
      elsewhere: "model rules → system_prompt",
      format: "human-facing prose. Include an Intended user: line. No button or menu names.",
    },
  },
  creator: {
    name: "creator",
    budgetTokens: 60,
    format: "text",
    defaultPolicy: derivedLocked,
    derived: true,
    lint: [],
    contract: {
      owns: "the profile handle",
      mustNot: "a character name",
      elsewhere: "character name → name",
      format: "plain text",
    },
  },
  character_version: {
    name: "character_version",
    budgetTokens: 20,
    format: "text",
    defaultPolicy: derivedLocked,
    derived: true,
    lint: ["semver-ish"],
    contract: {
      owns: "the card revision",
      mustNot: "prose",
      elsewhere: "notes → creator_notes",
      format: "semver-ish text, default 1.0.0",
    },
  },
};

export const STAGE_ORDER: FieldName[] = [...FIELD_NAMES];

export const STAGE_INDEX: Record<FieldName, number> = STAGE_ORDER.reduce(
  (acc, name, i) => {
    acc[name] = i;
    return acc;
  },
  {} as Record<FieldName, number>,
);

export const LOCK_AFTER_STAGE = new Set<FieldName>([
  "name",
  "nickname",
  "tags",
  "creator",
  "character_version",
]);

export const GREETING_FIELDS = new Set<FieldName>([
  "first_mes",
  "alternate_greetings",
  "group_only_greetings",
]);

export const BLEED_FIELDS = [
  "scenario",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
] as const;

export function assertRegistryCoversAll(): void {
  for (const name of FIELD_NAMES) {
    if (!FIELD_REGISTRY[name]) throw new Error(`registry missing ${name}`);
    if (FIELD_REGISTRY[name].budgetTokens <= 0) throw new Error(`budget missing ${name}`);
  }
}
