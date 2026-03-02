import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Map as MockMapClass, getMockMap, getMockMarker } from "../__mocks__/maplibre-gl";
import MapComponent from "../../app/components/Map";

beforeEach(() => {
  vi.clearAllMocks();
  getMockMap().getSource.mockReturnValue(null);
  getMockMap().getLayer.mockReturnValue(null);
});

describe("Map", () => {
  it("initialises MapLibre Map on mount", () => {
    render(<MapComponent mode={null} onGeometryChange={vi.fn()} />);
    expect(MockMapClass).toHaveBeenCalledOnce();
  });

  it("calls map.remove() on unmount", () => {
    const { unmount } = render(
      <MapComponent mode={null} onGeometryChange={vi.fn()} />
    );
    unmount();
    expect(getMockMap().remove).toHaveBeenCalledOnce();
  });

  it("registers a click handler when mode changes to pin", () => {
    const { rerender } = render(
      <MapComponent mode={null} onGeometryChange={vi.fn()} />
    );
    rerender(<MapComponent mode="pin" onGeometryChange={vi.fn()} />);
    const onCalls = getMockMap().on.mock.calls;
    expect(onCalls.some(([event]) => event === "click")).toBe(true);
  });

  it("calling clear via prop removes marker and calls onGeometryChange(null)", () => {
    const onGeometryChange = vi.fn();
    // Place a marker by simulating a click handler call
    const { rerender } = render(
      <MapComponent mode="pin" onGeometryChange={onGeometryChange} />
    );
    // Simulate the map click event being fired
    const clickCall = getMockMap().on.mock.calls.find(
      ([event]) => event === "click"
    );
    if (clickCall) {
      const handler = clickCall[1] as (e: { lngLat: { lng: number; lat: number } }) => void;
      handler({ lngLat: { lng: 5, lat: 10 } });
    }
    // Switch to clear by changing mode to null
    rerender(<MapComponent mode={null} onGeometryChange={onGeometryChange} clearTrigger={1} />);
    expect(onGeometryChange).toHaveBeenLastCalledWith(null);
  });
});
