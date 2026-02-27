# Farm Footprint Explorer

A geospatial web app where users drop a pin or draw a polygon on a map and see environmental land use data for that area — deforestation alerts, land cover type, and basic environmental metrics.

## Stack

- **Frontend**: TanStack Start (React 19), MapLibre GL JS, Deck.gl, Tailwind CSS, TypeScript
- **Backend**: Python FastAPI, SQLAlchemy (async), PostGIS
- **Database**: PostgreSQL 15 + PostGIS
- **Infrastructure**: Docker Compose (local), GitHub Actions (CI)

## Local dev setup

### Prerequisites

- Docker & Docker Compose
- [uv](https://docs.astral.sh/uv/) (`brew install uv`)
- Node.js 22+ with pnpm (`npm install -g pnpm`)

### Database

```bash
docker compose up -d db
```

### Backend

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

API available at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

App available at `http://localhost:3000`.

### Regenerate API client

Run after any backend schema or route change:

```bash
./scripts/generate-client.sh
```

## Running tests

```bash
# Backend
cd backend && uv run pytest --cov=app

# Frontend
cd frontend && pnpm test
```

## PR workflow

- All work happens on feature branches — never commit directly to `main`
- Each PR should do one thing and have a passing CI before merge
- CI runs `pytest` (backend) and `vitest` + `tsc --noEmit` (frontend) on every push
- Branch protection on `main` requires passing CI
