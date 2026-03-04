import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HomePage from "../../app/routes/index";

// Mock Map so we can trigger onGeometryChange from test buttons
vi.mock("../../app/components/Map", () => ({
  default: ({
    onGeometryChange,
  }: {
    onGeometryChange: (g: unknown) => void;
    [key: string]: unknown;
  }) => (
    <div data-testid="map-container">
      <button
        data-testid="trigger-point"
        onClick={() =>
          onGeometryChange({ type: "Point", coordinates: [0, 0] })
        }
      />
      <button
        data-testid="trigger-clear"
        onClick={() => onGeometryChange(null)}
      />
      {/* A 100° × 100° polygon — far exceeds the 500,000 ha limit */}
      <button
        data-testid="trigger-large-polygon"
        onClick={() =>
          onGeometryChange({
            type: "Polygon",
            coordinates: [
              [
                [-50, -50],
                [50, -50],
                [50, 50],
                [-50, 50],
                [-50, -50],
              ],
            ],
          })
        }
      />
    </div>
  ),
}));

// Mock hook so we can spy on analyse/reset calls
vi.mock("../../app/hooks/useFootprintAnalysis", () => ({
  useFootprintAnalysis: vi.fn(),
}));

import { useFootprintAnalysis } from "../../app/hooks/useFootprintAnalysis";

const mockAnalyse = vi.fn();
const mockReset = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useFootprintAnalysis).mockReturnValue({
    analyse: mockAnalyse,
    result: null,
    isLoading: false,
    error: null,
    reset: mockReset,
  });
});

describe("HomePage", () => {
  it("renders the Map component", () => {
    render(<HomePage />);
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("renders the ResultsPanel hidden until geometry is selected", () => {
    render(<HomePage />);
    // ResultsPanel renders null when no geometry
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("ResultsPanel renders nothing when no geometry (no stale placeholder)", () => {
    render(<HomePage />);
    expect(screen.queryByText(/ready to analyse/i)).not.toBeInTheDocument();
  });

  // --- Phase 5: hook wiring tests ---

  it("calls analyse with the geometry when onGeometryChange fires with a value", async () => {
    render(<HomePage />);
    await userEvent.click(screen.getByTestId("trigger-point"));
    expect(mockAnalyse).toHaveBeenCalledOnce();
    expect(mockAnalyse).toHaveBeenCalledWith({
      type: "Point",
      coordinates: [0, 0],
    });
  });

  it("calls reset when onGeometryChange fires with null", async () => {
    render(<HomePage />);
    // First set a geometry, then clear it
    await userEvent.click(screen.getByTestId("trigger-point"));
    await userEvent.click(screen.getByTestId("trigger-clear"));
    expect(mockReset).toHaveBeenCalledOnce();
  });

  // --- Size validation pre-flight tests ---

  it("does not call analyse for an oversized polygon and shows a size error", async () => {
    render(<HomePage />);
    await userEvent.click(screen.getByTestId("trigger-large-polygon"));
    expect(mockAnalyse).not.toHaveBeenCalled();
    expect(screen.getByText(/maximum allowed/i)).toBeInTheDocument();
  });

  it("clears the size error when the user draws a new valid geometry", async () => {
    render(<HomePage />);
    // Draw oversized polygon first
    await userEvent.click(screen.getByTestId("trigger-large-polygon"));
    expect(screen.getByText(/maximum allowed/i)).toBeInTheDocument();
    // Then draw a valid point — error should disappear
    await userEvent.click(screen.getByTestId("trigger-point"));
    expect(screen.queryByText(/maximum allowed/i)).not.toBeInTheDocument();
    expect(mockAnalyse).toHaveBeenCalledOnce();
  });
});
