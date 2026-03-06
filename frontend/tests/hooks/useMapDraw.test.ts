import { renderHook, act } from "@testing-library/react";
import { vi, beforeEach, describe, it, expect } from "vitest";
import { getMockMap, getMockMarker } from "../__mocks__/maplibre-gl";
import { useMapMarker, useMapPolygonDraw } from "../../app/hooks/useMapDraw";
import type maplibregl from "maplibre-gl";

const mockMap = getMockMap() as unknown as maplibregl.Map;

function getHandler(event: string): (...args: unknown[]) => void {
  const on = (mockMap as { on: ReturnType<typeof vi.fn> }).on;
  const call = on.mock.calls.findLast(([e]: [string]) => e === event);
  if (!call) throw new Error(`No handler registered for "${event}"`);
  return call[1] as (...args: unknown[]) => void;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default project implementation after any per-test override
  (mockMap as { project: ReturnType<typeof vi.fn> }).project.mockReturnValue({ x: 0, y: 0 });
});

// ---------------------------------------------------------------------------
// useMapMarker
// ---------------------------------------------------------------------------

describe("useMapMarker", () => {
  it("registers a click handler when mode is 'pin'", () => {
    const onGeometryChange = vi.fn();
    renderHook(() => useMapMarker(mockMap, "pin", 0, onGeometryChange));
    expect((mockMap as { on: ReturnType<typeof vi.fn> }).on).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
    );
  });

  it("does not register a click handler when mode is not 'pin'", () => {
    renderHook(() => useMapMarker(mockMap, "polygon", 0, vi.fn()));
    expect((mockMap as { on: ReturnType<typeof vi.fn> }).on).not.toHaveBeenCalled();
  });

  it("calls onGeometryChange with Point geometry on map click", () => {
    const onGeometryChange = vi.fn();
    renderHook(() => useMapMarker(mockMap, "pin", 0, onGeometryChange));

    act(() => getHandler("click")({ lngLat: { lng: 10.5, lat: 20.3 } }));

    expect(onGeometryChange).toHaveBeenCalledWith({
      type: "Point",
      coordinates: [10.5, 20.3],
    });
  });

  it("removes the previous marker before placing a new one", () => {
    const onGeometryChange = vi.fn();
    renderHook(() => useMapMarker(mockMap, "pin", 0, onGeometryChange));

    act(() => getHandler("click")({ lngLat: { lng: 1, lat: 1 } }));
    const marker = getMockMarker();
    act(() => getHandler("click")({ lngLat: { lng: 2, lat: 2 } }));

    expect(marker.remove).toHaveBeenCalledTimes(1);
  });

  it("calls onGeometryChange(null) when clearTrigger fires", () => {
    const onGeometryChange = vi.fn();
    const { rerender } = renderHook(
      ({ clearTrigger }) => useMapMarker(mockMap, "pin", clearTrigger, onGeometryChange),
      { initialProps: { clearTrigger: 0 } },
    );

    // Place a marker first
    act(() => getHandler("click")({ lngLat: { lng: 1, lat: 1 } }));
    vi.clearAllMocks();

    act(() => rerender({ clearTrigger: 1 }));
    expect(onGeometryChange).toHaveBeenCalledWith(null);
  });

  it("removes the click handler on unmount", () => {
    const { unmount } = renderHook(() => useMapMarker(mockMap, "pin", 0, vi.fn()));
    unmount();
    expect((mockMap as { off: ReturnType<typeof vi.fn> }).off).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// useMapPolygonDraw
// ---------------------------------------------------------------------------

describe("useMapPolygonDraw", () => {
  it("registers click, mousemove, and dblclick handlers when mode is 'polygon'", () => {
    renderHook(() => useMapPolygonDraw(mockMap, "polygon", 0, vi.fn(), vi.fn()));
    const registeredEvents = (
      mockMap as { on: ReturnType<typeof vi.fn> }
    ).on.mock.calls.map(([e]: [string]) => e);
    expect(registeredEvents).toContain("click");
    expect(registeredEvents).toContain("mousemove");
    expect(registeredEvents).toContain("dblclick");
  });

  it("does not register handlers when mode is not 'polygon'", () => {
    renderHook(() => useMapPolygonDraw(mockMap, "pin", 0, vi.fn(), vi.fn()));
    expect((mockMap as { on: ReturnType<typeof vi.fn> }).on).not.toHaveBeenCalled();
  });

  it("adds a vertex and increments count on click", () => {
    const onGeometryChange = vi.fn();
    const setVertexCount = vi.fn();
    renderHook(() => useMapPolygonDraw(mockMap, "polygon", 0, onGeometryChange, setVertexCount));

    act(() => getHandler("click")({ lngLat: { lng: 10, lat: 20 } }));

    expect(setVertexCount).toHaveBeenCalledWith(1);
    expect(onGeometryChange).not.toHaveBeenCalled(); // not closed yet
  });

  it("dblclick with fewer than 3 vertices does not close the polygon", () => {
    const onGeometryChange = vi.fn();
    renderHook(() => useMapPolygonDraw(mockMap, "polygon", 0, onGeometryChange, vi.fn()));

    // Add only 1 vertex, then dblclick
    act(() => getHandler("click")({ lngLat: { lng: 10, lat: 20 } }));
    act(() => getHandler("dblclick")({ preventDefault: vi.fn() }));

    expect(onGeometryChange).not.toHaveBeenCalled();
  });

  it("dblclick with 3+ vertices closes the polygon", () => {
    const onGeometryChange = vi.fn();
    // project returns different x per longitude so snap (distance ≤ 10px) never triggers
    (mockMap as { project: ReturnType<typeof vi.fn> }).project.mockImplementation(
      (lngLat: [number, number]) => ({ x: lngLat[0] * 100, y: 0 }),
    );

    renderHook(() => useMapPolygonDraw(mockMap, "polygon", 0, onGeometryChange, vi.fn()));

    act(() => getHandler("click")({ lngLat: { lng: 10, lat: 20 } }));
    act(() => getHandler("click")({ lngLat: { lng: 11, lat: 21 } }));
    act(() => getHandler("click")({ lngLat: { lng: 12, lat: 22 } }));
    act(() => getHandler("dblclick")({ preventDefault: vi.fn() }));

    expect(onGeometryChange).toHaveBeenCalledWith({
      type: "Polygon",
      coordinates: [[[10, 20], [11, 21], [12, 22], [10, 20]]],
    });
  });

  it("snap-to-close: click near the first vertex closes the polygon", () => {
    // project returns {x:0, y:0} for all points (distance = 0 ≤ 10px → snap)
    const onGeometryChange = vi.fn();
    renderHook(() => useMapPolygonDraw(mockMap, "polygon", 0, onGeometryChange, vi.fn()));

    act(() => getHandler("click")({ lngLat: { lng: 10, lat: 20 } }));
    act(() => getHandler("click")({ lngLat: { lng: 11, lat: 21 } }));
    // 3rd click snaps to first vertex → closes polygon
    act(() => getHandler("click")({ lngLat: { lng: 10, lat: 20 } }));

    expect(onGeometryChange).toHaveBeenCalledWith({
      type: "Polygon",
      coordinates: [[[10, 20], [11, 21], [10, 20]]],
    });
  });

  it("clearTrigger resets state and emits null geometry", () => {
    const onGeometryChange = vi.fn();
    const setVertexCount = vi.fn();
    const { rerender } = renderHook(
      ({ clearTrigger }) =>
        useMapPolygonDraw(mockMap, "polygon", clearTrigger, onGeometryChange, setVertexCount),
      { initialProps: { clearTrigger: 0 } },
    );

    vi.clearAllMocks();

    act(() => rerender({ clearTrigger: 1 }));
    expect(onGeometryChange).toHaveBeenCalledWith(null);
    expect(setVertexCount).toHaveBeenCalledWith(0);
  });

  it("removes all event handlers and draw layers on unmount", () => {
    const { unmount } = renderHook(() =>
      useMapPolygonDraw(mockMap, "polygon", 0, vi.fn(), vi.fn()),
    );
    unmount();

    const off = (mockMap as { off: ReturnType<typeof vi.fn> }).off;
    expect(off).toHaveBeenCalledWith("click", expect.any(Function));
    expect(off).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(off).toHaveBeenCalledWith("dblclick", expect.any(Function));
  });
});
