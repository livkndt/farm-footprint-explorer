import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useMapMarker, useMapPolygonDraw } from "../hooks/useMapDraw";

type DrawMode = "pin" | "polygon" | null;

type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

interface MapProps {
  mode: DrawMode;
  onGeometryChange: (g: GeoJSONGeometry | null) => void;
  clearTrigger?: number;
  geometry?: GeoJSONGeometry | null;
  analysisComplete?: boolean;
}

const RESULT_SOURCE = "result";
const RESULT_FILL = "result-fill";
const RESULT_LINE = "result-line";
const RING_SOURCE = "ring";
const RING_LAYER = "ring-circle";

export default function Map({ mode, onGeometryChange, clearTrigger = 0, geometry = null, analysisComplete = false }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [vertexCount, setVertexCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const key = import.meta.env.VITE_MAPTILER_KEY;
    const style = key
      ? `https://api.maptiler.com/maps/streets/style.json?key=${key}`
      : ({
          version: 8,
          sources: {
            osm: {
              type: "raster" as const,
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
        } satisfies maplibregl.StyleSpecification);
    const m = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [0, 20],
      zoom: 2,
    });
    setMap(m);
    return () => {
      m.remove();
      setMap(null);
    };
  }, []);

  useMapMarker(map, mode, clearTrigger, onGeometryChange);
  useMapPolygonDraw(map, mode, clearTrigger, onGeometryChange, setVertexCount);

  useEffect(() => {
    if (!map) return;
    if (map.getLayer(RESULT_FILL)) map.removeLayer(RESULT_FILL);
    if (map.getLayer(RESULT_LINE)) map.removeLayer(RESULT_LINE);
    if (map.getSource(RESULT_SOURCE)) map.removeSource(RESULT_SOURCE);
    if (geometry?.type !== "Polygon") return;
    map.addSource(RESULT_SOURCE, {
      type: "geojson",
      data: { type: "Feature", geometry, properties: {} },
    });
    map.addLayer({
      id: RESULT_FILL,
      type: "fill",
      source: RESULT_SOURCE,
      paint: { "fill-color": "#22c55e", "fill-opacity": 0.2 },
    });
    map.addLayer({
      id: RESULT_LINE,
      type: "line",
      source: RESULT_SOURCE,
      paint: { "line-color": "#16a34a", "line-width": 2 },
    });
  }, [map, geometry]);

  // Visual feedback when analysis completes
  useEffect(() => {
    if (!map) return;
    if (analysisComplete && geometry?.type === "Polygon") {
      if (map.getLayer(RESULT_FILL)) {
        map.setPaintProperty(RESULT_FILL, "fill-opacity", 0.35);
      }
    } else if (!analysisComplete && map.getLayer(RESULT_FILL)) {
      map.setPaintProperty(RESULT_FILL, "fill-opacity", 0.2);
    }

    if (analysisComplete && geometry?.type === "Point") {
      const [lng, lat] = geometry.coordinates;
      const geojson: GeoJSON.Feature = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {},
      };
      if (map.getSource(RING_SOURCE)) {
        (map.getSource(RING_SOURCE) as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.addSource(RING_SOURCE, { type: "geojson", data: geojson });
        map.addLayer({
          id: RING_LAYER,
          type: "circle",
          source: RING_SOURCE,
          paint: {
            "circle-radius": 18,
            "circle-color": "transparent",
            "circle-stroke-color": "#16a34a",
            "circle-stroke-width": 2,
            "circle-stroke-opacity": 0.7,
          },
        });
      }
    } else {
      if (map.getLayer(RING_LAYER)) map.removeLayer(RING_LAYER);
      if (map.getSource(RING_SOURCE)) map.removeSource(RING_SOURCE);
    }
  }, [map, analysisComplete, geometry]);

  const hint =
    mode === "polygon"
      ? vertexCount === 0
        ? "Click to place points"
        : vertexCount < 3
          ? `${vertexCount} point${vertexCount > 1 ? "s" : ""} — keep clicking`
          : `${vertexCount} points — click the first point to close`
      : mode === "pin"
        ? "Click to drop a pin"
        : null;

  return (
    <div
      ref={containerRef}
      data-testid="map-container"
      className="w-full h-full"
      style={{ cursor: mode ? "crosshair" : "" }}
    >
      {hint && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-black/70 text-white text-sm pointer-events-none">
          {hint}
        </div>
      )}
    </div>
  );
}
