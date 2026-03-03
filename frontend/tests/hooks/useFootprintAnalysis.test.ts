import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/client");

import { analyseFootprintAnalysePost } from "../../app/client";
import { useFootprintAnalysis } from "../../app/hooks/useFootprintAnalysis";

const mockPost = vi.mocked(analyseFootprintAnalysePost);

const pointGeometry = {
  type: "Point" as const,
  coordinates: [10, 20] as [number, number],
};

const fixtureResult = {
  area_ha: 100.5,
  centroid: [10, 20],
  land_cover: [
    { type: "tree_cover", percentage: 60 },
    { type: "cropland", percentage: 40 },
  ],
  deforestation_alerts: {
    count: 2,
    area_ha: 5.3,
    period: "2023",
  },
};

const successResponse = {
  data: fixtureResult,
  error: undefined,
  request: {} as Request,
  response: {} as Response,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFootprintAnalysis", () => {
  it("sets isLoading true immediately when analyse is called", () => {
    // Never-resolving promise so we can inspect the loading state
    mockPost.mockReturnValue(new Promise(() => {}) as never);

    const { result } = renderHook(() => useFootprintAnalysis());

    act(() => {
      result.current.analyse(pointGeometry);
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets result on success", async () => {
    mockPost.mockResolvedValue(successResponse as never);

    const { result } = renderHook(() => useFootprintAnalysis());

    await act(async () => {
      result.current.analyse(pointGeometry);
    });

    expect(result.current.result).toEqual(fixtureResult);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error on failure and clears isLoading", async () => {
    mockPost.mockResolvedValue({
      data: undefined,
      error: { detail: [] },
      request: {} as Request,
      response: {} as Response,
    } as never);

    const { result } = renderHook(() => useFootprintAnalysis());

    await act(async () => {
      result.current.analyse(pointGeometry);
    });

    expect(result.current.error).toBe(
      "Something went wrong analysing this area"
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it("reset clears result, error, and isLoading", async () => {
    mockPost.mockResolvedValue(successResponse as never);

    const { result } = renderHook(() => useFootprintAnalysis());

    await act(async () => {
      result.current.analyse(pointGeometry);
    });

    expect(result.current.result).toEqual(fixtureResult);

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("concurrent calls cancel the previous — only second result is set", async () => {
    let resolve1!: (value: unknown) => void;
    const deferred1 = new Promise((resolve) => {
      resolve1 = resolve;
    });

    const result2Data = { ...fixtureResult, area_ha: 999 };

    mockPost
      .mockReturnValueOnce(deferred1 as never)
      .mockResolvedValueOnce({
        data: result2Data,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      } as never);

    const { result } = renderHook(() => useFootprintAnalysis());

    // Start first (slow) call
    act(() => {
      result.current.analyse(pointGeometry);
    });

    // Immediately start second call — aborts first
    await act(async () => {
      result.current.analyse(pointGeometry);
    });

    // Wait for second to settle
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Resolve the first (its controller is aborted — state update must be ignored)
    await act(async () => {
      resolve1({
        data: fixtureResult,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      });
      await Promise.resolve();
    });

    expect(result.current.result).toEqual(result2Data);
    expect(result.current.result?.area_ha).toBe(999);
  });
});
