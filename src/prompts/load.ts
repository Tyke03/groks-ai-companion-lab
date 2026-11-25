import base from "./system/base.md?raw";
import fieldContract from "./system/field-contract.md?raw";
import extract from "./stages/extract.md?raw";
import plan from "./stages/plan.md?raw";
import name from "./stages/name.md?raw";
import nickname from "./stages/nickname.md?raw";
import tags from "./stages/tags.md?raw";
import description from "./stages/description.md?raw";
import personality from "./stages/personality.md?raw";
import scenario from "./stages/scenario.md?raw";
import firstMes from "./stages/first_mes.md?raw";
import alternate from "./stages/alternate_greetings.md?raw";
import groupOnly from "./stages/group_only_greetings.md?raw";
import mesExample from "./stages/mes_example.md?raw";
import systemPrompt from "./stages/system_prompt.md?raw";
import phi from "./stages/post_history_instructions.md?raw";
import creatorNotes from "./stages/creator_notes.md?raw";
import audit from "./stages/audit.md?raw";
import repair from "./stages/repair.md?raw";

export const SYSTEM_PROMPT = base.trim();
export const FIELD_CONTRACT_TEMPLATE = fieldContract.trim();

export const STAGE_PROMPTS: Record<string, string> = {
  extract: extract.trim(),
  plan: plan.trim(),
  name: name.trim(),
  nickname: nickname.trim(),
  tags: tags.trim(),
  description: description.trim(),
  personality: personality.trim(),
  scenario: scenario.trim(),
  first_mes: firstMes.trim(),
  alternate_greetings: alternate.trim(),
  group_only_greetings: groupOnly.trim(),
  mes_example: mesExample.trim(),
  system_prompt: systemPrompt.trim(),
  post_history_instructions: phi.trim(),
  creator_notes: creatorNotes.trim(),
  audit: audit.trim(),
  repair: repair.trim(),
};
