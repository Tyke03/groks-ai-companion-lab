import { TOKEN_BUDGETS } from "../config/budgets";
import type { FieldName, FieldPolicy } from "./card";
import { FIELD_NAMES } from "./card";

export interface FieldContract {
  mustCover: string;
  mustNot: string;
  lengthHint: string;
  pov: string;
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
    budgetTokens: TOKEN_BUDGETS.name,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: [],
    contract: {
      mustCover: "the character's display name",
      mustNot: "titles essay, backstory, scene",
      lengthHint: "one short name",
      pov: "the name only. No prose.",
      format: "plain text, no heading",
    },
  },
  nickname: {
    name: "nickname",
    budgetTokens: TOKEN_BUDGETS.nickname,
    format: "text",
    defaultPolicy: unlocked,
    derived: true,
    lint: [],
    contract: {
      mustCover: "a plainer, shorter substitute for the name; a diminutive only when the name is multi-word",
      mustNot: "a second character, a scene",
      lengthHint: "one short substitute",
      pov: "the substitute only. No prose.",
      format: "plain text",
    },
  },
  tags: {
    name: "tags",
    budgetTokens: TOKEN_BUDGETS.tags,
    maxItems: 12,
    maxItemChars: 40,
    format: "array",
    defaultPolicy: unlocked,
    derived: true,
    lint: ["tag schema"],
    contract: {
      mustCover: "12 tags: archetype, dynamic, setting, tone. No name, no nickname.",
      mustNot: "sentences, prose, duplicates, the name, the nickname",
      lengthHint: "12 tags",
      pov: "labels only. No prose.",
      format: "JSON string array, lowercase, no empties",
    },
  },
  description: {
    name: "description",
    budgetTokens: TOKEN_BUDGETS.description,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["bleed", "agency"],
    contract: {
      mustCover: "body, wardrobe, habitual mannerisms, history, current life circumstances",
      mustNot: "any current scene, dialogue, staging, mechanics, the tell inventory",
      lengthHint: "900-1100 words, 4-6 paragraphs",
      pov: "third person only. No 'you'.",
      format: "plain prose, no headings, no lists",
    },
  },
  personality: {
    name: "personality",
    budgetTokens: TOKEN_BUDGETS.personality,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["agency"],
    contract: {
      mustCover: "temperament, contradictions, what she wants versus what she admits, the full tell inventory",
      mustNot: "stage directions, 'if/when {{user}}', scene, appearance",
      lengthHint: "220-300 words",
      pov: "third person only. No 'you'.",
      format: "plain prose, no headings, no lists",
    },
  },
  scenario: {
    name: "scenario",
    budgetTokens: TOKEN_BUDGETS.scenario,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["bleed"],
    contract: {
      mustCover: "the standing situation that hosts the opening: place, time, who is present, the pressure. The opening beat is already written; write around it.",
      mustNot: "dialogue, stage direction, the opening beat itself, appearance, backstory",
      lengthHint: "120-170 words",
      pov: "third person. 'The party', not 'you've ended up at the party'.",
      format: "plain prose, no headings, no lists",
    },
  },
  first_mes: {
    name: "first_mes",
    budgetTokens: TOKEN_BUDGETS.first_mes,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["agency", "jargon"],
    contract: {
      mustCover: "the inciting instant, her first physical action, her first line",
      mustNot: "re-describing the room, restating the situation, mechanics",
      lengthHint: "130-180 words",
      pov: "third person for her. {{user}} may appear only as an object.",
      format: "plain prose, 2-4 paragraphs",
    },
  },
  alternate_greetings: {
    name: "alternate_greetings",
    budgetTokens: TOKEN_BUDGETS.alternate_greetings,
    format: "array",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["agency", "jargon", "array"],
    contract: {
      mustCover: "other opening messages, each a different situation",
      mustNot: "mechanics, a merged blob of several greetings in one item",
      lengthHint: "2-4 paragraphs each",
      pov: "third person for the character. {{user}} may appear only as an object.",
      format: "JSON {\"items\": string[]}. Each item is 2-4 paragraphs and ends on a hook.",
    },
  },
  group_only_greetings: {
    name: "group_only_greetings",
    budgetTokens: TOKEN_BUDGETS.group_only_greetings,
    format: "array",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["agency", "jargon", "array"],
    contract: {
      mustCover: "openers used only when several characters share the chat",
      mustNot: "a solo scene, mechanics",
      lengthHint: "2-4 paragraphs each",
      pov: "third person. Several people may be present.",
      format: "JSON {\"items\": string[]}",
    },
  },
  mes_example: {
    name: "mes_example",
    budgetTokens: TOKEN_BUDGETS.mes_example,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["<START> structure"],
    contract: {
      mustCover: "example dialogue the runtime will imitate",
      mustNot: "narration of the player, mechanics essays",
      lengthHint: "2-3 exchanges",
      pov: "lines labeled {{user}}: and {{char}}:.",
      format: "exactly <START> before each exchange, lines {{user}}: and {{char}}:, 2-3 exchanges",
    },
  },
  system_prompt: {
    name: "system_prompt",
    budgetTokens: TOKEN_BUDGETS.system_prompt,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["bleed"],
    contract: {
      mustCover: "how the model plays the character: voice, format, and progression",
      mustNot: "the scene, the dossier, reminders that belong after history",
      lengthHint: "150-220 words",
      pov: "second person for the model. Rules, not scene.",
      format: "no header line",
    },
  },
  post_history_instructions: {
    name: "post_history_instructions",
    budgetTokens: TOKEN_BUDGETS.post_history_instructions,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["bleed"],
    contract: {
      mustCover: "3-4 hooks only; the rules live in system_prompt",
      mustNot: "a second system prompt, a scene, a stage ladder",
      lengthHint: "3-4 lines, 3 bullets maximum",
      pov: "hooks only. No scene.",
      format: "plain lines or up to 3 bullets",
    },
  },
  creator_notes: {
    name: "creator_notes",
    budgetTokens: TOKEN_BUDGETS.creator_notes,
    format: "text",
    defaultPolicy: unlocked,
    derived: false,
    lint: ["jargon"],
    contract: {
      mustCover: "notes for the human who downloads the card, including an Intended user: line",
      mustNot: "UI control names, model-facing rules",
      lengthHint: "a short note",
      pov: "written to the human reader.",
      format: "human-facing prose. No button or menu names.",
    },
  },
  creator: {
    name: "creator",
    budgetTokens: TOKEN_BUDGETS.creator,
    format: "text",
    defaultPolicy: derivedLocked,
    derived: true,
    lint: [],
    contract: {
      mustCover: "the profile handle",
      mustNot: "a character name",
      lengthHint: "one handle",
      pov: "the handle only.",
      format: "plain text",
    },
  },
  character_version: {
    name: "character_version",
    budgetTokens: TOKEN_BUDGETS.character_version,
    format: "text",
    defaultPolicy: derivedLocked,
    derived: true,
    lint: ["semver-ish"],
    contract: {
      mustCover: "the card revision",
      mustNot: "prose",
      lengthHint: "one version",
      pov: "the version only.",
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
