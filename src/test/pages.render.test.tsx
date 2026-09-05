import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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
  localStorage.setItem("discover_filters_open", "1");
});

afterEach(() => {
  cleanup();
});

describe("Directory page", () => {
  it("renders the new taxonomy, content levels, and added platforms", () => {
    renderPage(<Index />);
    expect(screen.getByRole("heading", { name: "AI Companion Hub" })).toBeInTheDocument();
    // Thesis lives in the hero <header> (banner); same phrase also appears in document title + footer.
    expect(
      within(screen.getByRole("banner")).getByText(/Verification-first directory and local workbench/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Browse platforms/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Compare platforms/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open workbench/i })).toBeInTheDocument();
    expect(screen.getByText("No hosted models")).toBeInTheDocument();
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

  it("supports the compare multi-select and routes to the Compare page", () => {
    renderPage(
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/compare" element={<div>Compare page destination</div>} />
      </Routes>,
    );
    fireEvent.click(screen.getByLabelText("Add Kindroid to comparison"));
    fireEvent.click(screen.getByLabelText("Add OpenRouter to comparison"));
    const compareButton = screen.getByRole("button", { name: /Compare \(2\)/ });
    expect(compareButton).toBeInTheDocument();
    fireEvent.click(compareButton);
    expect(screen.getByText("Compare page destination")).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: /Platforms with Full Guides \(\d+\)/ })).toBeInTheDocument();
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
    expect(screen.getByText(/Guide reviewed 2026-09-04/)).toBeInTheDocument();
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
  it("defaults to Character Card Builder and keeps working tabs", () => {
    renderPage(<Tools />);
    expect(screen.getByRole("heading", { name: "Local workbench" })).toBeInTheDocument();
    expect(screen.getByText("No credential collection")).toBeInTheDocument();

    // Character Card Builder is the default selected tool
    expect(screen.getByRole("tab", { name: /Character Card Builder/i })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Alternate Greetings")).toBeInTheDocument();
    expect(screen.getByText("Add alternate greeting")).toBeInTheDocument();
    expect(screen.getByText("Character Version")).toBeInTheDocument();
    // Doc Consolidator is not the default panel
    expect(screen.queryByText("Documentation Consolidator")).not.toBeInTheDocument();
    expect(screen.queryByText(/AI backend unavailable/i)).not.toBeInTheDocument();

    // Prompt Builder tab exposes lean library (no filter-override / unrestricted templates)
    // (Radix Tabs activates on mouseDown)
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Prompt Builder/i }));
    expect(screen.getByText("System — Jailbreak-neutral RP")).toBeInTheDocument();
    expect(screen.getByText("SillyTavern — Author's Note Preset")).toBeInTheDocument();
    expect(screen.queryByText("Filter Override — Basic")).not.toBeInTheDocument();
    expect(screen.queryByText("Unrestricted Mode — Advanced")).not.toBeInTheDocument();

    // Doc Consolidator remains available as a secondary tab
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Doc Consolidator/i }));
    expect(screen.getByText("Documentation Consolidator")).toBeInTheDocument();
    expect(screen.getByText("Optional: Fetch from URL")).toBeInTheDocument();
    expect(screen.getByText("Paste Documentation")).toBeInTheDocument();
  });
});

describe("NotFound", () => {
  it("renders a 404 inside site chrome", () => {
    renderPage(<NotFound />, "/does-not-exist");
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: /Return to the directory/i })).toBeInTheDocument();
    // Brand appears in nav logo link and footer; assert chrome via the nav link.
    expect(screen.getByRole("link", { name: /AI Companion Hub/i })).toBeInTheDocument();
  });
});
