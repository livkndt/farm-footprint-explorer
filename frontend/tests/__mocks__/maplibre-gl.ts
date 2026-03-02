import { vi } from "vitest";

export type LngLatLike = [number, number] | { lng: number; lat: number };
export type MapMouseEvent = { lngLat: { lng: number; lat: number } };

const mockMarker = {
  setLngLat: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
  remove: vi.fn().mockReturnThis(),
  getLngLat: vi.fn().mockReturnValue({ lng: 0, lat: 0 }),
};

export const Marker = vi.fn(() => mockMarker);

const mockMap = {
  on: vi.fn(),
  off: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  removeSource: vi.fn(),
  removeLayer: vi.fn(),
  getSource: vi.fn().mockReturnValue(null),
  getLayer: vi.fn().mockReturnValue(null),
  remove: vi.fn(),
  getCanvas: vi.fn().mockReturnValue({ style: {} }),
  project: vi.fn().mockReturnValue({ x: 0, y: 0 }),
};

export const Map = vi.fn(() => mockMap);

export function getMockMap() {
  return mockMap;
}

export function getMockMarker() {
  return mockMarker;
}

export default { Map, Marker };
