import { budgetPasses } from "../context/budgets";
import type { GateResult } from "./types";
import { gate } from "./types";

export function validateBudget(field: string, tokens: number, budget: number): GateResult {
  if (budgetPasses(tokens, budget)) return gate([]);
  return gate([
    {
      validator: "budget",
      field,
      blocking: true,
      message: `${tokens} tokens over budget ${budget}`,
    },
  ]);
}
