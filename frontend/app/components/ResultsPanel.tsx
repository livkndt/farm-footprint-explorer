type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

interface ResultsPanelProps {
  geometry: GeoJSONGeometry | null;
  isLoading: boolean;
}

export default function ResultsPanel({ geometry, isLoading }: ResultsPanelProps) {
  if (geometry === null) return null;

  if (isLoading) {
    return (
      <div
        data-testid="results-loading"
        className="absolute right-0 top-0 h-full w-96 bg-white shadow-lg p-6"
      >
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-lg p-6 overflow-y-auto">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Ready to analyse</h2>
      <p className="text-sm text-gray-500">{geometry.type}</p>
    </div>
  );
}
