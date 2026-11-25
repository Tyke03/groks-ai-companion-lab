import { PIPELINE_CONFIG } from "../config/pipeline";

/** Cached system prefix at $0.033/M after the first call. Fresh input $0.165/M, output $0.55/M. */
export function priceUSD(inputTokens: number, outputTokens: number, cachedTokens = 0): number {
  const fresh = Math.max(0, inputTokens - cachedTokens);
  return (cachedTokens * 0.033 + fresh * 0.165 + outputTokens * 0.55) / 1_000_000;
}

export class CostGuard {
  spent = 0;
  constructor(readonly max = PIPELINE_CONFIG.maxCardCostUSD) {}

  /** True when this charge crosses the card cap. */
  add(amount: number): boolean {
    this.spent += amount;
    return this.spent > this.max;
  }

  get exhausted(): boolean {
    return this.spent >= this.max;
  }
}
