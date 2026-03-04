import type { FootprintResult } from "../hooks/useFootprintAnalysis";

type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

interface ResultsPanelProps {
  geometry: GeoJSONGeometry | null;
  isLoading: boolean;
  result: FootprintResult | null;
  error: string | null;
  onRetry: () => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#dc2626",
  nominal: "#d97706",
  low: "#eab308",
};

function confidenceColor(level: string): string {
  return CONFIDENCE_COLORS[level] ?? "#9ca3af";
}

const COVER_COLORS: Record<string, string> = {
  tree_cover: "#2d6a4f",
  cropland: "#d4a017",
  grassland: "#95d5b2",
  wetland: "#48cae4",
  urban: "#6c757d",
  water: "#0077b6",
  bare: "#e9c46a",
};

function coverColor(type: string): string {
  return COVER_COLORS[type] ?? "#adb5bd";
}

function formatHa(ha: number): string {
  return ha.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export default function ResultsPanel({
  geometry,
  isLoading,
  result,
  error,
  onRetry,
}: ResultsPanelProps) {
  if (geometry === null) return null;

  if (isLoading) {
    return (
      <div
        data-testid="results-loading"
        className="absolute right-0 top-0 h-full w-96 bg-white shadow-lg p-6 overflow-y-auto"
      >
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-full mt-6" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-4 bg-gray-200 rounded w-4/6" />
          <div className="h-4 bg-gray-200 rounded w-2/3 mt-4" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-lg p-6 flex flex-col gap-4">
        <p className="text-sm text-gray-700">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 self-start"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!result) return null;

  const geometryLabel =
    geometry.type === "Polygon"
      ? "Polygon analysis"
      : "Point analysis (1km radius)";

  const visibleCover = result.land_cover.filter((c) => c.percentage > 0);
  const sortedCover = [...visibleCover].sort(
    (a, b) => b.percentage - a.percentage
  );

  const alerts = result.deforestation_alerts;

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-lg p-6 overflow-y-auto flex flex-col gap-6">
      {/* Header */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
          {geometryLabel}
        </p>
        <p className="text-2xl font-bold text-gray-900">
          {formatHa(result.area_ha)} ha
        </p>
      </div>

      {/* Land cover */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Land cover
        </h3>
        <div className="flex h-4 rounded overflow-hidden w-full mb-3">
          {sortedCover.map((item) => (
            <div
              key={item.type}
              data-testid={`land-cover-segment-${item.type}`}
              style={{
                width: `${item.percentage}%`,
                backgroundColor: coverColor(item.type),
              }}
              title={`${item.type}: ${item.percentage}%`}
            />
          ))}
        </div>
        <ul className="space-y-1">
          {sortedCover.map((item) => (
            <li key={item.type} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: coverColor(item.type) }}
              />
              <span className="text-gray-600 capitalize">
                {item.type.replace(/_/g, " ")}
              </span>
              <span className="ml-auto text-gray-500">
                {item.percentage.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Deforestation alerts */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Deforestation alerts
        </h3>
        {alerts.count > 0 ? (
          <>
            <div
              data-testid="deforestation-warning"
              className="rounded p-3 bg-amber-50 border border-amber-200"
            >
              <p className="text-2xl font-bold text-red-600">{alerts.count}</p>
              <p className="text-sm text-gray-700">
                {formatHa(alerts.area_ha)} ha affected · {alerts.period}
              </p>
            </div>

            {/* Confidence breakdown */}
            {alerts.by_confidence.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  By confidence
                </p>
                <ul className="space-y-1">
                  {alerts.by_confidence.map((c) => (
                    <li
                      key={c.level}
                      data-testid={`confidence-row-${c.level}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: confidenceColor(c.level) }}
                      />
                      <span className="text-gray-600 capitalize">{c.level}</span>
                      <span className="ml-auto text-gray-500">
                        {c.count} alert{c.count !== 1 ? "s" : ""} · {formatHa(c.area_ha)} ha
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Yearly trend */}
            {alerts.by_year.length > 0 && (() => {
              const maxCount = Math.max(...alerts.by_year.map((y) => y.count));
              return (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    By year
                  </p>
                  <ul className="space-y-1.5">
                    {alerts.by_year.map((y) => (
                      <li key={y.year} className="flex items-center gap-2 text-sm">
                        <span className="w-10 text-right text-gray-500 flex-shrink-0">
                          {y.year}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            data-testid={`year-bar-${y.year}`}
                            className="h-full rounded-full bg-red-400"
                            style={{ width: `${(y.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="w-6 text-gray-500 flex-shrink-0">
                          {y.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* GFW info callout */}
            <p
              data-testid="alerts-info-callout"
              className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1.5 border border-gray-100"
            >
              GFW Integrated Alerts combine satellite data from GLAD, RADD, and
              CCDC. High-confidence alerts have been confirmed by at least two
              independent systems.
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            No deforestation alerts detected in this area
          </p>
        )}
      </div>

      {/* Alert data freshness */}
      {result.alerts_live ? (
        <p data-testid="alerts-fetched-at" className="text-xs text-gray-400">
          Alerts current as of{" "}
          {new Date(result.alerts_fetched_at).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      ) : (
        <p
          data-testid="alerts-cached-notice"
          className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
        >
          Using cached alert data — live fetch unavailable
        </p>
      )}


      {/* Footer */}
      <p className="text-xs text-gray-400 mt-auto">
        Data: ESA WorldCover · GLAD Alerts · Analysis area may be approximate
      </p>
    </div>
  );
}
