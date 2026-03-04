# Backend — FastAPI + Services

## Stack

- **Runtime:** Python 3.12+, managed by `uv` (`uv sync` creates/updates `.venv`)
- **Framework:** FastAPI with async SQLAlchemy (`asyncpg` driver)
- **Testing:** pytest + pytest-asyncio + httpx; `respx` for httpx mocking
- **Key deps:** GeoAlchemy2, Shapely, pyproj, httpx

## Commands

```bash
# From backend/
uv sync                          # install / sync deps
uv run uvicorn app.main:app --reload   # dev server

# Tests (DATABASE_URL required — db container must be running)
DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
TEST_DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
uv run pytest --cov=app --cov-report=term-missing -v

# Never activate the venv manually — always use `uv run`
```

## FastAPI patterns

- Every route handler is `async def` — no blocking calls on the main thread.
- Dependencies are injected via `Depends()`: `db: AsyncSession = Depends(get_db)` and `settings: Settings = Depends(get_settings)`. Don't instantiate these directly in route handlers.
- `db.py` reads `DATABASE_URL` at import time and fails fast if it's not set — this is intentional.
- The single endpoint lives in `app/api/routes/footprint.py`. It delegates immediately to `services/land_analysis.py`; routes contain no business logic.

## Schema conventions

- Validation belongs in `app/schemas/footprint.py`, not in service code. Invalid requests must return 422 before touching the database.
- After adding or changing any request/response field, update `model_config["json_schema_extra"]["examples"]` so the `/docs` UI stays accurate.
- After any schema change, regenerate the frontend client: `./scripts/generate-client.sh` (backend must be running).
- `AnalyseRequest` uses a `model_validator(mode="after")` to check polygon area via `pyproj.Geod` — area > 500,000 ha raises `ValueError` → 422.

## Services

### `land_analysis.py` — orchestrator

Runs in this order:
1. Ingest live GFW alerts (`alert_ingestion.ingest_alerts_for_geometry`)
2. Five parametrised PostGIS queries (area + centroid, land cover, alert totals, by-confidence, by-year)

All queries use `text()` with named parameters — never f-strings or string concatenation in SQL.

Geometry buffer logic:
- Points: always buffered (default 1 km). Transform to SRID 3857, buffer in metres, transform back to 4326.
- Polygons: used as-is unless `buffer_km` is explicitly set.

Pass `settings=None` to skip GFW ingestion (useful in tests that don't mock it).

### `gfw_client.py` — GFW HTTP client

**Known gotchas:**
- GFW returns HTTP **307 redirect** from `/latest` to a versioned endpoint (e.g. `/v20260304/query/json`). The client uses `follow_redirects=True` — do not remove this.
- The `/auth/apikey/{id}/validate` endpoint is **unreliable** — it may return "Unauthorized" even for a valid key. Always test a key against the actual data endpoint (`/dataset/gfw_integrated_alerts/latest/query/json`).
- Timeout is 30 seconds. For large polygons GFW may return many rows; prefer smaller test polygons when debugging.
- API key goes in `backend/.env` as `GFW_API_KEY`. If missing, the app starts but every analysis returns `alerts_live: false`.

### `alert_ingestion.py` — batch upsert

- Splits alerts into **~500-row batches** because asyncpg has a ~32,767 parameter limit. Each row uses 8 parameters → 500 × 8 = 4,000, safe margin.
- Uses `INSERT ... ON CONFLICT (longitude, latitude, alert_date, source) DO NOTHING RETURNING id` — idempotent, re-ingesting the same date range doesn't create duplicates.
- `area_ha` is set to `0.0` on ingest — the GFW API doesn't return per-alert area.
- If the GFW fetch throws any exception, ingestion returns `(0, False)` and the route proceeds with cached alerts. `alerts_live: false` is surfaced to the frontend.

## Testing conventions

- `db_session` fixture in `conftest.py` rolls back after each test — no explicit cleanup needed, never call `db.commit()` in tests.
- `mock_ingest` is an **autouse** fixture that patches `land_analysis.ingest_alerts_for_geometry` — all route tests skip live GFW calls by default. Override it explicitly when testing ingestion behaviour.
- `get_settings` dependency is overridden in tests to return a mock Settings object.
- `seed_land_cover` and `seed_alert` helpers insert test rows directly via the session.
- Use `respx` to mock httpx calls in `test_gfw_client.py` — do not make real HTTP calls in tests.
- Test polygons must be **under 500,000 ha** (0.5° × 0.5° ≈ 310,000 ha is safe). The oversized test polygon is `[[-50,-50],[50,-50],[50,50],[-50,50],[-50,-50]]` (100° × 100°).
