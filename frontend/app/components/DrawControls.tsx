type DrawMode = "pin" | "polygon" | null;

type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

interface DrawControlsProps {
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  onClear: () => void;
  geometry: GeoJSONGeometry | null;
}

export default function DrawControls({
  mode,
  onModeChange,
  onClear,
  geometry,
}: DrawControlsProps) {
  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
      <button
        aria-label="Drop pin"
        data-active={mode === "pin" ? "true" : "false"}
        onClick={() => onModeChange("pin")}
        className={`px-3 py-2 rounded text-sm font-medium ${
          mode === "pin"
            ? "bg-gray-900 text-white"
            : "bg-gray-700 text-gray-100 hover:bg-gray-800"
        }`}
      >
        Drop pin
      </button>
      <button
        aria-label="Draw polygon"
        data-active={mode === "polygon" ? "true" : "false"}
        onClick={() => onModeChange("polygon")}
        className={`px-3 py-2 rounded text-sm font-medium ${
          mode === "polygon"
            ? "bg-gray-900 text-white"
            : "bg-gray-700 text-gray-100 hover:bg-gray-800"
        }`}
      >
        Draw polygon
      </button>
      {geometry !== null && (
        <button
          aria-label="Clear"
          onClick={onClear}
          className="px-3 py-2 rounded text-sm font-medium bg-red-700 text-white hover:bg-red-800"
        >
          Clear
        </button>
      )}
    </div>
  );
}
