import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Compare from "@/pages/Compare";

beforeEach(() => {
  localStorage.setItem("age_verified", "1");
});

describe("Compare clear selection", () => {
  it("clears selected platforms with Clear selection", () => {
    render(
      <MemoryRouter initialEntries={["/compare?platforms=sillytavern,janitor-ai"]}>
        <Compare />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("compare-clear-selection")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("compare-clear-selection"));
    expect(screen.queryByTestId("compare-clear-selection")).not.toBeInTheDocument();
  });

  it("Clear all removes selection", () => {
    render(
      <MemoryRouter initialEntries={["/compare?platforms=sillytavern,janitor-ai"]}>
        <Compare />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("compare-clear-all"));
    expect(screen.queryByTestId("compare-clear-selection")).not.toBeInTheDocument();
  });
});
