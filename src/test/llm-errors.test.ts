import { describe, expect, it } from "vitest";
import { formatLlmCascadeError } from "@/lib/llmErrors";

describe("formatLlmCascadeError", () => {
  it("clarifies Venice 429 and empty OpenRouter", () => {
    const raw =
      "All LLM providers failed whole-card JSON. Venice: LLM API error: 429 | OpenRouter: truncated/incomplete JSON (0 chars)";
    expect(formatLlmCascadeError(raw)).toBe("Venice rate-limited; OpenRouter returned empty");
  });

  it("clarifies rate-limited clarifyFailure style messages", () => {
    const raw =
      "All LLM providers failed whole-card JSON. Venice: rate-limited (429) | OpenRouter: returned empty (0 chars)";
    expect(formatLlmCascadeError(raw)).toBe("Venice rate-limited; OpenRouter returned empty");
  });

  it("passes through unrelated messages", () => {
    expect(formatLlmCascadeError("boom")).toBe("boom");
  });
});
