import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export type AiBackendStatus = "checking" | "available" | "unavailable";

export interface AiBackendState {
  status: AiBackendStatus;
  /** Human-readable explanation when status is "unavailable". */
  reason: string | null;
}

/**
 * Probes the Venice AI edge function once on mount and reports whether the
 * AI backend is reachable AND configured. Tools use this to degrade
 * gracefully: manual features (editing, export, import) always work; AI
 * buttons are disabled with a clear explanation when the backend is down or
 * unconfigured.
 */
export function useAiBackendStatus(): AiBackendState {
  const [state, setState] = useState<AiBackendState>({ status: "checking", reason: null });

  useEffect(() => {
    let cancelled = false;

    // Never construct a request against a missing/malformed Supabase config.
    if (!isSupabaseConfigured || !supabase) {
      setState({
        status: "unavailable",
        reason: "Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are missing or malformed).",
      });
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
          setState({ status: "available", reason: null });
        } else {
          setState({
            status: "unavailable",
            reason:
              (data?.reason as string | undefined) ||
              (result.error?.message as string | undefined) ||
              "The AI backend is not reachable.",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "unavailable",
            reason: error instanceof Error ? error.message : "The AI backend is not reachable.",
          });
        }
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
