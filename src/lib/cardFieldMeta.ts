import type { CardData } from "./cardTypes";

export const FIELD_HINTS: Partial<Record<keyof CardData, string>> = {
  description: "Appearance, background, abilities, and key traits (2-4 paragraphs)",
  personality: "Core personality traits, behavioral patterns, and quirks",
  scenario: "The setting/situation where the user meets this character",
  first_mes: "The character's opening message with actions and dialogue",
  mes_example: "Three SillyTavern <START> blocks using {{user}}: / {{char}}: labels",
  creator_notes: "Notes for users about how to best use this character",
  system_prompt: "Instructions for the AI on how to roleplay this character",
  post_history_instructions: "Brief reminder inserted after chat history",
  tags: "Comma-separated tags for categorization",
  nickname: "Alternative name or alias for the character",
  alternate_greetings: "Alternate opening messages (V2 spec field)",
  group_only_greetings: "Greetings only used in group chats",
  source: "Source URLs or IDs",
};

export const ARRAY_FIELDS = new Set<keyof CardData>([
  "source",
  "group_only_greetings",
  "alternate_greetings",
]);
