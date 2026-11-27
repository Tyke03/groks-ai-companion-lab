import type { FieldName } from "../domain/card";

/** Single token table for the registry and the evaluator. */
export const TOKEN_BUDGETS: Record<FieldName, number> = {
  name: 60,
  nickname: 40,
  tags: 120,
  description: 1000,
  personality: 600,
  first_mes: 400,
  scenario: 600,
  alternate_greetings: 300,
  group_only_greetings: 300,
  mes_example: 1200,
  system_prompt: 400,
  post_history_instructions: 300,
  creator_notes: 250,
  creator: 60,
  character_version: 20,
};
