import type { GateResult } from "./types";
import { gate } from "./types";

export function validateArrayShape(field: string, value: unknown): GateResult {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return gate([{ validator: "arrayShape", field, blocking: true, message: "array fields must be string[]" }]);
  }
  if (value.some((item) => item.trim() === "")) {
    return gate([{ validator: "arrayShape", field, blocking: true, message: "empty string in array" }]);
  }
  if (value.some((item) => /<<ITEM\s+\d+>>/.test(item) || (item.match(/<START>/g) || []).length > 1)) {
    return gate([{ validator: "arrayShape", field, blocking: true, message: "merged blob inside one item" }]);
  }
  return gate([]);
}
