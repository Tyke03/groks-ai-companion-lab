import { describe, expect, it } from "vitest";
import type { Chatbot } from "@/data/chatbots";
import { buildWorkbenchSuggestions } from "@/lib/compareWorkbenchSuggestions";
import { toolsPlatformPath } from "@/lib/workbenchBridges";

function bot(partial: Partial<Chatbot> & Pick<Chatbot, "name" | "slug">): Chatbot {
  return {
    type: "Hosted",
    nsfwPolicy: "Unknown",
    contentLevel: 3,
    description: "test",
    category: "hosted",
    url: "https://example.com",
    docsAvailable: false,
    lastVerified: "2026-08",
    ...partial,
  };
}

describe("compareWorkbenchSuggestions", () => {
  it("stamps disclosed catalog fields verified and undisclosed unverified", () => {
    const suggestions = buildWorkbenchSuggestions(
      bot({
        name: "SillyTavern",
        slug: "sillytavern",
        cardFormat: "V1/V2/V3 PNG + JSON",
        memory: "Lorebooks / World Info",
        contextWindow: "Depends on backend",
        evidenceMetadata: { reviewStatus: "documented" },
      }),
    );
    const byLabel = Object.fromEntries(suggestions.map((s) => [s.label, s]));
    expect(byLabel["Card format"].trust).toBe("verified");
    expect(byLabel["Memory / lorebook"].trust).toBe("verified");
    expect(byLabel["Context length (catalog)"].trust).toBe("verified");
    expect(suggestions.every((s) => s.reason.length > 0)).toBe(true);
  });

  it("marks not-disclosed context as unverified suggestion (not a hard limit)", () => {
    const suggestions = buildWorkbenchSuggestions(
      bot({
        name: "Mystery",
        slug: "mystery",
        cardFormat: undefined,
        contextWindow: "Not disclosed",
      }),
    );
    const ctx = suggestions.find((s) => s.label.startsWith("Context"));
    expect(ctx?.trust).toBe("unverified");
    expect(ctx?.reason.toLowerCase()).toMatch(/not|unverified|do not treat as a hard limit/);
  });

  it("builds soft tools path with platform query", () => {
    expect(toolsPlatformPath(["sillytavern", "agnai"], "character")).toBe(
      "/tools?tab=character&platform=sillytavern%2Cagnai",
    );
  });
});
