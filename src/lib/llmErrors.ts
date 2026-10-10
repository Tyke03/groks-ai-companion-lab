/** Clarify multi-provider LLM cascade failures for toasts. */
export function formatLlmCascadeError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "");
  if (!msg.trim()) return "AI generation failed.";

  const stripped = msg.replace(/^All LLM providers failed(?: whole-card JSON)?\.?\s*/i, "");
  const parts = stripped.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);

  const clarify = (part: string): string => {
    const providerMatch = part.match(/^(OneProvider|Venice|OpenRouter)\s*:\s*(.*)$/i);
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
    if (/401|unauthor|invalid.?key|no auth/i.test(detail)) {
      return provider ? `${provider} rejected the API key` : "Provider rejected the API key";
    }
    return provider ? `${provider}: ${detail}` : part;
  };

  if (parts.length > 0 && /OneProvider|Venice|OpenRouter/i.test(msg)) {
    return parts.map(clarify).join("; ");
  }

  if (/429|rate.?limit/i.test(msg)) return "Rate-limited; try again in a moment, or add your own OpenRouter key.";
  return msg;
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Prefer edge JSON `{ error }` over opaque Supabase "non-2xx" invoke messages. */
export async function edgeInvokeError(error: unknown, data: unknown): Promise<string> {
  if (data && typeof data === "object" && data !== null && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (e != null && String(e).trim()) return String(e);
  }
  const ctx = error && typeof error === "object" && error !== null && "context" in error
    ? (error as { context?: unknown }).context
    : undefined;
  if (ctx && typeof ctx === "object" && ctx !== null && "json" in ctx && typeof (ctx as { json: () => Promise<unknown> }).json === "function") {
    try {
      const body = await (ctx as { json: () => Promise<unknown> }).json();
      if (body && typeof body === "object" && body !== null && "error" in body) {
        const e = (body as { error?: unknown }).error;
        if (e != null && String(e).trim()) return String(e);
      }
    } catch {
      // ignore body parse failures
    }
  }
  const msg = errMsg(error);
  return msg || "Edge function failed";
}
