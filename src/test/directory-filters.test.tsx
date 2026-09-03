import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "@/pages/Index";
import { chatbots } from "@/data/chatbots";

vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderPage = () =>
  render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter>
            <Index />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  );

const total = chatbots.length;
const countText = (n: number) => `${n} of ${total} platforms`;

beforeEach(() => {
  localStorage.setItem("age_verified", "1");
});

afterEach(() => {
  cleanup();
});

describe("Directory filter controls", () => {
  it("shows a live result count and a dynamic total", () => {
    renderPage();
    expect(screen.getByText(countText(total))).toBeInTheDocument();
  });

  it("renders category and content as single-select radios", () => {
    renderPage();
    expect(screen.getByRole("radio", { name: /All \(\d+\)/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "SFW only" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Unfiltered \/ NSFW/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Toggleable" })).toBeInTheDocument();
  });

  it("content single-select is mutually exclusive", () => {
    renderPage();
    const sfw = screen.getByRole("radio", { name: "SFW only" });
    const unfiltered = screen.getByRole("radio", { name: /Unfiltered \/ NSFW/ });
    fireEvent.click(sfw);
    expect(screen.getByRole("radio", { name: "SFW only" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Unfiltered \/ NSFW/ })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(unfiltered);
    expect(screen.getByRole("radio", { name: "SFW only" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /Unfiltered \/ NSFW/ })).toHaveAttribute("aria-checked", "true");
  });

  it("features are multi-select toggles", () => {
    renderPage();
    const image = screen.getByRole("button", { name: "Image" });
    const voice = screen.getByRole("button", { name: "Voice/TTS" });
    fireEvent.click(image);
    fireEvent.click(voice);
    expect(image).toHaveAttribute("aria-pressed", "true");
    expect(voice).toHaveAttribute("aria-pressed", "true");
    // AND semantics: the grid shows only platforms that have BOTH image + voice.
    const expected = chatbots.filter((b) => b.hasImageGen === true && b.hasVoice === true).length;
    expect(screen.getByText(countText(expected))).toBeInTheDocument();
  });

  it("clear-all resets filters and removes active chips", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: /Local Frontends/ }));
    expect(screen.getByLabelText("Remove Local Frontends filter")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByLabelText("Remove Local Frontends filter")).not.toBeInTheDocument();
    expect(screen.getByText(countText(total))).toBeInTheDocument();
  });

  it("shows a no-results state with a clear-filters action", () => {
    renderPage();
    // Selecting all four features can never be satisfied (AND semantics).
    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.click(screen.getByRole("button", { name: "Voice/TTS" }));
    fireEvent.click(screen.getByRole("button", { name: "Group chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Multi-modal" }));
    expect(screen.getByText("No platforms match your search and filters.")).toBeInTheDocument();    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("exposes the mobile filters trigger", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Filters/ })).toBeInTheDocument();
  });
});
