import type { SchemaName } from "../validators/schema";

export interface StageRoute {
  id: string;
  model: string;
  reasoningEffort: "none" | "low" | "high";
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxCompletionTokens: number;
  schema?: SchemaName;
  code?: boolean;
}

const glm = "glm-5-3-flash-uncensored";
const deepseek = "deepseek-v4-1-flash-1017-uncensored";
const heretic = "glm-4-7-flash-heretic";

function prose(
  id: string,
  temperature: number,
  maxCompletionTokens: number,
  reasoning: StageRoute["reasoningEffort"] = "none",
  penalties: [number, number] = [0, 0],
  schema?: SchemaName,
  model = glm,
): StageRoute {
  return {
    id,
    model,
    reasoningEffort: reasoning,
    temperature,
    topP: reasoning === "none" && temperature >= 0.8 ? 0.95 : 0.9,
    frequencyPenalty: penalties[0],
    presencePenalty: penalties[1],
    maxCompletionTokens,
    schema,
  };
}

export const STAGE_ROUTES: Record<string, StageRoute> = {
  extract: prose("extract", 0.25, 16384, "high", [0, 0], "extract"),
  plan: prose("plan", 0.2, 8192, "high", [0, 0], "plan", deepseek),
  name: prose("name", 0.55, 512),
  nickname: prose("nickname", 0.3, 256, "none", [0, 0], undefined, heretic),
  tags: prose("tags", 0.3, 512, "none", [0, 0], "derive", heretic),
  description: prose("description", 0.88, 8192, "none", [0.25, 0.15]),
  personality: prose("personality", 0.8, 4096, "none", [0.2, 0.15]),
  scenario: prose("scenario", 0.85, 4096, "none", [0.2, 0.15]),
  first_mes: prose("first_mes", 0.92, 4096, "none", [0.25, 0.15]),
  alternate_greetings: prose("alternate_greetings", 0.95, 8192, "none", [0.25, 0.15], "greetings"),
  group_only_greetings: prose("group_only_greetings", 0.95, 8192, "none", [0.25, 0.15], "greetings"),
  mes_example: prose("mes_example", 0.85, 8192, "low", [0.2, 0.15]),
  system_prompt: prose("system_prompt", 0.45, 2048, "low", [0.1, 0.1]),
  post_history_instructions: prose("post_history_instructions", 0.45, 2048, "low", [0.1, 0.1]),
  creator_notes: prose("creator_notes", 0.5, 1024, "low", [0.1, 0.1]),
  creator: { ...prose("creator", 0, 0), code: true, model: "" },
  character_version: { ...prose("character_version", 0, 0), code: true, model: "" },
  audit: prose("audit", 0.15, 8192, "high", [0, 0], "audit", deepseek),
  repair: prose("repair", 0.4, 4096, "none", [0, 0], "repair"),
  score: { ...prose("score", 0, 0, "none", [0, 0], undefined, "clef"), model: "clef" },
};

export const ESCALATION_MODEL = deepseek;
export const ESCALATION_TEMPERATURE = 0.35;

export function routeFor(stage: string): StageRoute {
  const route = STAGE_ROUTES[stage];
  if (!route) throw new Error(`unknown stage ${stage}`);
  return route;
}
