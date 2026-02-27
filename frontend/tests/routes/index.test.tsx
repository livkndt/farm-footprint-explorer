import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HomePage from "../../app/routes/index";

describe("HomePage", () => {
  it("renders the main heading", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "Farm Footprint Explorer", level: 1 })
    ).toBeInTheDocument();
  });
});
