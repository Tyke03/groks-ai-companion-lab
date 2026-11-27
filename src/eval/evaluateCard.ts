import { TOKEN_BUDGETS } from "../config/budgets";
import type { FieldName } from "../domain/card";

/** Evaluator budgets. Same object the field registry reads. */
export function evaluatorBudgets(): Record<FieldName, number> {
  return TOKEN_BUDGETS;
}
