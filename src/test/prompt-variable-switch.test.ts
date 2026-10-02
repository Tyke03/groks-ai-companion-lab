import { describe, expect, it } from "vitest";
import {
  filledUniqueKeys,
  preserveOverlappingVariables,
} from "@/lib/promptVariableSwitch";

describe("promptVariableSwitch", () => {
  it("preserves overlapping keys and lists unique filled keys to discard", () => {
    const current = {
      name: "Luna",
      tone: "warm",
      onlyOnA: "secret",
      emptyUnique: "  ",
    };
    const nextNames = ["name", "tone", "scenario"];
    expect(preserveOverlappingVariables(current, nextNames)).toEqual({
      name: "Luna",
      tone: "warm",
    });
    expect(filledUniqueKeys(current, nextNames)).toEqual(["onlyOnA"]);
  });

  it("returns no discard list when all filled keys overlap", () => {
    expect(filledUniqueKeys({ name: "A", tone: "B" }, ["name", "tone", "x"])).toEqual([]);
  });
});
