import { encode } from "gpt-tokenizer";
import { PIPELINE_CONFIG } from "../config/pipeline";
import { balanceMarkdown } from "../validators/markdown";

export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}

export function overBudget(tokens: number, budget: number, hardFail = PIPELINE_CONFIG.budgetHardFail): boolean {
  if (budget <= 0) return false;
  return tokens / budget > hardFail;
}

/** 100% of budget passes. Anything above the hard-fail ratio fails. */
export function budgetPasses(tokens: number, budget: number): boolean {
  return !overBudget(tokens, budget);
}

/**
 * Cut at the last sentence end that still fits, then re-balance emphasis.
 * Never returns a mid-token slice: the cut is on decoded text, then re-counted.
 */
export function truncateToBudget(text: string, budget: number): string {
  if (countTokens(text) <= budget) return balanceMarkdown(text);
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (countTokens(text.slice(0, mid)) <= budget) lo = mid;
    else hi = mid - 1;
  }
  let cut = text.slice(0, lo);
  const sentence = cut.match(/^[\s\S]*[.!?](?=(?:\s|$))/);
  if (sentence && countTokens(sentence[0]) > 0 && countTokens(sentence[0]) <= budget) {
    cut = sentence[0];
  }
  return balanceMarkdown(cut.trim());
}

export function textOfTokenLength(tokens: number): string {
  if (tokens <= 0) return "";
  const word = "stone";
  let out = "";
  while (countTokens(out) < tokens) out = out ? `${out} ${word}` : word;
  let lo = 0;
  let hi = out.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (countTokens(out.slice(0, mid)) < tokens) lo = mid;
    else hi = mid - 1;
  }
  let slice = out.slice(0, lo);
  while (countTokens(slice) < tokens) slice += " x";
  while (countTokens(slice) > tokens && slice.length > 0) slice = slice.slice(0, -1);
  return slice;
}
