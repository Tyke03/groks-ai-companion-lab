import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { hasByok } from "@/lib/aiProvider";

export type AiBackendStatus = "checking" | "available" | "unavailable";

export interface AiBackendProviders {
  venice: boolean;
  openrouter: boolean;
  oneprovider: boolean;
}

export interface AiBackendState {
  status: AiBackendStatus;
  /** Human-readable explanation when status is "unavailable". */
  reason: string | null;
  /** True when the visitor supplied any BYOK key (Venice, OpenRouter, or OneProvider). */
  hasByok: boolean;
  /** True when AI can run via the Hub's shared server key(s). */
  hasServerKey: boolean;
  /** Configured server providers reported by the edge function health endpoint. */
  providers?: AiBackendProviders;
  /** Re-read stored BYOK keys and re-probe the backend. */
  refresh: () => void;
}

/**
 * Probes the Venice AI edge function once on mount and reports whether AI
 * generation can run. Tools use this to degrade gracefully: manual features
 * (editing, export, import) always work; AI buttons are disabled with a clear
 * explanation only when neither the shared backend nor a visitor key is usable.
 */
export function useAiBackendStatus(): AiBackendState {
  const [visitorHasByok, setVisitorHasByok] = useState<boolean>(() => hasByok());
  const [hasServerKey, setHasServerKey] = useState(false);
  const [providers, setProviders] = useState<AiBackendProviders | undefined>(undefined);
  const [status, setStatus] = useState<AiBackendStatus>("checking");
  const [reason, setReason] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    setVisitorHasByok(hasByok());
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");
    setReason(null);

    if (!isSupabaseConfigured || !supabase) {
      setHasServerKey(false);
      setProviders(undefined);
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
        const data = result.data as {
          ok?: boolean;
          reason?: string;
          shared?: AiBackendProviders;
          providers?: AiBackendProviders;
        } | null;
        const sharedProviders = data?.shared ?? data?.providers;
        if (sharedProviders) setProviders(sharedProviders);

        if (!result.error && data?.ok) {
          setHasServerKey(true);
          setStatus("available");
          setReason(null);
          return;
        }
        setHasServerKey(false);
        if (visitorHasByok) {
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
        if (visitorHasByok) {
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
  }, [visitorHasByok, nonce]);

  return { status, reason, hasByok: visitorHasByok, hasServerKey, providers, refresh };
}
