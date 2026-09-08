import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RefinePopover } from "@/components/tools/RefinePopover";

afterEach(() => cleanup());

describe("RefinePopover", () => {
  it("submits notes and appends presets", () => {
    const onRefine = vi.fn();
    render(<RefinePopover onRefine={onRefine} data-testid="refine-test" />);
    fireEvent.click(screen.getByTestId("refine-test-trigger"));
    const input = screen.getByTestId("refine-test-notes");
    fireEvent.change(input, { target: { value: "more teasing" } });
    fireEvent.click(screen.getByTestId("refine-test-preset-More sarcastic"));
    expect((screen.getByTestId("refine-test-notes") as HTMLInputElement).value).toContain("more teasing");
    expect((screen.getByTestId("refine-test-notes") as HTMLInputElement).value).toContain("More sarcastic");
    fireEvent.click(screen.getByTestId("refine-test-submit"));
    expect(onRefine).toHaveBeenCalledWith(expect.stringContaining("more teasing"));
    expect(onRefine).toHaveBeenCalledWith(expect.stringContaining("More sarcastic"));
  });

  it("does not submit empty notes", () => {
    const onRefine = vi.fn();
    render(<RefinePopover onRefine={onRefine} data-testid="refine-empty" />);
    fireEvent.click(screen.getByTestId("refine-empty-trigger"));
    expect(screen.getByTestId("refine-empty-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("refine-empty-submit"));
    expect(onRefine).not.toHaveBeenCalled();
  });
});
