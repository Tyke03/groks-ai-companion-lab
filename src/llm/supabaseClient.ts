import { supabase } from "@/integrations/supabase/client";
import { withAiProvider } from "@/lib/aiProvider";
import { edgeInvokeError } from "@/lib/llmErrors";
import { countTokens } from "../context/budgets";
import { priceUSD } from "../router/cost";
import type { LlmClient, LlmResponse } from "./types";

/** One Venice call for a pipeline stage. Keys stay on the edge function. */
export function createSupabaseLlm(): LlmClient {
  return async (req) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.functions.invoke("venice-ai", {
      body: withAiProvider({
        action: "pipeline-complete",
        fieldName: req.field ?? req.stage,
        stage: req.stage,
        model: req.model,
        messages: req.messages,
        temperature: req.temperature,
        top_p: req.topP,
        max_completion_tokens: req.maxCompletionTokens,
        reasoning_effort: req.reasoningEffort,
        frequency_penalty: req.frequencyPenalty,
        presence_penalty: req.presencePenalty,
        prompt_cache_key: req.promptCacheKey,
        seed: req.seed,
        response_format: req.schema
          ? { type: "json_schema", json_schema: { name: req.schemaName, strict: true, schema: req.schema } }
          : undefined,
      }),
    });
    if (error) throw new Error(await edgeInvokeError(error, data));
    if (data?.error) throw new Error(String(data.error));
    const raw = data?.result;
    if (raw === undefined || raw === null || raw === "") throw new Error("Empty result");
    const content = typeof raw === "string" ? raw : JSON.stringify(raw);
    const inputTokens = Number(data?.inputTokens) || req.messages.reduce((n, m) => n + countTokens(m.content), 0);
    const outputTokens = Number(data?.outputTokens) || countTokens(content);
    const cachedTokens = Number(data?.cachedTokens) || countTokens(req.messages[0]?.content ?? "");
    const response: LlmResponse = {
      content,
      provider: String(data?.provider || "venice"),
      inputTokens,
      outputTokens,
      cachedTokens,
      costUSD: typeof data?.costUSD === "number" ? data.costUSD : priceUSD(inputTokens, outputTokens, cachedTokens),
    };
    return response;
  };
}
