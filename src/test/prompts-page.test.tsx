import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { TooltipProvider } from "@/components/ui/tooltip";
import Prompts from "@/pages/Prompts";

const customKey = "ai-companion-hub-custom-prompts";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("age_verified", "1");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => cleanup());

const renderPrompts = () => render(
  <HelmetProvider>
    <TooltipProvider>
      <MemoryRouter initialEntries={["/prompts"]}>
        <Prompts />
      </MemoryRouter>
    </TooltipProvider>
  </HelmetProvider>,
);

describe("Prompts page", () => {
  it("shows metadata and honest copy actions", () => {
    renderPrompts();

    expect(screen.getAllByText("Universal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Plain text").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Copy raw template" })).toHaveLength(18);
    expect(screen.getAllByRole("link", { name: "Open in Builder" })).toHaveLength(18);
    expect(screen.queryByRole("button", { name: "Open-source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Native web" })).not.toBeInTheDocument();

    const sillyTavernHeading = screen.getByRole("heading", { name: "SillyTavern — Author's Note Preset" });
    const card = sillyTavernHeading.closest("article");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("SillyTavern");
    expect(card).toHaveTextContent("Author's Note");
    expect(card).toHaveTextContent("Platform-native");
    expect(card).toHaveTextContent("{{user}}");

    fireEvent.click(card!.querySelector("button[aria-label^='Favorite']")!);
    fireEvent.click(screen.getAllByRole("button", { name: "Copy raw template" })[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("[Character Name]"));
  });

  it("loads a legacy local template as Universal and links it to the Builder", () => {
    localStorage.setItem(customKey, JSON.stringify([{
      id: "custom-legacy",
      name: "Legacy Local",
      category: "Custom",
      description: "Saved before metadata support",
      template: "Use {{topic}}.",
      variables: [],
    }]));

    renderPrompts();

    const heading = screen.getByRole("heading", { name: "Legacy Local" });
    const card = heading.closest("article");
    expect(card).toHaveTextContent("Universal");
    expect(card).toHaveTextContent("Plain text");
    expect(card).toHaveTextContent("User-created");
    expect(card).toHaveTextContent("[Topic]");
    expect(card?.querySelector("a")).toHaveAttribute("href", "/tools?tab=prompts&template=custom-legacy");
  });
});
