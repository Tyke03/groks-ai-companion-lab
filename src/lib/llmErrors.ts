/** Clarify multi-provider LLM cascade failures for toasts. */
export function formatLlmCascadeError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "");
  if (!msg.trim()) return "AI generation failed.";

  const stripped = msg.replace(/^All LLM providers failed(?: whole-card JSON)?\.?\s*/i, "");
  const parts = stripped.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);

  const clarify = (part: string): string => {
    const providerMatch = part.match(/^(Venice|OpenRouter|Lovable)\s*:\s*(.*)$/i);
    const provider = providerMatch?.[1] ?? "";
    const detail = providerMatch?.[2] ?? part;

    if (/429|rate.?limit/i.test(detail)) {
      return provider ? `${provider} rate-limited` : "Provider rate-limited";
    }
    if (/returned empty|\(0 chars\)/i.test(detail) || /truncated\/incomplete JSON \(0 chars\)/i.test(detail)) {
      return provider ? `${provider} returned empty` : "Provider returned empty";
    }
    if (/truncated|incomplete JSON/i.test(detail)) {
      return provider ? `${provider} truncated JSON` : "Truncated JSON";
    }
    if (/invalid JSON/i.test(detail)) {
      return provider ? `${provider} invalid JSON` : "Invalid JSON";
    }
    return provider ? `${provider}: ${detail}` : part;
  };

  if (parts.length > 0 && /Venice|OpenRouter|Lovable/i.test(msg)) {
    return parts.map(clarify).join("; ");
  }

  if (/429|rate.?limit/i.test(msg)) return "Venice rate-limited; try again in a moment.";
  return msg;
}
