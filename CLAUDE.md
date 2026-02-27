# Farm Footprint Explorer — CLAUDE.md

## Project Overview

Farm Footprint Explorer is a geospatial web app that lets users drop a pin or draw a polygon on a map and see environmental land use data for that area — deforestation alerts, land cover type, and basic environmental metrics.

## Tech Stack

### Frontend
- **Framework**: TanStack Start (SSR React framework)
- **UI**: React 19
- **Build**: Vite
- **Maps**: MapLibre GL JS (open source Mapbox alternative) + Deck.gl for data overlays
- **API client**: Auto-generated from OpenAPI spec using `@hey-api/openapi-ts`
- **Styling**: Tailwind CSS
- **Language**: TypeScript (strict mode)
- **Testing**: Vitest + React Testing Library

### Backend
- **Framework**: Python FastAPI
- **Language**: Python 3.12+
- **Database ORM**: SQLAlchemy (async) with Alembic migrations
- **Geospatial**: PostGIS, GeoPandas, Shapely
- **Testing**: pytest + pytest-asyncio + httpx
- **OpenAPI**: Auto-generated and served at `/openapi.json`

### Database
- **Primary**: PostgreSQL 15+ with PostGIS extension
- **Local dev**: Docker Compose

### Infrastructure
- Docker Compose for local development
- GitHub Actions for CI

## Monorepo Structure

```
farm-footprint-explorer/
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── .github/
│   └── workflows/
│       ├── ci-backend.yml
│       └── ci-frontend.yml
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── api/
│   │   │   └── routes/
│   │   │       └── footprint.py # Main route: POST /footprint/analyse
│   │   ├── services/
│   │   │   └── land_analysis.py # Business logic, geospatial queries
│   │   ├── models/
│   │   │   └── footprint.py     # SQLAlchemy models
│   │   └── schemas/
│   │       └── footprint.py     # Pydantic request/response schemas
│   ├── tests/
│   │   ├── conftest.py
│   │   └── test_footprint.py
│   ├── alembic/
│   │   └── versions/
│   ├── alembic.ini
│   ├── pyproject.toml           # Dependencies + pytest config (managed by uv)
│   ├── uv.lock
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── main.tsx             # React entry point
│   │   ├── routes/
│   │   │   ├── index.tsx        # Map view — main page
│   │   │   └── about.tsx
│   │   ├── components/
│   │   │   ├── Map.tsx          # MapLibre + Deck.gl map
│   │   │   ├── DrawControls.tsx # Polygon draw tool
│   │   │   └── ResultsPanel.tsx # Show analysis results
│   │   └── client/              # Generated OpenAPI client (do not edit)
│   ├── tests/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── Dockerfile
└── scripts/
    └── generate-client.sh       # Regenerate OpenAPI client from backend spec
```

## Development Principles

### Test-Driven Development
- Write tests before or alongside implementation — never after
- Backend: every route and service function has a corresponding pytest test
- Frontend: every component has a Vitest + RTL test for its key behaviours
- CI blocks merging if any test fails

### Iterative, PR-based workflow
- Work in small, focused branches
- Each PR should do one thing and have passing CI before merge
- Never commit directly to `main`

### API-first backend
- The backend defines the contract via OpenAPI
- The frontend consumes a generated client — never hand-writes fetch calls to the backend
- After any backend schema change, run `scripts/generate-client.sh` to regenerate the client

### Strict TypeScript
- `"strict": true` in tsconfig — no `any`, no implicit `any`
- All API response types come from the generated client

### Keep it simple
- Resist premature abstraction
- Each file should have one clear responsibility
- If a file is getting long, that's a signal to split — not to add more abstractions

## Key API Endpoints (target)

```
POST /footprint/analyse
  Body: { geometry: GeoJSON Polygon | Point, buffer_km?: number }
  Response: {
    area_ha: number,
    land_cover: { type: string, percentage: number }[],
    deforestation_alerts: { count: number, area_ha: number, period: string },
    centroid: [lon, lat]
  }

GET /health
  Response: { status: "ok" }
```

## Data Sources (free tiers)

- **Global Forest Watch GLAD alerts** — deforestation alert tiles (public)
- **ESA WorldCover** — land cover classification at 10m resolution (public)
- **OpenStreetMap** via Overpass API — for context layers

## Environment Variables

### Backend
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/farmfootprint
ENVIRONMENT=development
```

### Frontend
```
VITE_API_BASE_URL=http://localhost:8000
VITE_MAPTILER_KEY=your_key   # Free tier from maptiler.com for map tiles
```

## Local Dev Setup

```bash
# Start database
docker compose up -d db

# Backend (uv manages the venv automatically)
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# Frontend
cd frontend
pnpm install
pnpm dev

# Regenerate API client after backend changes
./scripts/generate-client.sh
```

## CI Rules

- Backend CI: runs `pytest` with a test PostgreSQL + PostGIS container
- Frontend CI: runs `vitest` and `tsc --noEmit`
- Both must pass on every PR before merge is allowed
- Branch protection on `main`: require passing CI + at least 1 review (can be self-review if solo)

## What Good Looks Like

A passing test suite, a clean git history of small PRs, and a running app where you can:
1. Open the map
2. Click to drop a pin or draw a polygon
3. See a results panel populate with land cover data and deforestation alert counts for that area
