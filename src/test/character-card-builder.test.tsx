import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CharacterCardBuilder } from "@/components/tools/CharacterCardBuilder";
import { CARDS_STORAGE_KEY } from "@/lib/cardStorage";

vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

vi.mock("@/hooks/useAiBackend", () => ({
  useAiBackendStatus: () => ({ status: "unavailable", reason: "test" }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("CharacterCardBuilder multi-card + lossy V2", () => {
  it("keeps the first card after New card", () => {
    render(<CharacterCardBuilder />);
    const name = screen.getByLabelText(/Character Name/i);
    fireEvent.change(name, { target: { value: "Maya" } });
    expect((name as HTMLInputElement).value).toBe("Maya");

    fireEvent.click(screen.getByTestId("new-card-button"));
    const nameAfter = screen.getByLabelText(/Character Name/i) as HTMLInputElement;
    expect(nameAfter.value).toBe("");

    // Prior card remains in the local list
    expect(screen.getByRole("button", { name: "Maya" })).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem(CARDS_STORAGE_KEY) || "null");
    expect(stored.cards.some((c: { card: { name: string } }) => c.card.name === "Maya")).toBe(true);
  });

  it("requires confirm before lossy V2 export and does not copy until confirmed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CharacterCardBuilder />);

    // Enable V3 and fill a V3-only field
    fireEvent.click(screen.getByLabelText(/Use V3 draft format/i));
    const nickname = await screen.findByLabelText(/Nickname/i);
    fireEvent.change(nickname, { target: { value: "May" } });

    // Switch back to V2 (confirm spec switch)
    fireEvent.click(screen.getByLabelText(/Use V3 draft format/i));
    const specDialog = await screen.findByTestId("spec-switch-lossy-confirm");
    fireEvent.click(within(specDialog).getByTestId("spec-switch-confirm"));

    expect(screen.getByTestId("lossy-v2-hint")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("copy-json-button"));
    const confirm = await screen.findByTestId("lossy-v2-confirm");
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByTestId("lossy-v2-cancel"));
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("copy-json-button"));
    const confirm2 = await screen.findByTestId("lossy-v2-confirm");
    fireEvent.click(within(confirm2).getByTestId("lossy-v2-confirm-action"));
    expect(writeText).toHaveBeenCalled();
    const payload = String(writeText.mock.calls[0][0]);
    expect(payload).toContain("chara_card_v2");
    expect(payload).not.toContain('"nickname"');
  });

  it("shows PNG export disabled messaging without a portrait", () => {
    render(<CharacterCardBuilder />);
    const pngBtn = screen.getByTestId("export-png-button");
    expect(pngBtn).toBeDisabled();
    expect(screen.getByTestId("png-export-disabled-hint")).toHaveTextContent(/needs a portrait/i);
    expect(screen.getByTestId("png-keep-hint")).toHaveTextContent(/kept for this card by default/i);
  });

  it("keeps portrait label copy for optional replace", () => {
    render(<CharacterCardBuilder />);
    expect(screen.getByTestId("png-choose-button")).toHaveTextContent(/Choose image/i);
    expect(screen.getByTestId("png-portrait-panel")).toBeInTheDocument();
  });
});
