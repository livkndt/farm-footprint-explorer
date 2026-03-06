import { renderHook, act } from "@testing-library/react";
import { vi, beforeEach, describe, it, expect } from "vitest";
import { getMockMap, getMockMarker } from "../__mocks__/maplibre-gl";
import { useMapMarker, useMapPolygonDraw } from "../../app/hooks/useMapDraw";

// Cast once to any so mock-specific properties (.mock.calls, .mockReturnValue, etc.)
// are accessible without repeated double-casts, and the value is accepted by hooks
// that expect maplibregl.Map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockMap = getMockMap() as any;

/** Returns the most-recently-registered handler for the given event name. */
function getHandler(event: string): (...args: unknown[]) => void {
  const calls: [string, Function][] = mockMap.on.mock.calls;
  const matching = calls.filter(([e]) => e === event);
  if (!matching.length) throw new Error(`No handler registered for "${event}"`);
  return matching[matching.length - 1][1] as (...args: unknown[]) => void;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default after any per-test override (clearAllMocks keeps implementations,
  // but a test may have called .mockImplementation — reset to known default).
  mockMap.project.mockReturnValue({ x: 0, y: 0 });
});

// ---------------------------------------------------------------------------
// useMapMarker
// ---------------------------------------------------------------------------

describe("useMapMarker", () => {
  it("registers a click handler when mode is 'pin'", () => {
    renderHook(() => useMapMarker(mockMap, "pin", 0, vi.fn()));
    expect(mockMap.on).toHaveBeenCalledWith("click", expect.any(Function));
  });

  it("does not register a click handler when mode is not 'pin'", () => {
    renderHook(() => useMapMarker(mockMap, "polygon", 0, vi.fn()));
    expect(mockMap.on).not.toHaveBeenCalled();
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
    renderHook(() => useMapMarker(mockMap, "pin", 0, vi.fn()));
    const marker = getMockMarker();

    act(() => getHandler("click")({ lngLat: { lng: 1, lat: 1 } }));
    act(() => getHandler("click")({ lngLat: { lng: 2, lat: 2 } }));

    expect(marker.remove).toHaveBeenCalledTimes(1);
  });

  it("calls onGeometryChange(null) when clearTrigger fires", () => {
    const onGeometryChange = vi.fn();
    const { rerender } = renderHook(
      ({ clearTrigger }) => useMapMarker(mockMap, "pin", clearTrigger, onGeometryChange),
      { initialProps: { clearTrigger: 0 } },
    );

    act(() => getHandler("click")({ lngLat: { lng: 1, lat: 1 } }));
    vi.clearAllMocks();

    act(() => rerender({ clearTrigger: 1 }));
    expect(onGeometryChange).toHaveBeenCalledWith(null);
  });

  it("removes the click handler on unmount", () => {
    const { unmount } = renderHook(() => useMapMarker(mockMap, "pin", 0, vi.fn()));
    unmount();
    expect(mockMap.off).toHaveBeenCalledWith("click", expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// useMapPolygonDraw
// ---------------------------------------------------------------------------

describe("useMapPolygonDraw", () => {
  it("registers click, mousemove, and dblclick handlers when mode is 'polygon'", () => {
    renderHook(() => useMapPolygonDraw(mockMap, "polygon", 0, vi.fn(), vi.fn()));
    const events: string[] = mockMap.on.mock.calls.map(([e]: [string]) => e);
    expect(events).toContain("click");
    expect(events).toContain("mousemove");
    expect(events).toContain("dblclick");
  });

  it("does not register handlers when mode is not 'polygon'", () => {
    renderHook(() => useMapPolygonDraw(mockMap, "pin", 0, vi.fn(), vi.fn()));
    expect(mockMap.on).not.toHaveBeenCalled();
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

    // Only 1 vertex → dblclick does nothing
    act(() => getHandler("click")({ lngLat: { lng: 10, lat: 20 } }));
    act(() => getHandler("dblclick")({ preventDefault: vi.fn() }));

    expect(onGeometryChange).not.toHaveBeenCalled();
  });

  it("dblclick with 3+ vertices closes the polygon", () => {
    const onGeometryChange = vi.fn();
    // project returns distinct x per longitude so snap (distance ≤ 10px) never triggers
    mockMap.project.mockImplementation(([lng]: [number]) => ({ x: lng * 100, y: 0 }));

    renderHook(() => useMapPolygonDraw(mockMap, "polygon", 0, onGeometryChange, vi.fn()));

    act(() => getHandler("click")({ lngLat: { lng: 10, lat: 20 } }));
    act(() => getHandler("click")({ lngLat: { lng: 11, lat: 21 } })); // dist 100 > 10 → no snap
    act(() => getHandler("click")({ lngLat: { lng: 12, lat: 22 } })); // dist 200 > 10 → no snap
    act(() => getHandler("dblclick")({ preventDefault: vi.fn() }));

    expect(onGeometryChange).toHaveBeenCalledWith({
      type: "Polygon",
      coordinates: [[[10, 20], [11, 21], [12, 22], [10, 20]]],
    });
  });

  it("snap-to-close: click near the first vertex closes the polygon", () => {
    // project returns {x:0, y:0} for all points → distance = 0 ≤ 10px → snap
    const onGeometryChange = vi.fn();
    renderHook(() => useMapPolygonDraw(mockMap, "polygon", 0, onGeometryChange, vi.fn()));

    act(() => getHandler("click")({ lngLat: { lng: 10, lat: 20 } }));
    act(() => getHandler("click")({ lngLat: { lng: 11, lat: 21 } }));
    // 3rd click: snap triggers because project returns same pixel for all coords
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

    expect(mockMap.off).toHaveBeenCalledWith("click", expect.any(Function));
    expect(mockMap.off).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(mockMap.off).toHaveBeenCalledWith("dblclick", expect.any(Function));
  });
});
