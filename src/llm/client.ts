import { PIPELINE_CONFIG } from "../config/pipeline";
import { countTokens } from "../context/budgets";
import { SYSTEM_PROMPT } from "../prompts/load";
import { priceUSD } from "../router/cost";
import type { StageRoute } from "../router/stages";
import { schemaBody, type SchemaName } from "../validators/schema";
import { stageSeed, type LlmClient, type LlmRequest, type LlmResponse } from "./types";

export function assertCacheKey(req: LlmRequest): void {
  if (req.promptCacheKey !== PIPELINE_CONFIG.cacheKey) {
    throw new Error("prompt_cache_key drifted from ccv3-system-v1");
  }
  if (req.messages[0]?.role !== "system" || req.messages[0].content !== SYSTEM_PROMPT) {
    throw new Error("system block is not the frozen base prompt");
  }
}

export function buildRequest(opts: {
  route: StageRoute;
  stage: string;
  field?: string;
  user: string;
  cardId: string;
  attempt: number;
  systemCacheHit?: boolean;
}): LlmRequest {
  const schemaName = opts.route.schema as SchemaName | undefined;
  return {
    stage: opts.stage,
    field: opts.field,
    model: opts.route.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: opts.user },
    ],
    temperature: opts.route.temperature,
    topP: opts.route.topP,
    maxCompletionTokens: opts.route.maxCompletionTokens,
    reasoningEffort: opts.route.reasoningEffort,
    frequencyPenalty: opts.route.frequencyPenalty,
    presencePenalty: opts.route.presencePenalty,
    schemaName,
    schema: schemaName ? schemaBody(schemaName) : undefined,
    seed: stageSeed(opts.cardId, opts.field ?? opts.stage, opts.attempt),
    promptCacheKey: PIPELINE_CONFIG.cacheKey,
    attempt: opts.attempt,
    systemCacheHit: opts.systemCacheHit === true,
  };
}

/** Measures tokens locally so the cost guard does not trust a provider estimate. */
export function withMeasuredCost(req: LlmRequest, res: LlmResponse): LlmResponse {
  const inputTokens = req.messages.reduce((n, m) => n + countTokens(m.content), 0);
  const outputTokens = countTokens(res.content);
  const systemTokens = countTokens(req.messages[0]?.role === "system" ? req.messages[0].content : "");
  const cachedTokens = req.systemCacheHit ? systemTokens : 0;
  return {
    ...res,
    inputTokens,
    outputTokens,
    cachedTokens,
    costUSD: res.provider === "mock" ? res.costUSD : priceUSD(inputTokens, outputTokens, cachedTokens),
  };
}

export async function complete(llm: LlmClient, req: LlmRequest): Promise<LlmResponse> {
  assertCacheKey(req);
  const res = await llm(req);
  return withMeasuredCost(req, res);
}
