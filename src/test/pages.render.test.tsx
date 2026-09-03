import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "@/pages/Index";
import Blog from "@/pages/Blog";
import BlogPost from "@/pages/BlogPost";
import Community from "@/pages/Community";
import Documentation from "@/pages/Documentation";
import PlatformDocs from "@/pages/PlatformDocs";
import Tools from "@/pages/Tools";
import NotFound from "@/pages/NotFound";

// Mock the AI edge function so health checks resolve instantly as "available"
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

const renderPage = (ui: React.ReactNode, route = "/") =>
  render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  );

beforeEach(() => {
  localStorage.setItem("age_verified", "1");
});

afterEach(() => {
  cleanup();
});

describe("Directory page", () => {
  it("renders the new taxonomy, content levels, and added platforms", () => {
    renderPage(<Index />);
    expect(screen.getByText("NSFW AI Chatbot Directory")).toBeInTheDocument();
    // New six-category taxonomy — category single-select controls
    expect(screen.getByRole("radio", { name: /Local Frontends/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Hosted RP Platforms/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Companion Apps/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Model Providers/ })).toBeInTheDocument();
    // Newly added platforms
    expect(screen.getByText("Kindroid")).toBeInTheDocument();
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    expect(screen.getByText("Replika")).toBeInTheDocument();
    // No affiliate page anywhere in nav
    expect(screen.queryByText(/affiliate/i)).not.toBeInTheDocument();
  });

  it("supports the compare multi-select view", () => {
    renderPage(<Index />);
    fireEvent.click(screen.getByLabelText("Add Kindroid to comparison"));
    fireEvent.click(screen.getByLabelText("Add OpenRouter to comparison"));
    const compareButton = screen.getByRole("button", { name: /Compare \(2\)/ });
    expect(compareButton).toBeInTheDocument();
    fireEvent.click(compareButton);
    expect(screen.getByText("Compare Platforms")).toBeInTheDocument();
    // Comparison table shows shared attributes
    expect(screen.getByText("Context window")).toBeInTheDocument();
    expect(screen.getByText("API access")).toBeInTheDocument();
  });
});

describe("Blog", () => {
  it("shows real published articles with no placeholders", () => {
    renderPage(<Blog />);
    expect(screen.getByText("SillyTavern vs RisuAI: Which Frontend Should You Run?")).toBeInTheDocument();
    expect(screen.getByText("How to Create the Perfect Character Card (V2 & V3)")).toBeInTheDocument();
    expect(screen.queryByText(/Coming Soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/launching soon/i)).not.toBeInTheDocument();
  });

  it("renders a full article page", () => {
    renderPage(
      <Routes>
        <Route path="/blog/:id" element={<BlogPost />} />
      </Routes>,
      "/blog/sillytavern-vs-risuai",
    );
    expect(screen.getByText("SillyTavern vs RisuAI: Which Frontend Should You Run?")).toBeInTheDocument();
    expect(screen.getByText("Setup and first impressions")).toBeInTheDocument();
    expect(screen.getByText("The verdict")).toBeInTheDocument();
  });
});

describe("Community", () => {
  it("includes webring, Discord, and submission form", () => {
    renderPage(<Community />);
    // Webring appears in both the community grid and the footer link
    // Webring and Discord appear in both the community grid and the footer links
    expect(screen.getAllByText("Chatbots Webring").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SillyTavern Discord").length).toBeGreaterThan(0);
    expect(screen.getByText("/aicg/ — AI Chat & Girls")).toBeInTheDocument();
    expect(screen.getByText("Submit a Platform")).toBeInTheDocument();
  });
});

describe("Documentation", () => {
  it("renders the hub and platform guide with TOC + quick facts", () => {
    renderPage(<Documentation />);
    expect(screen.getByText("Documentation Hub")).toBeInTheDocument();
    expect(screen.getByText("Platforms with Full Guides (16)")).toBeInTheDocument();
  });

  it("renders a platform doc with in-page TOC, quick facts, and reviewed date", () => {
    renderPage(
      <Routes>
        <Route path="/docs/:slug" element={<PlatformDocs />} />
      </Routes>,
      "/docs/sillytavern",
    );
    expect(screen.getByText("On this page")).toBeInTheDocument();
    // TOC link + section heading share the same label
    expect(screen.getAllByText("Quick Facts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Setup Guide").length).toBeGreaterThan(0);
    expect(screen.getByText(/Guide reviewed 2026-08/)).toBeInTheDocument();
    expect(screen.getByText("Open key")).toBeInTheDocument(); // API access quick fact
  });

  it("renders the new OpenRouter doc with API config", () => {
    renderPage(
      <Routes>
        <Route path="/docs/:slug" element={<PlatformDocs />} />
      </Routes>,
      "/docs/openrouter",
    );
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    expect(screen.getAllByText("API Configuration").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/openrouter.ai\/api\/v1/).length).toBeGreaterThan(0);
  });

  it("renders the Replika doc with an honest policy-history section", () => {
    renderPage(
      <Routes>
        <Route path="/docs/:slug" element={<PlatformDocs />} />
      </Routes>,
      "/docs/replika",
    );
    expect(screen.getByText("Replika")).toBeInTheDocument();
    expect(screen.getAllByText("Policy History").length).toBeGreaterThan(0);
    expect(screen.getByText(/February 2023/i)).toBeInTheDocument();
  });
});

describe("Tools", () => {
  it("renders the doc consolidator with URL input and working tabs", () => {
    renderPage(<Tools />);
    expect(screen.getByText("Documentation Consolidator")).toBeInTheDocument();
    expect(screen.getByText("Fetch Documentation from URL")).toBeInTheDocument();
    // No AI-unavailable banner when backend is healthy
    expect(screen.queryByText(/AI backend unavailable/i)).not.toBeInTheDocument();

    // Character Card Builder tab exposes the new list editors
    // (Radix Tabs activates on mouseDown)
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Character Builder/i }));
    expect(screen.getByText("Alternate Greetings")).toBeInTheDocument();
    expect(screen.getByText("Add alternate greeting")).toBeInTheDocument();
    expect(screen.getByText("Character Version")).toBeInTheDocument();

    // Prompt Builder tab exposes renamed templates (no "Jailbreak" label)
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Prompt Builder/i }));
    expect(screen.getByText("Filter Override — Basic")).toBeInTheDocument();
    expect(screen.getByText("Unrestricted Mode — Advanced")).toBeInTheDocument();
    expect(screen.queryByText(/Jailbreak/i)).not.toBeInTheDocument();
  });
});

describe("NotFound", () => {
  it("renders a 404", () => {
    renderPage(<NotFound />, "/does-not-exist");
    expect(screen.getByText("404")).toBeInTheDocument();
  });
});