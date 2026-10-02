import { describe, it, expect } from "vitest";
import {
  buildOfflineGuideSkeleton,
  interpretConsolidateResponse,
} from "@/lib/docConsolidator";

describe("buildOfflineGuideSkeleton", () => {
  it("includes pasted notes in the markdown instead of discarding them", () => {
    const paste = "Install via npm. Requires Node 20.";
    const md = buildOfflineGuideSkeleton("SillyTavern", paste);
    expect(md).toContain("# SillyTavern");
    expect(md).toContain("## Pasted notes (source material)");
    expect(md).toContain("Install via npm. Requires Node 20.");
  });

  it("still produces a useful skeleton when paste is empty", () => {
    const md = buildOfflineGuideSkeleton("NovelAI", "   ");
    expect(md).toContain("# NovelAI");
    expect(md).toMatch(/No notes were pasted yet/i);
    expect(md).toContain("## Overview");
  });
});

describe("interpretConsolidateResponse", () => {
  it("treats empty string result as failure", () => {
    const outcome = interpretConsolidateResponse({ result: "" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/empty result/i);
  });

  it("treats whitespace-only result as failure", () => {
    expect(interpretConsolidateResponse({ result: "  \n\t " }).ok).toBe(false);
  });

  it("treats missing result as failure", () => {
    expect(interpretConsolidateResponse({}).ok).toBe(false);
    expect(interpretConsolidateResponse(null).ok).toBe(false);
  });

  it("returns trimmed text on success", () => {
    const outcome = interpretConsolidateResponse({ result: "  # Guide\n\nHello " });
    expect(outcome).toEqual({ ok: true, text: "# Guide\n\nHello" });
  });

  it("surfaces invoke errors", () => {
    expect(interpretConsolidateResponse({ result: "ignored" }, new Error("boom"))).toEqual({
      ok: false,
      error: "boom",
    });
  });
});
