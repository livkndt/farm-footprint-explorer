# Frontend — TanStack Start + MapLibre

## Stack

- **Framework:** TanStack Start (SSR React, file-based routing, Vite-native)
- **Map:** MapLibre GL JS + Deck.gl for overlays
- **Language:** TypeScript strict mode — no `any`, no `// @ts-ignore`
- **Package manager:** pnpm
- **Testing:** Vitest + React Testing Library

## Commands

```bash
# From frontend/
pnpm install
pnpm dev              # dev server at http://localhost:3000
pnpm test             # watch mode
pnpm test --run       # single pass (CI)
pnpm typecheck        # tsc --noEmit
```

## Generated API client — the most important rule

**Never hand-write fetch calls to the backend.**

The client in `app/client/` is generated from the backend's OpenAPI spec. All three files (`client.gen.ts`, `types.gen.ts`, `services.gen.ts`) are committed and must not be edited by hand — changes are overwritten on next regeneration.

After any backend schema change:

```bash
# Backend must be running at http://localhost:8000
./scripts/generate-client.sh

# Then check every affected callsite
pnpm typecheck
```

If you can't run the backend, manually edit `app/client/types.gen.ts` as a stopgap, then run `pnpm typecheck`. Regenerate properly before merging.

The client is configured once at startup in `app/main.tsx`:
```typescript
client.setConfig({ baseUrl: import.meta.env.VITE_API_BASE_URL });
```
No other file needs to know the base URL.

## Component responsibilities

| File | Owns |
|------|------|
| `routes/index.tsx` | All state (`mode`, `geometry`, `result`, `isLoading`, `error`), event wiring, size preflight check |
| `components/Map.tsx` | Map initialisation, draw hooks, result overlays — no business logic |
| `components/ResultsPanel.tsx` | Pure presentational — all data via props, no direct API calls |
| `hooks/useFootprintAnalysis.ts` | API communication, AbortController, loading/error state |
| `components/DrawControls.tsx` | Mode switcher and clear button — no map interaction |

Don't reach across these boundaries. If a component needs something from another's domain, lift state or pass props.

## Key patterns

### AbortController in `useFootprintAnalysis`
`analyse()` cancels any in-flight request before starting a new one. This prevents race conditions when a user draws a new geometry before the previous request completes. Do not remove the abort logic.

### Size validation (two layers — both intentional)
`index.tsx` checks polygon area with `@turf/area` before calling the API (`> 500,000 ha → show sizeError, skip API call`). The backend validates again with `pyproj.Geod`. Both layers are needed: the frontend gives instant feedback, the backend is the authoritative check.

### Map overlays
MapLibre sources/layers are added imperatively inside `useEffect`. Clean them up on unmount or when `clearTrigger` increments — leaked sources cause `"Source already exists"` errors.

## Testing conventions

- Mock the `Map` component in `index.tsx` tests — MapLibre can't render in jsdom.
- Mock `useFootprintAnalysis` hook when testing `index.tsx` — test state wiring, not HTTP.
- Use `vi.mock('../../app/client')` + `vi.mocked(analyseFootprintAnalysePost)` in hook tests.
- **Text matchers:** use exact strings for UI text that appears in multiple places. `getByText("high")` not `getByText(/high/i)` — the GFW info callout also contains the word "high" and will cause ambiguous matches.
- `ResultsPanel` is pure presentational — test it by passing props directly, no mocking needed.
