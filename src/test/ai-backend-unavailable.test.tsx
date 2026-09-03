import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DocConsolidator } from "@/components/tools/DocConsolidator";

// Supabase is configured, but the edge function reports that no provider API
// key exists. The UI must disable AI actions and surface the reason.
vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: {
          ok: false,
          reason: "No provider API key is configured (VENICE_API_KEY, OPENROUTER_API_KEY, or LOVABLE_API_KEY).",
        },
        error: null,
      }),
    },
  },
}));

afterEach(() => {
  cleanup();
});

describe("AI backend reports unhealthy", () => {
  it("shows the unavailable banner and explains why", async () => {
    render(<DocConsolidator />);
    expect(screen.getByText("Documentation Consolidator")).toBeInTheDocument();
    expect(await screen.findByText(/AI backend unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/No provider API key is configured/i)).toBeInTheDocument();
  });
});
