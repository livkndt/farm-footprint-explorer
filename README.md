# Farm Footprint Explorer

A geospatial web app where users drop a pin or draw a polygon on a map and see environmental land use data for that area — deforestation alerts, land cover type, and basic environmental metrics.

## Stack

- **Frontend**: TanStack Start (React 19), MapLibre GL JS, Deck.gl, Tailwind CSS, TypeScript
- **Backend**: Python FastAPI, SQLAlchemy (async), PostGIS
- **Database**: PostgreSQL 16 + PostGIS
- **Infrastructure**: Docker Compose (local), GitHub Actions (CI)

## Local dev setup

### Option A — Docker Compose (recommended)

Runs the full stack (db, backend, frontend) with a single command.

**Prerequisites:** Docker & Docker Compose

```bash
# Copy and fill in your env files first
cp backend/.env.example backend/.env   # add GFW_API_KEY

# Build images and start everything
docker compose up --build

# First run only: apply database migrations
docker compose exec backend uv run alembic upgrade head
```

| Service  | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| Backend  | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

To stop: `docker compose down`. To wipe the database volume: `docker compose down -v` (re-run the migration step after).

---

### Option B — Manual (frontend hot-reload, faster iteration)

**Prerequisites:**
- Docker & Docker Compose
- [uv](https://docs.astral.sh/uv/) (`brew install uv`)
- Node.js 22+ with pnpm (`npm install -g pnpm`)

```bash
# Database
docker compose up -d db

# Backend
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend
pnpm install
pnpm dev
```

| Service  | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| Backend  | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

### Regenerate API client

Run after any backend schema or route change (backend must be running):

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
