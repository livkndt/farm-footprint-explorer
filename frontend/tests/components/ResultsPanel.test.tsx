import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ResultsPanel from "../../app/components/ResultsPanel";

const pointGeometry = {
  type: "Point" as const,
  coordinates: [10, 20] as [number, number],
};
const polygonGeometry = {
  type: "Polygon" as const,
  coordinates: [
    [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
  ] as [number, number][][],
};

const baseResult = {
  area_ha: 100.5,
  centroid: [10, 20],
  land_cover: [
    { type: "tree_cover", percentage: 60 },
    { type: "cropland", percentage: 40 },
    { type: "grassland", percentage: 0 },
  ],
  deforestation_alerts: {
    count: 0,
    area_ha: 0,
    period: "2020–2023",
  },
  alerts_live: true,
  alerts_fetched_at: "2024-03-15T10:30:00Z",
};

const noOp = vi.fn();

describe("ResultsPanel", () => {
  // --- Phase 4 tests (updated for new prop signature) ---

  it("renders nothing when geometry is null", () => {
    const { container } = render(
      <ResultsPanel
        geometry={null}
        isLoading={false}
        result={null}
        error={null}
        onRetry={noOp}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders loading state when isLoading is true", () => {
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={true}
        result={null}
        error={null}
        onRetry={noOp}
      />
    );
    expect(screen.getByTestId("results-loading")).toBeInTheDocument();
  });

  it("renders nothing when geometry set but no result/error yet", () => {
    const { container } = render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={false}
        result={null}
        error={null}
        onRetry={noOp}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders polygon analysis label for a Polygon geometry result", () => {
    render(
      <ResultsPanel
        geometry={polygonGeometry}
        isLoading={false}
        result={baseResult}
        error={null}
        onRetry={noOp}
      />
    );
    expect(screen.getByText(/polygon analysis/i)).toBeInTheDocument();
  });

  // --- Phase 5 tests ---

  it("renders skeleton UI elements when loading (no spinner)", () => {
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={true}
        result={null}
        error={null}
        onRetry={noOp}
      />
    );
    const loading = screen.getByTestId("results-loading");
    const skeletonBars = loading.querySelectorAll(".animate-pulse");
    expect(skeletonBars.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders error state with message and retry button", () => {
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={false}
        result={null}
        error="Something went wrong analysing this area"
        onRetry={noOp}
      />
    );
    expect(
      screen.getByText(/something went wrong analysing this area/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
  });

  it("retry button calls onRetry", async () => {
    const onRetry = vi.fn();
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={false}
        result={null}
        error="Something went wrong analysing this area"
        onRetry={onRetry}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders area_ha formatted to 1 decimal place with commas", () => {
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={false}
        result={{ ...baseResult, area_ha: 12450.3 }}
        error={null}
        onRetry={noOp}
      />
    );
    expect(screen.getByText("12,450.3 ha")).toBeInTheDocument();
  });

  it("renders land cover bar segments only for types with > 0%", () => {
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={false}
        result={baseResult}
        error={null}
        onRetry={noOp}
      />
    );
    expect(
      screen.getByTestId("land-cover-segment-tree_cover")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("land-cover-segment-cropland")
    ).toBeInTheDocument();
    // grassland is 0% — must not render
    expect(
      screen.queryByTestId("land-cover-segment-grassland")
    ).not.toBeInTheDocument();
  });

  it("renders deforestation warning banner when alert count > 0", () => {
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={false}
        result={{
          ...baseResult,
          deforestation_alerts: { count: 5, area_ha: 12.1, period: "2023" },
        }}
        error={null}
        onRetry={noOp}
      />
    );
    expect(screen.getByTestId("deforestation-warning")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders no-alerts message when count is 0", () => {
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={false}
        result={baseResult}
        error={null}
        onRetry={noOp}
      />
    );
    expect(
      screen.getByText(/no deforestation alerts detected/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("deforestation-warning")
    ).not.toBeInTheDocument();
  });

  // --- Phase 6: alert freshness indicator tests ---

  it("shows alerts_fetched_at timestamp when alerts_live is true", () => {
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={false}
        result={{ ...baseResult, alerts_live: true }}
        error={null}
        onRetry={noOp}
      />
    );
    expect(screen.getByTestId("alerts-fetched-at")).toBeInTheDocument();
    expect(
      screen.queryByTestId("alerts-cached-notice")
    ).not.toBeInTheDocument();
  });

  it("shows cached data notice when alerts_live is false", () => {
    render(
      <ResultsPanel
        geometry={pointGeometry}
        isLoading={false}
        result={{ ...baseResult, alerts_live: false }}
        error={null}
        onRetry={noOp}
      />
    );
    expect(screen.getByTestId("alerts-cached-notice")).toBeInTheDocument();
    expect(
      screen.getByText(/using cached alert data/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("alerts-fetched-at")
    ).not.toBeInTheDocument();
  });

});
