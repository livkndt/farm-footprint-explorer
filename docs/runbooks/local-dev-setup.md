# Runbook — Local Development Setup

This runbook gets the full stack running locally from scratch: database, backend, and frontend.

---

## Prerequisites

| Tool | Install |
|------|---------|
| Docker + Docker Compose | [docs.docker.com](https://docs.docker.com/get-docker/) |
| `uv` (Python package manager) | `brew install uv` |
| `pnpm` (Node package manager) | `npm install -g pnpm` |
| Node.js 18+ | [nodejs.org](https://nodejs.org) or `brew install node` |

---

## Step 1 — Clone and configure environment

```bash
git clone <repo-url>
cd farm-footprint-explorer
```

Copy the environment file templates:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local   # if it exists
```

Edit `backend/.env` and fill in:

```bash
DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint
GFW_API_KEY=<your-key>          # from globalforestwatch.org/developer
ENVIRONMENT=development
```

Edit `frontend/.env.local` (or create it):

```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_MAPTILER_KEY=<your-key>    # optional — from maptiler.com free tier
                                 # if omitted, falls back to OSM tiles
```

---

## Step 2 — Start the database

```bash
docker compose up -d db
```

Verify it's running:

```bash
docker compose ps
# db should show "Up" and port 5432 mapped
```

Wait a few seconds for PostgreSQL to initialise, then confirm connectivity:

```bash
docker compose exec db psql -U farmuser -d farmfootprint -c "SELECT PostGIS_Version();"
# Should print a PostGIS version string
```

---

## Step 3 — Backend setup

All commands run from the `backend/` directory. `uv` manages the virtual environment automatically.

```bash
cd backend

# Install Python dependencies (creates/updates .venv)
uv sync

# Run database migrations
uv run alembic upgrade head
```

Expected output from migrations:

```
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, create_spatial_tables
INFO  [alembic.runtime.migration] Running upgrade 0001 -> 0002, add_alert_unique_constraint
```

Start the development server:

```bash
uv run uvicorn app.main:app --reload
```

Verify:

```bash
curl http://localhost:8000/health
# {"status":"ok"}

# OpenAPI docs available at:
open http://localhost:8000/docs
```

---

## Step 4 — Frontend setup

```bash
cd frontend

# Install Node dependencies
pnpm install

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the map.

---

## Step 5 — Verify the full stack

1. Open the map at `http://localhost:3000`
2. Click "Polygon" and draw a small polygon somewhere with known deforestation (e.g. Amazon basin)
3. The results panel should populate with land cover and alert data
4. Check the backend logs — you should see the GFW API request and SQL queries

---

## Regenerating the API client

After any backend schema change (request/response fields), regenerate the frontend client:

```bash
# Backend must be running at http://localhost:8000
./scripts/generate-client.sh
```

If you can't run the backend (e.g. in CI or during schema work), manually edit `frontend/app/client/types.gen.ts` to match the new schema, then run `pnpm typecheck` to verify.

---

## Common Issues

### `DATABASE_URL` not set / connection refused

The backend reads `DATABASE_URL` at import time and will fail immediately if it's not set or if the database isn't running.

```bash
# Check the db container is up
docker compose ps

# If not running:
docker compose up -d db

# Re-start the backend after the db is up
```

### Port 5432 already in use

Another PostgreSQL process is running on your machine.

```bash
# Find the conflicting process
lsof -i :5432

# Option A: stop the local Postgres
brew services stop postgresql

# Option B: change the host port in docker-compose.yml
# e.g. "5433:5432" and update DATABASE_URL accordingly
```

### `uv sync` fails (Python version)

`uv` will use Python 3.12 as specified in `pyproject.toml`. If it can't find one:

```bash
uv python install 3.12
uv sync
```

### Frontend can't reach backend (CORS error)

Check that `VITE_API_BASE_URL` in `frontend/.env.local` matches where the backend is actually running (default: `http://localhost:8000`).

Check the backend's `CORS_ORIGINS` setting — it defaults to `http://localhost:5173` but the frontend dev server runs on port 3000. If you see CORS errors, set:

```bash
# backend/.env
CORS_ORIGINS=http://localhost:3000
```

### Map tiles not loading

The map falls back to OSM tiles if `VITE_MAPTILER_KEY` is not set. If even OSM tiles don't load, check browser network tab for the tile request and verify internet connectivity.

---

## Stopping Everything

```bash
# Stop frontend and backend: Ctrl+C in each terminal

# Stop the database container
docker compose down

# To also delete the database volume (destructive — loses all data)
docker compose down -v
```
