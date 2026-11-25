export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmRequest {
  stage: string;
  field?: string;
  model: string;
  messages: LlmMessage[];
  temperature: number;
  topP: number;
  maxCompletionTokens: number;
  reasoningEffort?: string;
  frequencyPenalty: number;
  presencePenalty: number;
  schemaName?: string;
  schema?: object;
  seed: number;
  promptCacheKey: string;
  attempt: number;
  /** True after this card has already paid fresh rates for the frozen system prompt. */
  systemCacheHit?: boolean;
}

export interface LlmResponse {
  content: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUSD: number;
}

export type LlmClient = (req: LlmRequest) => Promise<LlmResponse>;

export function stageSeed(cardId: string, field: string, attempt: number): number {
  let h = 2166136261;
  const s = `${cardId}:${field}:${attempt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function parseModelJson(content: string): unknown {
  let text = content.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(text);
}
