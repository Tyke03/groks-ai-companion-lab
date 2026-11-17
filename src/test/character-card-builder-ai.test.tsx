import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CharacterCardBuilder } from "@/components/tools/CharacterCardBuilder";

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

  it("runs staged generation across 3 stages with Author Brief and sanitized context", async () => {
    invokeMock.mockImplementation(async (_fn: string, opts: { body: Record<string, unknown> }) => {
      const field = String(opts.body.fieldName || "");
      if (field === "alternate_greetings") {
        return {
          data: {
            result: ["{{User}} arrives.", "Second opener.", "Third opener."],
            fieldName: field,
            provider: "venice",
          },
          error: null,
        };
      }
      return {
        data: {
          result: field === "name" ? "Vespera" : `Generated ${field} for {{User}}`,
          fieldName: field,
          provider: "venice",
        },
        error: null,
      };
    });

    render(<CharacterCardBuilder />);

    // Open Author Brief and fill concept
    fireEvent.click(screen.getByTestId("companion-brief-toggle"));
    fireEvent.change(screen.getByLabelText(/Concept \/ Premise/i), {
      target: { value: "Clockwork archivist" },
    });

    fireEvent.click(screen.getByTestId("generate-staged-button"));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(11));

    const firstCallBody = invokeMock.mock.calls[0][1].body;
    expect(firstCallBody.action).toBe("generate-field");
    expect(firstCallBody.brief).toEqual({ concept: "Clockwork archivist" });

    // Confirm sanitized result landed in fields (no uppercase {{User}})
    await waitFor(() => {
      expect((screen.getByLabelText(/Character Name/i) as HTMLInputElement).value).toBe("Vespera");
      expect((screen.getByLabelText(/^Description/i) as HTMLTextAreaElement).value).toBe(
        "Generated description for {{user}}",
      );
    });
  });
});
