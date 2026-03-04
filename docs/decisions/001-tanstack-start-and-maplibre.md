# ADR 001 — TanStack Start + MapLibre GL JS

**Status:** Accepted
**Date:** 2025-01

---

## Context

The app needs a React frontend that can:

- Render an interactive world map with custom draw controls
- Display result overlays (polygons, points, data layers) on top of the map
- Call a FastAPI backend and render structured analysis results
- Be maintainable with TypeScript strict mode

Two independent decisions were made: the **React framework** and the **mapping library**.

---

## Decision 1 — TanStack Start (framework)

### Options considered

| Option | Notes |
|--------|-------|
| **TanStack Start** | SSR React framework, file-based routing, Vite-native, tight TS integration |
| Next.js | Most popular SSR option; React Server Components; large ecosystem |
| Plain Vite + React SPA | Minimal setup; no SSR |

### Decision

**TanStack Start.**

### Rationale

- **Vite-native.** TanStack Start builds on top of Vite, which is already required for the project. No separate bundler or config to manage.
- **File-based routing that stays simple.** `routes/index.tsx` and `routes/about.tsx` — that's it. The router doesn't add complexity until we need it.
- **Strong TypeScript integration.** Type-safe routing and loaders out of the box, consistent with the project's strict-TS stance.
- **No lock-in to React Server Components.** At this project's scale a client-rendered map page is the right model. Next.js's RSC model adds mental overhead and friction when the primary UI is a canvas-based map.
- **Ecosystem fit.** TanStack Start, Router, and Query are all designed to work together; the team is already using TanStack idioms.

### Trade-offs accepted

- Smaller community and fewer tutorials than Next.js.
- SSR for a map-heavy app provides limited SEO benefit — the main page renders client-side anyway.
- TanStack Start was in early release when adopted; some API churn is expected.

---

## Decision 2 — MapLibre GL JS (mapping library)

### Options considered

| Option | Notes |
|--------|-------|
| **MapLibre GL JS** | Open-source fork of Mapbox GL JS; vector tiles; WebGL renderer |
| Mapbox GL JS | Commercial licence required for many use cases; identical API to MapLibre |
| Leaflet | Mature, lightweight; raster tile–based; limited native WebGL support |
| Google Maps JS API | Proprietary; per-request billing |

### Decision

**MapLibre GL JS**, with Deck.gl for data overlays.

### Rationale

- **Open source with no licence cost.** MapLibre is the community-maintained fork of Mapbox GL JS, created after Mapbox changed to a proprietary licence in v2. The API is nearly identical to Mapbox GL JS v1.
- **WebGL renderer.** Smooth 60 fps pan/zoom, hardware-accelerated rendering, and vector tile support — necessary for a map that will eventually render large polygon datasets.
- **Deck.gl composability.** Deck.gl renders on a separate WebGL context that sits over MapLibre, enabling high-performance data overlays (GeoJSON layers, scatter plots, heatmaps) without re-implementing the map renderer.
- **Free tile providers available.** MapTiler offers a free tier compatible with MapLibre styles. The app falls back to an OSM raster style when no key is configured.
- **Custom draw controls are straightforward.** The MapLibre GL Draw plugin or custom mouse event handlers are well-documented. The project uses custom hooks (`useMapMarker`, `useMapPolygonDraw`) rather than a third-party draw plugin to keep control of the UX.

### Trade-offs accepted

- MapLibre lacks the managed hosting and support of the Mapbox commercial product.
- Custom draw controls require more implementation work than a bundled draw plugin.
- Deck.gl adds bundle weight; acceptable given the data visualisation requirements.

---

## Consequences

- Frontend uses `pnpm` as package manager (lockfile committed as `pnpm-lock.yaml`).
- All routing is file-based under `frontend/app/routes/`.
- Map initialisation happens in `components/Map.tsx`; draw logic lives in custom hooks.
- Tile style URL is configured via `VITE_MAPTILER_KEY`; absence falls back to an OSM JSON style.
- This decision is not easily reversible — migrating map libraries requires rewriting all draw hooks and layer management. Revisit only if MapLibre has a serious maintenance issue.
