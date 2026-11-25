import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CharacterCardBuilder } from "@/components/tools/CharacterCardBuilder";
import { buildFieldContextPayload, runStagedGeneration, seedStrength } from "@/lib/cardGeneratePipeline";
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

  it("cold-starts staged generation in stage order with CompanionBrief, carrying conversation history and surfacing Venice badge (V2)", async () => {
    const seenCalls: { fieldName: string; history: Array<{ role: string; content: string }> }[] = [];

    invokeMock.mockImplementation(async (_fn: string, opts: { body: Record<string, unknown> }) => {
      const field = String(opts.body.fieldName || "");
      seenCalls.push({
        fieldName: field,
        history: (opts.body.history as Array<{ role: string; content: string }>) || [],
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

    const expectedOrder = [
      "description",
      "personality",
      "scenario",
      "first_mes",
      "system_prompt",
      "mes_example",
      "alternate_greetings",
      "creator_notes",
      "post_history_instructions",
    ];
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(expectedOrder.length));

    expect(seenCalls.map((c) => c.fieldName)).toEqual(expectedOrder);

    // Multi-turn path: every call uses stage-turn and history grows by 2 per stage (context + pairs)
    for (const call of seenCalls) {
      expect(call.history.length).toBeGreaterThanOrEqual(1);
    }
    expect(invokeMock.mock.calls.every((c) => c[1].body.action === "stage-turn")).toBe(true);

    // Stage 3 (scenario) history carries Stage 1-2 turns (description + personality) and pinned name/tags seed
    const scenarioCall = seenCalls.find((c) => c.fieldName === "scenario")!;
    const historyText = scenarioCall.history.map((t) => t.content).join("\n");
    expect(historyText).toContain("Generated description for {{user}}");
    expect(historyText).toContain("Generated personality for {{user}}");
    expect(historyText).toContain("Vespera");

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
      "<START>\n{{user}}: \"Hello?\"\n{{char}}: *glances up* State your business with {{user}}.",
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

  it("supports 4-state per-field Lock/Context toggles and prevents self-anchoring in Fresh Roll", async () => {
    invokeMock.mockImplementation(async (_fn: string, opts: { body: Record<string, unknown> }) => ({
      data: { result: `Fresh ${String(opts.body.fieldName)}`, fieldName: opts.body.fieldName, provider: "venice" },
      error: null,
    }));

    render(<CharacterCardBuilder />);

    // Typing manually auto-locks as Pinned Anchor; unlocking turns it into Seed & Rewrite
    fireEvent.change(screen.getByLabelText(/^Description/i), { target: { value: "Raw seed dump about Mira" } });
    expect(screen.getByTestId("field-policy-state-description")).toHaveTextContent("Pinned Anchor");
    expect(screen.getByTestId("generate-field-description")).toBeDisabled();

    // Unlock -> Seed & Rewrite (passes target field in existingFields)
    fireEvent.click(screen.getByTestId("field-lock-description"));
    expect(screen.getByTestId("field-policy-state-description")).toHaveTextContent("Seed & Rewrite");
    expect(screen.getByTestId("generate-field-description")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("generate-field-description"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][1].body.existingFields.description).toBe("Raw seed dump about Mira");

    // Exclude context -> Fresh Roll (omits target field completely)
    fireEvent.click(screen.getByTestId("field-context-description"));
    expect(screen.getByTestId("field-policy-state-description")).toHaveTextContent("Fresh Roll");

    fireEvent.click(screen.getByTestId("generate-field-description"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock.mock.calls[1][1].body.existingFields.description).toBeUndefined();

    // Lock + Exclude -> Isolated (disables AI Generate and omits from sibling context)
    fireEvent.click(screen.getByTestId("field-lock-description"));
    expect(screen.getByTestId("field-policy-state-description")).toHaveTextContent("Isolated");
    expect(screen.getByTestId("generate-field-description")).toBeDisabled();

    fireEvent.click(screen.getByTestId("generate-field-personality"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(3));
    expect(invokeMock.mock.calls[2][1].body.existingFields.description).toBeUndefined();
  });

  it("opens Whole-Card Launch Popup when content exists and honors Empty-Only vs Rewrite-Unlocked", async () => {
    invokeMock.mockImplementation(async (_fn: string, opts: { body: Record<string, unknown> }) => ({
      data: {
        result: opts.body.fieldName === "alternate_greetings" ? ["A", "B", "C"] : `Gen ${String(opts.body.fieldName)}`,
        fieldName: opts.body.fieldName,
        provider: "venice",
      },
      error: null,
    }));

    render(<CharacterCardBuilder />);
    fireEvent.change(screen.getByLabelText(/^Description/i), { target: { value: "Existing core bio" } });

    fireEvent.click(screen.getByTestId("generate-staged-button"));
    expect(await screen.findByTestId("whole-card-gen-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("whole-card-mode-empty-only"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("run-provider-summary")).toBeInTheDocument());

    const calledFields = invokeMock.mock.calls.map((c) => c[1].body.fieldName);
    expect(calledFields).not.toContain("description");
    expect((screen.getByLabelText(/^Description/i) as HTMLTextAreaElement).value).toBe("Existing core bio");
  });

  it("detects unstructured blob on import and blocks unlocked downstream fields from feeding upstream", async () => {
    const longBlob = "A".repeat(1600) + " raw character lore without headers.";
    const importPayload = JSON.stringify({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Kael",
        description: longBlob,
        personality: "Stoic pilot",
        scenario: "Orbital dock",
        first_mes: "Docking bay four.",
        mes_example: "<START>\n{{user}}: Hi\n{{char}}: Stale example",
      },
    });

    render(<CharacterCardBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /Import \(Text\)/i }));
    fireEvent.change(screen.getByLabelText("Character Card JSON"), { target: { value: importPayload } });
    fireEvent.click(screen.getByRole("button", { name: /^Import$/i }));

    await waitFor(() => expect(screen.getByTestId("field-policy-state-description")).toHaveTextContent("Seed & Rewrite"));
    expect(screen.getByTestId("field-policy-state-personality")).toHaveTextContent("Pinned Anchor");
    expect(screen.getByTestId("field-policy-state-mes_example")).toHaveTextContent("Isolated");

    // Unlocked downstream mes_example does not pollute upstream personality context
    const baseCard = {
      ...emptyCardData(),
      name: "Kael",
      description: "Structured desc",
      personality: "Stoic",
      mes_example: "<START>\n{{user}}: Hi\n{{char}}: Old dialogue",
    };
    const filtered = buildFieldContextPayload(
      baseCard,
      {
        name: { locked: true, useAsContext: true },
        description: { locked: true, useAsContext: true },
        personality: { locked: false, useAsContext: false },
        mes_example: { locked: false, useAsContext: true },
      },
      { targetField: "personality" },
    );
    expect(filtered.existingFields.mes_example).toBeUndefined();

    // Locked downstream anchor IS deliberately allowed to steer upstream
    const anchored = buildFieldContextPayload(
      baseCard,
      {
        name: { locked: true, useAsContext: true },
        description: { locked: true, useAsContext: true },
        personality: { locked: false, useAsContext: false },
        mes_example: { locked: true, useAsContext: true },
      },
      { targetField: "personality" },
    );
    expect(anchored.existingFields.mes_example).toContain("Old dialogue");
  });
});
