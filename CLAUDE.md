# Farm Footprint Explorer

## WHY

A geospatial web app for analysing environmental land use within a user-drawn area. Drop a pin or draw a polygon — get deforestation alerts, land cover breakdown, and area metrics for that footprint. Built as a learning project exploring PostGIS spatial queries, live GFW alert ingestion, and a generated API client pattern.

## WHAT

```
farm-footprint-explorer/
├── backend/                 Python FastAPI app
│   ├── app/
│   │   ├── main.py          App factory + CORS
│   │   ├── config.py        Pydantic Settings (reads .env)
│   │   ├── db.py            SQLAlchemy async engine + get_db dep
│   │   ├── api/routes/      HTTP endpoints (footprint.py)
│   │   ├── schemas/         Pydantic request/response + validation
│   │   ├── models/          SQLAlchemy ORM (LandCoverPolygon, DeforestationAlert)
│   │   └── services/        Business logic (land_analysis, gfw_client, alert_ingestion)
│   ├── alembic/             Migrations — see backend/alembic/CLAUDE.md
│   └── tests/               pytest suite
├── frontend/                TanStack Start (SSR React) app
│   ├── app/
│   │   ├── routes/          index.tsx (main page), about.tsx
│   │   ├── components/      Map.tsx, ResultsPanel.tsx, DrawControls.tsx
│   │   ├── hooks/           useFootprintAnalysis.ts
│   │   └── client/          Generated OpenAPI client — DO NOT EDIT
│   └── tests/               Vitest + RTL suite
├── docs/
│   ├── architecture.md      System overview and data flow
│   ├── decisions/           ADRs (001–004)
│   └── runbooks/            Local setup, migrations, GFW testing
├── scripts/
│   └── generate-client.sh   Regenerates frontend/app/client/ from /openapi.json
└── docker-compose.yml       db (PostGIS), backend, frontend
```

## HOW

### Rules

- **TDD.** Write tests before or alongside code, never after. CI blocks merge on failure.
- **One thing per PR.** Small, focused branches off `main`. Never commit directly to `main`.
- **Commits.** Imperative subject line, under 72 chars: `"Add polygon size validation"` not `"Added"`.
- **API contract.** Backend defines it via OpenAPI. Frontend consumes a generated client — never hand-written fetch calls. Run `./scripts/generate-client.sh` after any schema change.
- **Validate at the boundary.** Input validation belongs in Pydantic schemas, not service code.

### Key commands

```bash
# Database (required before backend)
docker compose up -d db

# Backend
cd backend && uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# Frontend
cd frontend && pnpm install && pnpm dev

# Tests
cd backend && uv run pytest -v                  # backend
cd frontend && pnpm test --run && pnpm typecheck # frontend

# Regenerate API client (backend must be running)
./scripts/generate-client.sh
```

### Environment variables

**`backend/.env`** (copy from `.env.example`, gitignored):
```
DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint
GFW_API_KEY=<key from globalforestwatch.org/developer>
ENVIRONMENT=development
```

**`frontend/.env.local`** (gitignored):
```
VITE_API_BASE_URL=http://localhost:8000
VITE_MAPTILER_KEY=<optional — falls back to OSM tiles>
```

### Further context

- **Backend (FastAPI, services, GFW client)** → `backend/CLAUDE.md`
- **Persistence (spatial schema, migrations)** → `backend/alembic/CLAUDE.md`
- **Frontend (components, generated client)** → `frontend/CLAUDE.md`
- **Architecture** → `docs/architecture.md`
- **Key decisions** → `docs/decisions/`
