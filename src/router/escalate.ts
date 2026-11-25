import { PIPELINE_CONFIG } from "../config/pipeline";
import { ESCALATION_MODEL, ESCALATION_TEMPERATURE, type StageRoute } from "./stages";

export interface EscalationBudget {
  left: number;
}

export function escalationBudget(max = PIPELINE_CONFIG.escalationsPerCard): EscalationBudget {
  return { left: max };
}

export function escalatedRoute(route: StageRoute): StageRoute | null {
  return {
    ...route,
    model: ESCALATION_MODEL,
    temperature: ESCALATION_TEMPERATURE,
    reasoningEffort: "none",
  };
}
