import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CharacterCardBuilder } from "@/components/tools/CharacterCardBuilder";
import { STAGES, runStagedGeneration, seedStrength } from "@/lib/cardGeneratePipeline";
import { emptyCardData } from "@/lib/cardTypes";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/hooks/useAiBackend", () => ({
  useAiBackendStatus: () => ({
    status: "available",
    reason: null,
    hasByok: false,
    hasServerKey: true,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  invokeMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("CharacterCardBuilder canonical AI + R7 export sanitization", () => {
  it("sanitizes macros, speaker labels, and 'the user' before JSON export (R7)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CharacterCardBuilder />);

    fireEvent.change(screen.getByLabelText(/Character Name/i), { target: { value: "Roxy" } });
    fireEvent.change(screen.getByLabelText(/^Description/i), {
      target: { value: "You are the user's rival, watching {{User}}." },
    });
    fireEvent.change(screen.getByLabelText(/First Message/i), {
      target: { value: "User: Hey\nRoxy: *waves at the user*" },
    });

    fireEvent.click(screen.getByTestId("copy-json-button"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());

    const exported = JSON.parse(String(writeText.mock.calls[0][0]));
    expect(exported.data.description).toBe("{{char}} is {{user}}'s rival, watching {{user}}.");
    expect(exported.data.first_mes).toBe("{{user}}: Hey\n{{char}}: *waves at {{user}}*");
  });

  it("cold-starts staged generation in stage order with CompanionBrief, carrying previous stages and surfacing Venice badge (V2)", async () => {
    const seenCalls: { fieldName: string; existingFields: Record<string, unknown> }[] = [];

    invokeMock.mockImplementation(async (_fn: string, opts: { body: Record<string, unknown> }) => {
      const field = String(opts.body.fieldName || "");
      seenCalls.push({
        fieldName: field,
        existingFields: { ...(opts.body.existingFields as Record<string, unknown>) },
      });

      if (field === "alternate_greetings") {
        return {
          data: {
            result: [
              "*she taps the ledger*\n\"{{User}} arrived early.\"",
              "*she closes the shutter*\n\"Stay out of sight.\"",
              "*she slides a key across*\n\"Your move.\"",
            ],
            fieldName: field,
            provider: "venice",
          },
          error: null,
        };
      }
      if (field === "mes_example") {
        return {
          data: {
            result: "<START>\nUser: Hello?\nVespera: *glances up* State your business with the user.",
            fieldName: field,
            provider: "venice",
          },
          error: null,
        };
      }
      return {
        data: {
          result: `Generated ${field} for {{User}}`,
          fieldName: field,
          provider: "venice",
        },
        error: null,
      };
    });

    render(<CharacterCardBuilder />);

    // Cold-start card: Name + 4 tags + filled CompanionBrief
    fireEvent.change(screen.getByLabelText(/Character Name/i), { target: { value: "Vespera" } });
    fireEvent.change(screen.getByLabelText("Add tag"), { target: { value: "noir, archivist, slow-burn, mystery" } });
    fireEvent.keyDown(screen.getByLabelText("Add tag"), { key: "Enter" });

    fireEvent.click(screen.getByTestId("companion-brief-toggle"));
    fireEvent.change(screen.getByLabelText(/Setting & Genre/i), { target: { value: "Clocktower archive" } });
    fireEvent.change(screen.getByLabelText(/Role \/ Occupation/i), { target: { value: "Exiled archivist" } });
    fireEvent.change(screen.getByLabelText(/Tone Register/i), { target: { value: "Dry noir" } });
    fireEvent.change(screen.getByLabelText(/Target Reply Length/i), { target: { value: "2 paragraphs" } });
    fireEvent.change(screen.getByLabelText(/Voice Sample/i), { target: { value: "*taps brass watch* You're late." } });
    fireEvent.change(screen.getByLabelText(/Dynamic with/i), { target: { value: "Reluctant ally" } });
    fireEvent.change(screen.getByLabelText(/POV \/ Tense/i), { target: { value: "3rd person present" } });
    fireEvent.change(screen.getByLabelText(/^Language$/i), { target: { value: "English" } });
    fireEvent.click(screen.getByTestId("brief-content-level-4"));
    fireEvent.change(screen.getByLabelText(/Constraint \/ Required Beat/i), { target: { value: "Never apologizes first" } });

    expect(screen.getByTestId("seed-strength-badge")).toHaveTextContent("Seed: 100%");

    fireEvent.click(screen.getByTestId("generate-staged-button"));

    const expectedOrder = STAGES.flatMap((s) => s.fields.map((f) => String(f.field)));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(expectedOrder.length));

    expect(seenCalls.map((c) => c.fieldName)).toEqual(expectedOrder);

    // Stage 2 (scenario) receives Stage 1 (description + personality)
    const scenarioCall = seenCalls.find((c) => c.fieldName === "scenario")!;
    expect(scenarioCall.existingFields.description).toBe("Generated description for {{user}}");
    expect(scenarioCall.existingFields.personality).toBe("Generated personality for {{user}}");

    // Verify brief payload passed through
    expect(invokeMock.mock.calls[0][1].body.brief).toMatchObject({
      setting: "Clocktower archive",
      role: "Exiled archivist",
      contentLevel: 4,
      mustInclude: "Never apologizes first",
    });

    // Provider summary & per-field badges surface Venice
    expect(await screen.findByTestId("run-provider-summary")).toHaveTextContent("Served by Venice.");
    expect(screen.getByTestId("run-provider-summary")).not.toHaveTextContent("Fallback models produce weaker prose");
    expect(screen.getByTestId("field-provider-description")).toHaveTextContent("Venice");
    expect(screen.getByTestId("field-provider-first_mes")).toHaveTextContent("Venice");
    expect(screen.getByTestId("field-provider-alternate_greetings")).toHaveTextContent("Venice");

    // Verify sanitization of mes_example & alternate_greetings
    expect((screen.getByLabelText(/Example Dialogue/i) as HTMLTextAreaElement).value).toBe(
      "<START>\n{{user}}: Hello?\n{{char}}: *glances up* State your business with {{user}}.",
    );
  });

  it("shows fallback warning when a non-preferred provider answers (D8)", async () => {
    invokeMock.mockImplementation(async (_fn: string, opts: { body: Record<string, unknown> }) => {
      const field = String(opts.body.fieldName || "");
      return {
        data: {
          result: field === "alternate_greetings" ? ["One", "Two", "Three"] : `Fallback ${field}`,
          fieldName: field,
          provider: "openrouter",
        },
        error: null,
      };
    });

    render(<CharacterCardBuilder />);
    fireEvent.click(screen.getByTestId("generate-staged-button"));

    const summary = await screen.findByTestId("run-provider-summary");
    expect(summary).toHaveTextContent("Served by OpenRouter.");
    expect(summary).toHaveTextContent("Fallback models produce weaker prose — if this reads flat, check the cascade.");
  });

  it("supports RefinePopover single-field delta and records provider", async () => {
    invokeMock.mockResolvedValue({
      data: {
        result: "Sharper {{char}} description for {{user}}.",
        fieldName: "description",
        refined: true,
        provider: "venice-byok",
      },
      error: null,
    });

    render(<CharacterCardBuilder />);
    fireEvent.change(screen.getByLabelText(/^Description/i), { target: { value: "Initial {{User}} draft" } });

    const refineTrigger = screen.getByTestId("refine-field-description-trigger");
    fireEvent.click(refineTrigger);
    fireEvent.change(screen.getByTestId("refine-field-description-notes"), {
      target: { value: "Make it sharper" },
    });
    fireEvent.click(screen.getByTestId("refine-field-description-submit"));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const callBody = invokeMock.mock.calls[0][1].body;
    expect(callBody.action).toBe("generate-field");
    expect(callBody.fieldName).toBe("description");
    expect(callBody.refinementNotes).toBe("Make it sharper");
    expect(callBody.currentValue).toBe("Initial {{user}} draft");

    expect(await screen.findByTestId("field-provider-description")).toHaveTextContent("Venice · BYOK");
  });

  it("pipeline aborts cleanly when control.aborted is set", async () => {
    const control = { aborted: false };
    invokeMock.mockImplementation(async (_fn: string, opts: { body: Record<string, unknown> }) => {
      const field = String(opts.body.fieldName || "");
      if (field === "description") control.aborted = true;
      return {
        data: { result: `Draft ${field}`, fieldName: field, provider: "venice" },
        error: null,
      };
    });

    const res = await runStagedGeneration({
      card: { ...emptyCardData(), name: "Vespera" },
      brief: { setting: "Dock" },
      specVersion: "v2",
      control,
    });
    expect(res.aborted).toBe(true);
    expect(res.outcomes.filter((o) => o.status === "filled")).toHaveLength(1);
    expect(seedStrength({ setting: "Dock" })).toBe(10);
  });
});
