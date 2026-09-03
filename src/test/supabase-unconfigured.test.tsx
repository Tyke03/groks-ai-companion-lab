import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DocConsolidator } from "@/components/tools/DocConsolidator";
import Community from "@/pages/Community";

// Simulate a build with no VITE_SUPABASE_* variables: the client must be null
// and every consumer must degrade without throwing.
vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

beforeEach(() => {
  localStorage.setItem("age_verified", "1");
});

afterEach(() => {
  cleanup();
});

describe("Supabase is not configured", () => {
  it("renders the Doc Consolidator without crashing and explains the AI backend is unavailable", async () => {
    render(<DocConsolidator />);
    expect(screen.getByText("Documentation Consolidator")).toBeInTheDocument();
    expect(await screen.findByText(/AI backend unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Supabase is not configured/i)).toBeInTheDocument();
  });

  it("renders the Community page and shows the gallery as read-only/unconfigured", async () => {
    render(
      <MemoryRouter>
        <Community />
      </MemoryRouter>,
    );
    expect(screen.getByText("Community & Resources")).toBeInTheDocument();
    expect(await screen.findByText(/isn't configured yet/i)).toBeInTheDocument();
  });
});
