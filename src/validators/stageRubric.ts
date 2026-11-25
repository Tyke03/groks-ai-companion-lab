import type { GateResult } from "./types";
import { gate } from "./types";

const LADDER = /^\s*(\d+[\.\)]|stage\s*\d)/im;

export function validateStageRubric(field: string, text: string): GateResult {
  if (field !== "scenario" && field !== "personality") return gate([]);
  if (!LADDER.test(text)) return gate([]);
  return gate([
    {
      validator: "stageRubric",
      field,
      blocking: true,
      message: "stage ladder does not belong in this field",
    },
  ]);
}
