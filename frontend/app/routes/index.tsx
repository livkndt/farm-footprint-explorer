import { useState, useCallback } from "react";
import Map from "../components/Map";
import DrawControls from "../components/DrawControls";
import ResultsPanel from "../components/ResultsPanel";
import { useFootprintAnalysis } from "../hooks/useFootprintAnalysis";

type DrawMode = "pin" | "polygon" | null;

type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export default function HomePage() {
  const [mode, setMode] = useState<DrawMode>(null);
  const [geometry, setGeometry] = useState<GeoJSONGeometry | null>(null);
  const [clearTrigger, setClearTrigger] = useState(0);

  const { analyse, result, isLoading, error, reset } = useFootprintAnalysis();

  function handleClear() {
    setClearTrigger((n) => n + 1);
    setGeometry(null);
  }

  const handleGeometryChange = useCallback(
    (g: GeoJSONGeometry | null) => {
      setGeometry(g);
      if (g) {
        analyse(g);
        setMode(null);
      } else {
        reset();
      }
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
        error={error}
        onRetry={handleRetry}
      />
    </main>
  );
}
