import { beforeEach, describe, expect, it } from "vitest";
import {
  PROMPT_DRAFT_KEY,
  clearPromptDraft,
  loadPromptDraft,
  savePromptDraft,
} from "@/lib/promptDraftStorage";
import {
  DOC_CONSOLIDATOR_DRAFT_KEY,
  clearDocConsolidatorDraft,
  loadDocConsolidatorDraft,
  saveDocConsolidatorDraft,
} from "@/lib/docConsolidatorDraftStorage";

beforeEach(() => {
  localStorage.clear();
});

describe("prompt draft localStorage round-trip", () => {
  it("saves and restores template, variables, raw context, and panel flag", () => {
    savePromptDraft({
      selectedTemplateId: "sillytavern-authors-note",
      variables: { character_name: "Maya", setting: "Neon Harbor" },
      rawContext: "[From Doc Consolidator] Service: SillyTavern",
      showRawContext: true,
    });

    expect(localStorage.getItem(PROMPT_DRAFT_KEY)).toBeTruthy();

    const loaded = loadPromptDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.selectedTemplateId).toBe("sillytavern-authors-note");
    expect(loaded?.variables).toEqual({
      character_name: "Maya",
      setting: "Neon Harbor",
    });
    expect(loaded?.rawContext).toContain("Doc Consolidator");
    expect(loaded?.showRawContext).toBe(true);
    expect(loaded?.version).toBe(1);
  });

  it("returns null for corrupt JSON and clear removes the key", () => {
    localStorage.setItem(PROMPT_DRAFT_KEY, "{not-json");
    expect(loadPromptDraft()).toBeNull();

    savePromptDraft({
      selectedTemplateId: "x",
      variables: {},
      rawContext: "",
      showRawContext: false,
    });
    clearPromptDraft();
    expect(localStorage.getItem(PROMPT_DRAFT_KEY)).toBeNull();
    expect(loadPromptDraft()).toBeNull();
  });

  it("ignores non-string variable values", () => {
    localStorage.setItem(
      PROMPT_DRAFT_KEY,
      JSON.stringify({
        version: 1,
        selectedTemplateId: "t1",
        variables: { ok: "yes", bad: 12, also: null },
        rawContext: "",
        showRawContext: false,
        updatedAt: 1,
      }),
    );
    expect(loadPromptDraft()?.variables).toEqual({ ok: "yes" });
  });
});

describe("doc consolidator draft localStorage round-trip", () => {
  it("saves and restores service selection, paste, url, and result draft", () => {
    saveDocConsolidatorDraft({
      serviceName: "custom",
      customName: "My Platform",
      inputText: "Install via npm. Requires Node 20.",
      docUrl: "https://docs.example.com/setup",
      result: "# My Platform\n\n## Overview\n",
      resultMode: "offline",
    });

    expect(localStorage.getItem(DOC_CONSOLIDATOR_DRAFT_KEY)).toBeTruthy();

    const loaded = loadDocConsolidatorDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.serviceName).toBe("custom");
    expect(loaded?.customName).toBe("My Platform");
    expect(loaded?.inputText).toContain("Install via npm");
    expect(loaded?.docUrl).toBe("https://docs.example.com/setup");
    expect(loaded?.result).toContain("# My Platform");
    expect(loaded?.resultMode).toBe("offline");
  });

  it("round-trips AI result mode and survives clear", () => {
    saveDocConsolidatorDraft({
      serviceName: "SillyTavern",
      customName: "",
      inputText: "notes",
      docUrl: "",
      result: "# Guide",
      resultMode: "ai",
    });
    expect(loadDocConsolidatorDraft()?.resultMode).toBe("ai");
    clearDocConsolidatorDraft();
    expect(loadDocConsolidatorDraft()).toBeNull();
  });

  it("treats invalid resultMode as null", () => {
    localStorage.setItem(
      DOC_CONSOLIDATOR_DRAFT_KEY,
      JSON.stringify({
        version: 1,
        serviceName: "x",
        customName: "",
        inputText: "",
        docUrl: "",
        result: "",
        resultMode: "weird",
        updatedAt: 1,
      }),
    );
    expect(loadDocConsolidatorDraft()?.resultMode).toBeNull();
  });
});
