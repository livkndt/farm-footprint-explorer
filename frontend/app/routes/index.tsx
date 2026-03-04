import { useState, useCallback } from "react";
import turfArea from "@turf/area";
import Map from "../components/Map";
import DrawControls from "../components/DrawControls";
import ResultsPanel from "../components/ResultsPanel";
import { useFootprintAnalysis } from "../hooks/useFootprintAnalysis";

// Must match MAX_ANALYSIS_AREA_HA in backend/app/schemas/footprint.py
const MAX_AREA_HA = 500_000;
const MAX_AREA_M2 = MAX_AREA_HA * 10_000;

type DrawMode = "pin" | "polygon" | null;

type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export default function HomePage() {
  const [mode, setMode] = useState<DrawMode>(null);
  const [geometry, setGeometry] = useState<GeoJSONGeometry | null>(null);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const { analyse, result, isLoading, error, reset } = useFootprintAnalysis();

  function handleClear() {
    setClearTrigger((n) => n + 1);
    setGeometry(null);
  }

  const handleGeometryChange = useCallback(
    (g: GeoJSONGeometry | null) => {
      setGeometry(g);
      setSizeError(null);

      if (!g) {
        reset();
        return;
      }

      if (g.type === "Polygon") {
        const areaM2 = turfArea(g as GeoJSON.Polygon);
        if (areaM2 > MAX_AREA_M2) {
          const areaHa = Math.round(areaM2 / 10_000).toLocaleString("en-US");
          setSizeError(
            `Polygon area (${areaHa} ha) exceeds the maximum allowed analysis area of ${MAX_AREA_HA.toLocaleString("en-US")} ha. Please draw a smaller region.`
          );
          return;
        }
      }

      analyse(g);
      setMode(null);
    },
    [analyse, reset]
  );

  const handleRetry = useCallback(() => {
    if (geometry) analyse(geometry);
  }, [geometry, analyse]);

  const analysisComplete = result !== null && !isLoading;

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <Map
        mode={mode}
        onGeometryChange={handleGeometryChange}
        clearTrigger={clearTrigger}
        geometry={geometry}
        analysisComplete={analysisComplete}
      />
      <DrawControls
        mode={mode}
        onModeChange={setMode}
        onClear={handleClear}
        geometry={geometry}
      />
      <ResultsPanel
        geometry={geometry}
        isLoading={isLoading}
        result={result}
        error={sizeError ?? error}
        onRetry={handleRetry}
      />
    </main>
  );
}
