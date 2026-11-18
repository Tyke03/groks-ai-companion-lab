import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import {
  BYOK_STORAGE_KEY,
  LEGACY_OPENROUTER_KEY_STORAGE,
  LEGACY_OPENROUTER_MODEL_STORAGE,
  MODEL_CACHE_KEY,
  MODEL_CACHE_TTL_MS,
  SEED_MODELS,
  clearAllByok,
  clearProvider,
  fetchModelCatalog,
  hasByok,
  loadByok,
  loadCachedCatalog,
  saveByok,
  withAiProvider,
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
    expect(withAiProvider(body)).toEqual(body);
    expect(withAiKey(body)).toEqual(body);
    expect(hasByok()).toBe(false);
  });

  it("saves, clears per-provider, and clears all across Venice, OpenRouter, and OneProvider", () => {
    saveByok({
      keys: {
        venice: "ven-1234567890",
        openrouter: "sk-or-v1-abc123456",
        oneprovider: "op-key-999999",
      },
      preferredProvider: "oneprovider",
      models: {
        venice: "custom-venice-model",
        openrouter: "sao10k/l3.3-euryale-70b",
        oneprovider: "grok-4.7",
      },
    });

    expect(hasByok()).toBe(true);
    const loaded = loadByok();
    expect(loaded.keys.venice).toBe("ven-1234567890");
    expect(loaded.keys.openrouter).toBe("sk-or-v1-abc123456");
    expect(loaded.keys.oneprovider).toBe("op-key-999999");
    expect(loaded.preferredProvider).toBe("oneprovider");

    const merged = withAiProvider({ action: "generate-field" });
    expect(merged.preferredProvider).toBe("oneprovider");
    expect(merged.byok).toEqual({
      venice: "ven-1234567890",
      openrouter: "sk-or-v1-abc123456",
      oneprovider: "op-key-999999",
    });
    expect(merged.models).toEqual({
      venice: ["custom-venice-model"],
      openrouter: ["sao10k/l3.3-euryale-70b"],
      oneprovider: ["grok-4.7"],
    });

    clearProvider("venice");
    expect(loadByok().keys.venice).toBeUndefined();
    expect(loadByok().keys.oneprovider).toBe("op-key-999999");

    clearAllByok();
    expect(hasByok()).toBe(false);
    expect(localStorage.getItem(BYOK_STORAGE_KEY)).toBeNull();
  });

  it("migrates legacy openrouter key storage seamlessly", () => {
    saveAiKey({ key: "sk-or-v1-legacy999", model: "gryphe/mythomax-l2-13b" });
    localStorage.removeItem(BYOK_STORAGE_KEY);
    localStorage.setItem(LEGACY_OPENROUTER_KEY_STORAGE, "sk-or-v1-legacy999");
    localStorage.setItem(LEGACY_OPENROUTER_MODEL_STORAGE, "gryphe/mythomax-l2-13b");
    const loaded = loadByok();
    expect(loaded.keys.openrouter).toBe("sk-or-v1-legacy999");
    expect(loaded.models.openrouter).toBe("gryphe/mythomax-l2-13b");
    expect(loadAiKey().key).toBe("sk-or-v1-legacy999");
  });
});

describe("aiProvider live model catalog caching (24h)", () => {
  it("fetches from edge list-models and caches for 24h unless force is true", async () => {
    invokeMock.mockResolvedValue({
      data: {
        models: {
          venice: [{ id: "zai-org-glm-4.7-flash", name: "GLM 4.7 Flash" }],
          openrouter: [{ id: "cognitivecomputations/dolphin-mistral-24b-venice-edition", name: "Venice Uncensored" }],
          oneprovider: [{ id: "grok-4.7", name: "Grok 4.7" }],
        },
        seeds: SEED_MODELS,
      },
      error: null,
    });

    const first = await fetchModelCatalog();
    expect(first.models.venice?.[0].id).toBe("zai-org-glm-4.7-flash");
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const second = await fetchModelCatalog();
    expect(second.models.openrouter?.[0].id).toContain("dolphin-mistral-24b");
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await fetchModelCatalog(undefined, true);
    expect(invokeMock).toHaveBeenCalledTimes(2);

    const cached = JSON.parse(localStorage.getItem(MODEL_CACHE_KEY) || "{}");
    cached.fetchedAt = Date.now() - MODEL_CACHE_TTL_MS - 1000;
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(cached));
    expect(loadCachedCatalog()).toBeNull();
  });
});

describe("AiKeySettings collapsed Advanced disclosure & seeded select", () => {
  it("shows Simple mode default, keeps Advanced closed, and swaps seeded select to live models", async () => {
    let resolveFetch!: (val: unknown) => void;
    invokeMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<AiKeySettings hasServerKey />);
    expect(screen.getByTestId("ai-mode-summary")).toHaveTextContent("Simple mode: using the shared backend");

    const toggle = screen.getByTestId("ai-advanced-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("ai-advanced-panel")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByTestId("ai-advanced-panel")).toBeInTheDocument();

    // Seed models appear immediately while live fetch is pending (never empty select)
    const veniceSelect = screen.getByTestId("model-select-venice") as HTMLSelectElement;
    expect(veniceSelect.options.length).toBeGreaterThan(0);
    expect(veniceSelect.options[0].value).toBe(SEED_MODELS.venice[0]);

    expect(screen.getByLabelText("Venice API key")).toBeInTheDocument();
    expect(screen.getByLabelText("OpenRouter API key")).toBeInTheDocument();
    expect(screen.getByLabelText("OneProvider API key")).toBeInTheDocument();
    expect(screen.getByLabelText("Preferred provider")).toBeInTheDocument();

    resolveFetch({
      data: {
        models: {
          venice: [{ id: "venice-live-model", name: "Venice Live" }],
          openrouter: [{ id: "or-live-model", name: "OR Live" }],
          oneprovider: [{ id: "op-live-model", name: "OP Live" }],
        },
        seeds: SEED_MODELS,
      },
      error: null,
    });

    await waitFor(() => {
      expect(Array.from(veniceSelect.options).some((o) => o.value === "venice-live-model")).toBe(true);
    });
  });
});
