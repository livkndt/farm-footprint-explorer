import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ResultsPanel from "../../app/components/ResultsPanel";

const pointGeometry = { type: "Point" as const, coordinates: [10, 20] as [number, number] };
const polygonGeometry = {
  type: "Polygon" as const,
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] as [number, number][][],
};

describe("ResultsPanel", () => {
  it("renders nothing when geometry is null", () => {
    const { container } = render(
      <ResultsPanel geometry={null} isLoading={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders loading state when isLoading is true", () => {
    render(<ResultsPanel geometry={pointGeometry} isLoading={true} />);
    expect(screen.getByTestId("results-loading")).toBeInTheDocument();
  });

  it("renders ready message for a Point geometry", () => {
    render(<ResultsPanel geometry={pointGeometry} isLoading={false} />);
    expect(screen.getByText(/ready to analyse/i)).toBeInTheDocument();
    expect(screen.getByText(/point/i)).toBeInTheDocument();
  });

  it("renders ready message for a Polygon geometry", () => {
    render(<ResultsPanel geometry={polygonGeometry} isLoading={false} />);
    expect(screen.getByText(/ready to analyse/i)).toBeInTheDocument();
    expect(screen.getByText(/polygon/i)).toBeInTheDocument();
  });
});
