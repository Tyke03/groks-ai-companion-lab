import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { loadAiKey } from "@/lib/aiKey";

export type AiBackendStatus = "checking" | "available" | "unavailable";

export interface AiBackendState {
  status: AiBackendStatus;
  /** Human-readable explanation when status is "unavailable". */
  reason: string | null;
  /** True when the visitor supplied their own OpenRouter key (BYOK). */
  hasByok: boolean;
  /** True when AI can run via the Hub's shared server key. */
  hasServerKey: boolean;
  /** Re-read the stored BYOK key and re-probe the backend. */
  refresh: () => void;
}

/**
 * Probes the Venice AI edge function once on mount and reports whether AI
 * generation can run. Tools use this to degrade gracefully: manual features
 * (editing, export, import) always work; AI buttons are disabled with a clear
 * explanation only when neither the shared backend nor a visitor key is usable.
 *
 * A visitor-supplied OpenRouter key (BYOK, stored in this browser) enables AI
 * even when the Hub has no server provider key configured.
 */
export function useAiBackendStatus(): AiBackendState {
  const [hasByok, setHasByok] = useState<boolean>(() => {
    const stored = loadAiKey();
    return stored.key.trim().length > 0;
  });
  const [hasServerKey, setHasServerKey] = useState(false);
  const [status, setStatus] = useState<AiBackendStatus>("checking");
  const [reason, setReason] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    const stored = loadAiKey();
    setHasByok(stored.key.trim().length > 0);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");
    setReason(null);

    // Never construct a request against a missing/malformed Supabase config.
    // BYOK cannot help here: the edge function that proxies the key is unreachable.
    if (!isSupabaseConfigured || !supabase) {
      setHasServerKey(false);
      setStatus("unavailable");
      setReason("Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are missing or malformed).");
      return;
    }

    const check = async () => {
      try {
        const result = await Promise.race([
          supabase.functions.invoke("venice-ai", {
            body: { action: "health" },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("The AI backend timed out after 8 seconds.")), 8000),
          ),
        ]);
        if (cancelled) return;
        const data = result.data as { ok?: boolean; reason?: string } | null;
        if (!result.error && data?.ok) {
          setHasServerKey(true);
          setStatus("available");
          setReason(null);
          return;
        }
        setHasServerKey(false);
        // With a visitor key, AI still works even when the Hub has no server key.
        if (hasByok) {
          setStatus("available");
          setReason(null);
        } else {
          setStatus("unavailable");
          setReason(
            (data?.reason as string | undefined) ||
              (result.error?.message as string | undefined) ||
              "The AI backend is not reachable.",
          );
        }
      } catch (error) {
        if (cancelled) return;
        setHasServerKey(false);
        if (hasByok) {
          setStatus("available");
          setReason(null);
        } else {
          setStatus("unavailable");
          setReason(error instanceof Error ? error.message : "The AI backend is not reachable.");
        }
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [hasByok, nonce]);

  return { status, reason, hasByok, hasServerKey, refresh };
}