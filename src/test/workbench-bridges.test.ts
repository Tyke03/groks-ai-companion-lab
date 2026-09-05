import { describe, it, expect, beforeEach } from "vitest";
import {
  WORKBENCH_BRIDGE_KEY,
  appendBridgeToNotes,
  buildBridgeSummary,
  consumeWorkbenchBridge,
  peekWorkbenchBridge,
  stashWorkbenchBridge,
  toolsTabPath,
} from "@/lib/workbenchBridges";

beforeEach(() => {
  sessionStorage.clear();
});

describe("workbenchBridges", () => {
  it("stashes and consumes a character handoff once", () => {
    stashWorkbenchBridge({
      target: "character",
      serviceName: "SillyTavern",
      summary: buildBridgeSummary("SillyTavern", "# Guide\nHello"),
    });
    expect(peekWorkbenchBridge()?.target).toBe("character");
    const consumed = consumeWorkbenchBridge("character");
    expect(consumed?.serviceName).toBe("SillyTavern");
    expect(consumed?.summary).toContain("SillyTavern");
    expect(sessionStorage.getItem(WORKBENCH_BRIDGE_KEY)).toBeNull();
    expect(consumeWorkbenchBridge("character")).toBeNull();
  });

  it("does not consume a mismatched target", () => {
    stashWorkbenchBridge({
      target: "prompts",
      serviceName: "Agnaistic",
      summary: "note",
    });
    expect(consumeWorkbenchBridge("character")).toBeNull();
    expect(peekWorkbenchBridge()?.target).toBe("prompts");
  });

  it("appendBridgeToNotes avoids duplicates", () => {
    expect(appendBridgeToNotes("", "A")).toBe("A");
    expect(appendBridgeToNotes("A", "B")).toBe("A\n\nB");
    expect(appendBridgeToNotes("A\n\nB", "B")).toBe("A\n\nB");
  });

  it("toolsTabPath builds honest query links", () => {
    expect(toolsTabPath("character")).toBe("/tools?tab=character");
    expect(toolsTabPath("lorebook")).toBe("/tools?tab=lorebook");
  });
});
