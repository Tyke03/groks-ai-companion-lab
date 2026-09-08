import { describe, expect, it } from "vitest";
import { estimateCardTokens } from "@/lib/cardTokens";
import { emptyCardData, emptyPreserved } from "@/lib/cardTypes";

describe("card token groups", () => {
  it("splits Permanent vs First/Examples", () => {
    const card = {
      ...emptyCardData(),
      name: "A",
      description: "desc",
      first_mes: "hello",
      mes_example: "ex",
      system_prompt: "sys",
    };
    const estimate = estimateCardTokens(card, emptyPreserved());
    expect(estimate.groups.map((g) => g.id)).toEqual(["permanent", "first_examples"]);
    expect(estimate.groups.find((g) => g.id === "permanent")?.fields.some((f) => f.key === "system_prompt")).toBe(true);
    expect(estimate.groups.find((g) => g.id === "first_examples")?.fields.some((f) => f.key === "first_mes")).toBe(true);
    expect(estimate.total).toBeGreaterThan(0);
  });
});
