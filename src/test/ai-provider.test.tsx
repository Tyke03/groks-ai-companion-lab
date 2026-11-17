import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  AI_KEY_STORAGE,
  AI_PROVIDER_SETTINGS_STORAGE,
  MODEL_CATALOG_STORAGE,
  MODEL_CATALOG_TTL_MS,
  clearAiProviderKey,
  cleanCompanionBrief,
  emptyCompanionBrief,
  fetchModelCatalog,
  hasAnyByokKey,
  loadAiProviderSettings,
  loadCachedModelCatalog,
  saveAiProviderSettings,
  withAiProviderSettings,
} from "@/lib/aiProvider";
import { withAiKey, loadAiKey, saveAiKey } from "@/lib/aiKey";
import { AiKeySettings } from "@/components/tools/AiKeySettings";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

beforeEach(() => {
  localStorage.clear();
  invokeMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("aiProvider multi-provider BYOK settings", () => {
  it("returns clean passthrough when no BYOK keys or custom preferences exist", () => {
    const body = { action: "generate-field", fieldName: "description" };
    expect(withAiKey(body)).toEqual(body);
    expect(hasAnyByokKey()).toBe(false);
  });

  it("saves and clears keys across Venice, OpenRouter, and OneProvider", () => {
    saveAiProviderSettings({
      byok: {
        venice: "ven-1234567890",
        openrouter: "sk-or-v1-abc123456",
        oneprovider: "op-key-999999",
      },
      preferredProvider: "oneprovider",
      temperature: 0.9,
      models: {
        venice: "custom-venice-model",
        openrouter: ["sao10k/l3.3-euryale-70b"],
        oneprovider: ["grok-4.7"],
      },
    });

    expect(hasAnyByokKey()).toBe(true);
    const loaded = loadAiProviderSettings();
    expect(loaded.byok.venice).toBe("ven-1234567890");
    expect(loaded.byok.openrouter).toBe("sk-or-v1-abc123456");
    expect(loaded.byok.oneprovider).toBe("op-key-999999");
    expect(loaded.preferredProvider).toBe("oneprovider");
    expect(loaded.allowSharedFallback).toBe(false);
    expect(loaded.temperature).toBe(0.9);
    expect(localStorage.getItem(AI_KEY_STORAGE)).toBe("sk-or-v1-abc123456");

    const merged = withAiProviderSettings({ action: "generate-field" });
    expect(merged.preferredProvider).toBe("oneprovider");
    expect(merged.allowSharedFallback).toBe(false);
    expect(merged.temperature).toBe(0.9);
    expect(merged.byok).toEqual({
      venice: "ven-1234567890",
      openrouter: "sk-or-v1-abc123456",
      oneprovider: "op-key-999999",
    });

    clearAiProviderKey("venice");
    expect(loadAiProviderSettings().byok.venice).toBe("");
    expect(loadAiProviderSettings().byok.oneprovider).toBe("op-key-999999");
  });

  it("migrates legacy openrouter key storage seamlessly", () => {
    saveAiKey({ key: "sk-or-v1-legacy999", model: "gryphe/mythomax-l2-13b" });
    localStorage.removeItem(AI_PROVIDER_SETTINGS_STORAGE);
    const loaded = loadAiProviderSettings();
    expect(loaded.byok.openrouter).toBe("sk-or-v1-legacy999");
    expect(loaded.models.openrouter[0]).toBe("gryphe/mythomax-l2-13b");
    expect(loadAiKey().key).toBe("sk-or-v1-legacy999");
  });

  it("cleans CompanionBrief only returning non-empty fields", () => {
    const empty = emptyCompanionBrief();
    expect(cleanCompanionBrief(empty)).toBeUndefined();
    expect(
      cleanCompanionBrief({ ...empty, concept: "  Cyberpunk courier  ", tone: "  Noir  " }),
    ).toEqual({ concept: "Cyberpunk courier", tone: "Noir" });
  });
});

describe("aiProvider live model catalog caching (24h)", () => {
  it("fetches from edge list-models and caches for 24h unless forceRefresh is set", async () => {
    invokeMock.mockResolvedValue({
      data: {
        models: {
          venice: [{ id: "zai-org-glm-4.7-flash", name: "GLM 4.7 Flash" }],
          openrouter: [{ id: "cognitivecomputations/dolphin-mistral-24b-venice-edition", name: "Venice Uncensored" }],
          oneprovider: [{ id: "grok-4.7", name: "Grok 4.7" }],
        },
        provider: "edge",
      },
      error: null,
    });

    const first = await fetchModelCatalog();
    expect(first.venice[0].id).toBe("zai-org-glm-4.7-flash");
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const second = await fetchModelCatalog();
    expect(second.openrouter[0].id).toContain("dolphin-mistral-24b");
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await fetchModelCatalog({ forceRefresh: true });
    expect(invokeMock).toHaveBeenCalledTimes(2);

    // Expire cache manually and confirm stale cache returns null
    const cached = JSON.parse(localStorage.getItem(MODEL_CATALOG_STORAGE) || "{}");
    cached.fetchedAt = Date.now() - MODEL_CATALOG_TTL_MS - 1000;
    localStorage.setItem(MODEL_CATALOG_STORAGE, JSON.stringify(cached));
    expect(loadCachedModelCatalog()).toBeNull();
  });
});

describe("AiKeySettings collapsed Advanced disclosure", () => {
  it("starts with Advanced closed by default and expands to 3-provider controls", async () => {
    invokeMock.mockResolvedValue({
      data: { models: { venice: [], openrouter: [], oneprovider: [] }, provider: "edge" },
      error: null,
    });

    render(<AiKeySettings hasServerKey />);
    const toggle = screen.getByTestId("ai-advanced-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("ai-advanced-panel")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByTestId("ai-advanced-panel")).toBeInTheDocument();
    expect(screen.getByLabelText("Venice API key")).toBeInTheDocument();
    expect(screen.getByLabelText("OpenRouter API key")).toBeInTheDocument();
    expect(screen.getByLabelText("OneProvider API key")).toBeInTheDocument();
    expect(screen.getByLabelText("Preferred provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Temperature")).toBeInTheDocument();
  });
});
