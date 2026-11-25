import { PIPELINE_CONFIG } from "../config/pipeline";

/** Cached system prefix at $0.033/M, fresh input at $0.15/M, output at $0.60/M. */
export function priceUSD(inputTokens: number, outputTokens: number, cachedTokens = 0): number {
  const fresh = Math.max(0, inputTokens - cachedTokens);
  return (cachedTokens * 0.033 + fresh * 0.15 + outputTokens * 0.6) / 1_000_000;
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
