import { countTokens } from "../context/budgets";
import { priceUSD } from "../router/cost";
import type { LlmClient, LlmRequest, LlmResponse } from "./types";

export type MockReply = string | ((req: LlmRequest) => string);

/** Fixture-driven model. Replies are keyed by stage id. */
export function createMockLlm(replies: Record<string, MockReply>, costUSD = 0.0001): LlmClient {
  return async (req) => {
    const reply = replies[req.stage];
    if (reply === undefined) throw new Error(`mock has no reply for stage ${req.stage}`);
    const content = typeof reply === "function" ? reply(req) : reply;
    const inputTokens = req.messages.reduce((n, m) => n + countTokens(m.content), 0);
    const outputTokens = countTokens(content);
    const cachedTokens = countTokens(req.messages[0]?.content ?? "");
    const response: LlmResponse = {
      content,
      provider: "mock",
      inputTokens,
      outputTokens,
      cachedTokens,
      costUSD: costUSD === 0.0001 ? priceUSD(inputTokens, outputTokens, cachedTokens) || costUSD : costUSD,
    };
    if (costUSD !== 0.0001) response.costUSD = costUSD;
    return response;
  };
}
