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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch, commit, and PR conventions.

## Documentation

- [Architecture overview](docs/architecture.md)
- [Architecture decision records](docs/decisions/)
- [Runbooks](docs/runbooks/) — local dev setup, migrations, GFW integration testing
