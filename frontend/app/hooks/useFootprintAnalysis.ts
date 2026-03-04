import { useState, useRef, useCallback } from "react";
import { analyseFootprintAnalysePost } from "../client";
import type { AnalyseResponse, AnalyseRequest, HttpValidationError } from "../client";

function extractErrorMessage(error: unknown): string {
  const validationError = error as HttpValidationError;
  const msg = validationError?.detail?.[0]?.msg;
  return msg ?? "Something went wrong analysing this area";
}

type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export type FootprintResult = AnalyseResponse;

export interface UseFootprintAnalysisReturn {
  analyse: (geometry: GeoJSONGeometry) => void;
  result: FootprintResult | null;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

export function useFootprintAnalysis(): UseFootprintAnalysisReturn {
  const [result, setResult] = useState<FootprintResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const analyse = useCallback((geometry: GeoJSONGeometry) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setResult(null);
    setError(null);

    analyseFootprintAnalysePost({
      body: { geometry: geometry as AnalyseRequest["geometry"] },
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.error) {
          setError(extractErrorMessage(response.error));
          setIsLoading(false);
          return;
        }
        setResult(response.data ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("Something went wrong analysing this area");
        setIsLoading(false);
      });
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { analyse, result, isLoading, error, reset };
}
