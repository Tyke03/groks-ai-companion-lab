import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation, Routes, Route } from "react-router-dom";
import { GlobalSearch } from "@/components/GlobalSearch";

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

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const renderSearch = () =>
  render(
    <MemoryRouter>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <GlobalSearch />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

const openSearch = () => {
  renderSearch();
  fireEvent.click(screen.getByRole("button", { name: "Search the site" }));
  return screen.getByRole("combobox");
};

const selectedValue = () =>
  document.querySelector('[cmdk-item=""][aria-selected="true"]')?.getAttribute("data-value") ?? null;

const selectedTitle = () =>
  document.querySelector('[cmdk-item=""][aria-selected="true"]')?.textContent ?? null;

/** All platform-group item titles (excluding the "Show all/Show fewer" toggle). */
const platformTitles = () => {
  const heading = Array.from(document.querySelectorAll('[cmdk-group-heading=""]')).find(
    (h) => h.textContent === "Platforms",
  );
  const items = Array.from(
    heading?.parentElement?.querySelectorAll('[cmdk-item=""]') ?? [],
  );
  return items
    .map((el) => el.querySelector("span.block.truncate")?.textContent ?? "")
    .filter((t) => t.length > 0);
};

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  cleanup();
});

describe("GlobalSearch keyboard navigation", () => {
  it("auto-selects the first visible result for query 'ai'", () => {
    const input = openSearch();
    fireEvent.change(input, { target: { value: "ai" } });
    // First A-Z platform matching "ai" is Agnaistic.
    expect(selectedTitle()).toContain("Agnaistic");
  });

  it("ArrowDown advances selection and ArrowUp returns", () => {
    const input = openSearch();
    fireEvent.change(input, { target: { value: "ai" } });

    const first = selectedValue();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = selectedValue();
    expect(second).not.toBe(first);
    expect(second).toBeTruthy();

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(selectedValue()).toBe(first);
  });

  it("Enter invokes the selected item's navigation", () => {
    const input = openSearch();
    // "openrouter" selects the OpenRouter platform first (platform group leads),
    // and OpenRouter has a dedicated guide.
    fireEvent.change(input, { target: { value: "openrouter" } });
    expect(selectedTitle()).toContain("OpenRouter");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("location").textContent).toBe("/docs/openrouter");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("Escape closes the dialog", () => {
    const input = openSearch();
    fireEvent.change(input, { target: { value: "ai" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("GlobalSearch platform matching", () => {
  it('keeps TavernAI/RisuAI/Agnaistic, excludes SillyTavern, and stays A-Z for "ai"', () => {
    const input = openSearch();
    fireEvent.change(input, { target: { value: "ai" } });

    // Expand the platform group to see every match.
    const showAll = screen.getByText(/^Show all \d+ platforms$/);
    fireEvent.click(showAll);

    const titles = platformTitles();
    expect(titles).toContain("TavernAI");
    expect(titles).toContain("RisuAI");
    expect(titles).toContain("Agnaistic");
    // SillyTavern must not appear anywhere in the platform group.
    expect(titles.some((t) => t.startsWith("SillyTavern"))).toBe(false);

    // Deterministic A-Z ordering by platform name.
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);
  });
});
