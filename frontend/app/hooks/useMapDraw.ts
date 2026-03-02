import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

type DrawMode = "pin" | "polygon" | null;
type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

const DRAW_SOURCE = "draw-polygon";
const DRAW_FILL_LAYER = "draw-polygon-fill";
const DRAW_LINE_LAYER = "draw-polygon-line";
const RUBBER_SOURCE = "draw-rubber";
const RUBBER_LAYER = "draw-rubber-line";
const VERTEX_SOURCE = "draw-vertices";
const VERTEX_LAYER = "draw-vertex-circles";

function makePinElement(): HTMLElement {
  const el = document.createElement("div");
  el.style.width = "14px";
  el.style.height = "14px";
  el.style.borderRadius = "50%";
  el.style.backgroundColor = "#16a34a";
  el.style.border = "2.5px solid white";
  el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
  return el;
}

export function useMapMarker(
  map: maplibregl.Map | null,
  mode: DrawMode,
  clearTrigger: number,
  onGeometryChange: (g: GeoJSONGeometry | null) => void,
) {
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map || mode !== "pin") return;

    function handleClick(e: maplibregl.MapMouseEvent) {
      markerRef.current?.remove();
      const { lng, lat } = e.lngLat;
      markerRef.current = new maplibregl.Marker({ element: makePinElement(), anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map!);
      onGeometryChange({ type: "Point", coordinates: [lng, lat] });
    }

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [map, mode, onGeometryChange]);

  // Clear trigger
  useEffect(() => {
    if (clearTrigger === 0) return;
    markerRef.current?.remove();
    markerRef.current = null;
    onGeometryChange(null);
  }, [clearTrigger, onGeometryChange]);
}

export function useMapPolygonDraw(
  map: maplibregl.Map | null,
  mode: DrawMode,
  clearTrigger: number,
  onGeometryChange: (g: GeoJSONGeometry | null) => void,
  setVertexCount: (n: number) => void,
) {
  const verticesRef = useRef<[number, number][]>([]);

  function removeDrawLayers(m: maplibregl.Map) {
    if (m.getLayer(DRAW_FILL_LAYER)) m.removeLayer(DRAW_FILL_LAYER);
    if (m.getLayer(DRAW_LINE_LAYER)) m.removeLayer(DRAW_LINE_LAYER);
    if (m.getSource(DRAW_SOURCE)) m.removeSource(DRAW_SOURCE);
  }

  function removeRubberLayer(m: maplibregl.Map) {
    if (m.getLayer(RUBBER_LAYER)) m.removeLayer(RUBBER_LAYER);
    if (m.getSource(RUBBER_SOURCE)) m.removeSource(RUBBER_SOURCE);
  }

  function removeVertexLayer(m: maplibregl.Map) {
    if (m.getLayer(VERTEX_LAYER)) m.removeLayer(VERTEX_LAYER);
    if (m.getSource(VERTEX_SOURCE)) m.removeSource(VERTEX_SOURCE);
  }

  function updateRubberSource(m: maplibregl.Map, from: [number, number], to: [number, number]) {
    const geojson: GeoJSON.Feature = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [from, to] },
      properties: {},
    };
    const source = m.getSource(RUBBER_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
    } else {
      m.addSource(RUBBER_SOURCE, { type: "geojson", data: geojson });
      m.addLayer({
        id: RUBBER_LAYER,
        type: "line",
        source: RUBBER_SOURCE,
        paint: { "line-color": "#16a34a", "line-width": 2 },
      });
    }
  }

  function updateVertexSource(
    m: maplibregl.Map,
    coords: [number, number][],
    highlightFirst = false,
  ) {
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: coords.map((coord, i) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: coord },
        properties: { isFirst: i === 0, highlight: i === 0 && highlightFirst },
      })),
    };
    const source = m.getSource(VERTEX_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
    } else {
      m.addSource(VERTEX_SOURCE, { type: "geojson", data: geojson });
      m.addLayer({
        id: VERTEX_LAYER,
        type: "circle",
        source: VERTEX_SOURCE,
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["get", "highlight"], false], 10,
            ["boolean", ["get", "isFirst"], false], 7,
            5,
          ],
          "circle-color": [
            "case",
            ["boolean", ["get", "highlight"], false], "#16a34a",
            "#ffffff",
          ],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#16a34a",
          "circle-stroke-width": 2,
        },
      });
    }
  }

  function updateDrawSource(m: maplibregl.Map, coords: [number, number][]) {
    if (coords.length < 2) return;

    const geojson: GeoJSON.Feature = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {},
    };

    const source = m.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
    } else {
      m.addSource(DRAW_SOURCE, { type: "geojson", data: geojson });
      m.addLayer({
        id: DRAW_FILL_LAYER,
        type: "fill",
        source: DRAW_SOURCE,
        paint: { "fill-color": "#22c55e", "fill-opacity": 0.15 },
      });
      m.addLayer({
        id: DRAW_LINE_LAYER,
        type: "line",
        source: DRAW_SOURCE,
        paint: { "line-color": "#16a34a", "line-width": 2 },
      });
    }
  }

  useEffect(() => {
    if (!map || mode !== "polygon") return;

    const SNAP_PX = 10;
    verticesRef.current = [];
    setVertexCount(0);
    let nearFirst = false;

    function closePolygon(verts: [number, number][]) {
      removeDrawLayers(map!);
      removeRubberLayer(map!);
      removeVertexLayer(map!);
      verticesRef.current = [];
      setVertexCount(0);
      onGeometryChange({ type: "Polygon", coordinates: [[...verts, verts[0]]] });
    }

    function handleClick(e: maplibregl.MapMouseEvent) {
      const { lng, lat } = e.lngLat;
      const verts = verticesRef.current;

      if (verts.length >= 2) {
        const firstPx = map!.project(verts[0] as maplibregl.LngLatLike);
        const clickPx = map!.project([lng, lat]);
        const dx = firstPx.x - clickPx.x;
        const dy = firstPx.y - clickPx.y;
        if (Math.sqrt(dx * dx + dy * dy) <= SNAP_PX) {
          closePolygon(verts);
          return;
        }
      }

      verticesRef.current = [...verts, [lng, lat]];
      nearFirst = false;
      setVertexCount(verticesRef.current.length);
      updateDrawSource(map!, verticesRef.current);
      updateVertexSource(map!, verticesRef.current, false);
    }

    function handleMouseMove(e: maplibregl.MapMouseEvent) {
      if (verticesRef.current.length === 0) return;
      const { lng, lat } = e.lngLat;
      const verts = verticesRef.current;
      updateRubberSource(map!, verts[verts.length - 1], [lng, lat]);

      if (verts.length >= 2) {
        const firstPx = map!.project(verts[0] as maplibregl.LngLatLike);
        const cursorPx = map!.project([lng, lat]);
        const dx = firstPx.x - cursorPx.x;
        const dy = firstPx.y - cursorPx.y;
        const newNearFirst = Math.sqrt(dx * dx + dy * dy) <= SNAP_PX;
        if (newNearFirst !== nearFirst) {
          nearFirst = newNearFirst;
          updateVertexSource(map!, verts, nearFirst);
        }
      }
    }

    function handleDblClick(e: maplibregl.MapMouseEvent) {
      e.preventDefault();
      const verts = verticesRef.current;
      if (verts.length < 3) return;
      closePolygon(verts);
    }

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);
    map.on("dblclick", handleDblClick);
    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.off("dblclick", handleDblClick);
      removeDrawLayers(map);
      removeRubberLayer(map);
      removeVertexLayer(map);
      verticesRef.current = [];
      setVertexCount(0);
    };
  }, [map, mode, onGeometryChange, setVertexCount]);

  // Clear trigger
  useEffect(() => {
    if (clearTrigger === 0) return;
    if (map) {
      removeDrawLayers(map);
      removeRubberLayer(map);
      removeVertexLayer(map);
    }
    verticesRef.current = [];
    setVertexCount(0);
    onGeometryChange(null);
  }, [clearTrigger, map, onGeometryChange, setVertexCount]);
}
