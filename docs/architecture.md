# System Architecture

Farm Footprint Explorer is a geospatial web app for analysing environmental land use data within a user-drawn area. This document describes how the system is structured, how data flows through it, and the key design decisions that shape each layer.

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser (React 19)                          │
│                                                                 │
│   ┌─────────────┐   ┌─────────────┐   ┌───────────────────┐    │
│   │  Map.tsx    │   │  index.tsx  │   │  ResultsPanel.tsx │    │
│   │ (MapLibre)  │──▶│ (orchestr.) │◀──│  (results UI)     │    │
│   └─────────────┘   └──────┬──────┘   └───────────────────┘    │
│                            │ useFootprintAnalysis hook           │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTP POST /footprint/analyse
                             │ (auto-generated OpenAPI client)
┌────────────────────────────┼────────────────────────────────────┐
│                     FastAPI Backend                             │
│                            │                                    │
│              ┌─────────────▼──────────────┐                    │
│              │   routes/footprint.py       │                    │
│              │  POST /footprint/analyse    │                    │
│              └─────────────┬──────────────┘                    │
│                            │                                    │
│              ┌─────────────▼──────────────┐                    │
│              │   services/land_analysis.py │                    │
│              │   (orchestrator)            │                    │
│              └──┬──────────┬──────────────┘                    │
│                 │          │                                    │
│    ┌────────────▼───┐  ┌───▼──────────────┐                    │
│    │  gfw_client.py │  │  5× PostGIS SQL   │                    │
│    │  alert_         │  │  queries via     │                    │
│    │  ingestion.py  │  │  SQLAlchemy       │                    │
│    └────────────┬───┘  └───┬──────────────┘                    │
└─────────────────┼──────────┼───────────────────────────────────┘
                  │          │
     ┌────────────▼───┐  ┌───▼───────────────┐
     │  GFW API       │  │  PostgreSQL 15     │
     │  (live alerts) │  │  + PostGIS 3.3     │
     └────────────────┘  └───────────────────┘
```

---

## Frontend

### Stack

| Concern | Technology |
|---------|-----------|
| Framework | TanStack Start (SSR React) |
| UI | React 19 |
| Map | MapLibre GL JS |
| Data overlays | Deck.gl |
| API client | Auto-generated via `@hey-api/openapi-ts` |
| Styling | Tailwind CSS |
| Language | TypeScript (strict) |
| Tests | Vitest + React Testing Library |

### Component Structure

```
routes/index.tsx          — top-level orchestrator; owns all state
├── components/Map.tsx    — MapLibre map, draw hooks, result overlays
├── DrawControls.tsx      — mode switcher and clear button
└── ResultsPanel.tsx      — pure presentational results sidebar

hooks/useFootprintAnalysis.ts  — API communication + AbortController
client/                        — generated OpenAPI client (do not edit)
```

### Data Flow (frontend)

1. User selects "pin" or "polygon" draw mode.
2. `Map.tsx` collects clicks via custom draw hooks (`useMapMarker`, `useMapPolygonDraw`), emitting a GeoJSON geometry via `onGeometryChange`.
3. `index.tsx` receives the geometry and runs a preflight size check using `@turf/area` — polygons > 500,000 ha are rejected immediately with a user-facing error.
4. If valid, `useFootprintAnalysis.analyse(geometry)` is called. The hook cancels any in-flight request via `AbortController`, then calls the auto-generated `analyseFootprintAnalysePost()` function.
5. On success, `result` is populated; `ResultsPanel` renders land cover, alert count, confidence breakdown, and yearly trend.
6. On analysis complete, `Map.tsx` increases polygon fill opacity and renders a ring overlay for point queries.

### Key Design Choices

- **No hand-written fetch calls.** The API client is generated from the backend's `/openapi.json`. Running `scripts/generate-client.sh` after any backend schema change keeps types in sync.
- **AbortController prevents race conditions.** Drawing a new geometry cancels the previous in-flight request so stale results never overwrite fresh ones.
- **Size validation at two layers.** Turf.js gives instant client feedback; Pydantic validates again on the backend (defence in depth).
- **No charting library.** Land cover stacked bars and yearly alert bars use proportional `div` widths with Tailwind — zero extra dependencies.

---

## Backend

### Stack

| Concern | Technology |
|---------|-----------|
| Framework | FastAPI |
| Language | Python 3.12+ |
| Async ORM | SQLAlchemy (async) + asyncpg |
| Migrations | Alembic |
| Geospatial | PostGIS, GeoAlchemy2, Shapely, pyproj |
| HTTP client | httpx (async) |
| Tests | pytest + pytest-asyncio + httpx |
| Package manager | uv |

### Module Responsibilities

| File | Responsibility |
|------|---------------|
| `main.py` | FastAPI app factory, CORS middleware, router registration |
| `config.py` | Pydantic `Settings` — reads `.env`, exposes `get_settings()` dependency |
| `db.py` | SQLAlchemy async engine + `get_db()` dependency |
| `models/footprint.py` | ORM: `LandCoverPolygon`, `DeforestationAlert` |
| `schemas/footprint.py` | Pydantic request/response validation; polygon size validator |
| `api/routes/footprint.py` | Single endpoint: `POST /footprint/analyse` |
| `services/land_analysis.py` | Orchestrator: ingest alerts, run 5 spatial queries, build response |
| `services/gfw_client.py` | httpx client for the GFW Integrated Alerts API |
| `services/alert_ingestion.py` | Batch upsert of GFW alerts into PostGIS |

### Request Lifecycle

```
POST /footprint/analyse
  │
  ├─ 1. Pydantic validates AnalyseRequest
  │      • geometry is Point or Polygon (discriminated union)
  │      • buffer_km > 0 if provided
  │      • polygon area ≤ 500,000 ha (pyproj.Geod on WGS84 ellipsoid)
  │      → returns 422 immediately if invalid
  │
  ├─ 2. FastAPI injects db (AsyncSession) and settings (Settings)
  │
  └─ 3. land_analysis.analyse_footprint()
         │
         ├─ Ingest: fetch live GFW alerts → batch upsert
         │   • On failure: logs warning, proceeds with cached data
         │   • alerts_live=False signals fallback to frontend
         │
         ├─ Query 1: area (ST_Area) + centroid (ST_Centroid)
         ├─ Query 2: land cover intersection (ST_Intersects, ST_Area)
         ├─ Query 3: total alerts within polygon (ST_Within)
         ├─ Query 4: alerts grouped by confidence level
         └─ Query 5: alerts grouped by year
```

### Database Schema

#### `land_cover_polygons`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `geometry` | Geometry(POLYGON, 4326) | PostGIS column |
| `cover_type` | VARCHAR | e.g. `tree_cover`, `cropland` |
| `source` | VARCHAR | Attribution |
| `year` | INTEGER | Coverage year |
| `created_at` | TIMESTAMP | Ingestion time |

#### `deforestation_alerts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `geometry` | Geometry(POINT, 4326) | PostGIS column |
| `alert_date` | DATE | When alert occurred |
| `confidence` | VARCHAR | `high`, `nominal`, `low`, `other` |
| `area_ha` | FLOAT | Set to 0.0 on ingest (not in GFW payload) |
| `source` | VARCHAR | `gfw_integrated_alerts` |
| `longitude` | FLOAT | De-normalised for unique constraint |
| `latitude` | FLOAT | De-normalised for unique constraint |
| `created_at` | TIMESTAMP | Ingestion time |
| **UNIQUE** | `(longitude, latitude, alert_date, source)` | Prevents duplicate ingestion |

De-normalised coordinates exist because PostGIS geometry columns cannot participate in `UNIQUE` constraints. The constraint enables idempotent re-ingestion via `ON CONFLICT DO NOTHING`.

### Spatial Query Strategy

All five queries use SQLAlchemy `text()` with named parameters to prevent SQL injection. Geometry transformation pattern:

```sql
-- Points: always buffered (default 1 km)
ST_Transform(
    ST_Buffer(
        ST_Transform(ST_GeomFromGeoJSON(:geojson), 3857),
        :buffer_m
    ),
    4326
)

-- Polygons: used as-is (or buffered if buffer_km provided)
ST_GeomFromGeoJSON(:geojson)
```

SRID 3857 (Web Mercator) is used for the buffer operation to work in metres rather than degrees.

### GFW Alert Ingestion

```
gfw_client.fetch_deforestation_alerts()
    HTTP POST to GFW API (follow_redirects=True — GFW returns 307 to versioned endpoint)
    Returns list[GFWAlert]

alert_ingestion.ingest_alerts_for_geometry()
    Splits alerts into ~500-row batches (asyncpg parameter limit ~32k)
    For each batch:
        INSERT INTO deforestation_alerts (...) VALUES (...)
        ON CONFLICT (longitude, latitude, alert_date, source) DO NOTHING
        RETURNING id
    Returns (new_row_count, alerts_live=True)

    On any exception:
        logger.warning(...)
        Returns (0, alerts_live=False)
```

---

## Infrastructure

### Docker Compose (local dev)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `db` | `postgis/postgis:15-3.3` | 5432 | PostgreSQL + PostGIS |
| `backend` | custom Dockerfile | 8000 | FastAPI app |
| `frontend` | custom Dockerfile | 3000 | TanStack Start / Vite dev server |

`pgdata` volume persists the database across container restarts.

### CI (GitHub Actions)

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `ci-backend.yml` | PR / push | Spin up PostGIS container → `uv run pytest` |
| `ci-frontend.yml` | PR / push | `pnpm vitest` + `tsc --noEmit` |

Both workflows must pass before a PR can be merged into `main`.

---

## API Contract

The backend auto-generates an OpenAPI spec at `/openapi.json`. The frontend consumes a generated TypeScript client — never hand-written fetch calls.

### `POST /footprint/analyse`

**Request**

```json
{
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[lon, lat], ...]]
  },
  "buffer_km": 1.0
}
```

**Response**

```json
{
  "area_ha": 12345.6,
  "centroid": [32.5, -1.2],
  "land_cover": [
    { "type": "tree_cover", "percentage": 67.3 }
  ],
  "deforestation_alerts": {
    "count": 42,
    "area_ha": 18.5,
    "period": "2024-01-01/2025-01-01",
    "by_confidence": [
      { "level": "high", "count": 20, "area_ha": 10.0 }
    ],
    "by_year": [
      { "year": 2024, "count": 42, "area_ha": 18.5 }
    ]
  },
  "alerts_live": true,
  "alerts_fetched_at": "2025-03-04T10:23:00Z"
}
```

**Error responses**

| Status | Cause |
|--------|-------|
| 422 | Validation failure (oversized polygon, invalid geometry, negative buffer) |
| 500 | Unhandled server error |

---

## Environment Variables

### Backend (`.env`, gitignored)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `postgresql+asyncpg://user:pass@host:port/db` |
| `GFW_API_KEY` | Yes | Global Forest Watch API key |
| `GFW_API_BASE_URL` | No | Defaults to GFW production URL |
| `GFW_ALERTS_LOOKBACK_DAYS` | No | Default: 365 |
| `ENVIRONMENT` | No | `development` / `production` |
| `CORS_ORIGINS` | No | Default: `http://localhost:5173` |

### Frontend (`.env.local`, gitignored)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | e.g. `http://localhost:8000` |
| `VITE_MAPTILER_KEY` | No | MapTiler free-tier key (falls back to OSM tiles) |

---

## Data Sources

| Source | What it provides | Access |
|--------|-----------------|--------|
| GFW Integrated Alerts | Deforestation alerts (GLAD + RADD + CCDC) | Free API key from globalforestwatch.org |
| ESA WorldCover | Land cover classification at 10 m | Stored in PostGIS (pre-loaded) |
| MapTiler / OSM | Base map tiles | Free tier (MapTiler) or public OSM |
