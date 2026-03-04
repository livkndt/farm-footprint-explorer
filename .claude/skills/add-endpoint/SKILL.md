---
description: Add a new FastAPI endpoint to Farm Footprint Explorer following the TDD workflow — schema first, then route, then service, then tests, then client regeneration.
argument-hint: "[brief description of the endpoint, e.g. 'GET /footprint/history']"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

You are adding a new FastAPI endpoint to Farm Footprint Explorer. The request is: $ARGUMENTS

Follow this workflow in order. Do not skip steps.

## 1. Clarify before writing any code

If not already clear from the request, establish:
- HTTP method and path (e.g. `GET /footprint/history`)
- What the request body or query params look like
- What the response contains
- Whether it needs database access, GFW ingestion, or neither

## 2. Define Pydantic schemas first

Edit `backend/app/schemas/footprint.py` (or create a new schema file if this is a distinct domain).

Rules:
- All validation belongs here — not in the route or service
- Use `model_validator(mode="after")` for cross-field validation
- Update `model_config["json_schema_extra"]["examples"]` with realistic payloads so `/docs` shows valid examples
- For geometry inputs, use the existing `AnalyseRequest` pattern (discriminated union of `PointGeometry` | `PolygonGeometry`)

## 3. Write the pytest tests next (TDD)

Write tests in `backend/tests/test_footprint.py` before implementing the route.

Key fixtures available in `conftest.py`:
- `db_session` — async SQLAlchemy session, rolls back after each test (never call commit)
- `mock_ingest` — autouse fixture that patches `ingest_alerts_for_geometry`; override if testing ingestion
- `seed_land_cover(db_session, ...)` and `seed_alert(db_session, ...)` — insert test data
- `client` — httpx `AsyncClient` pointed at the test app

Test both happy path and validation failures (422 responses). Run to confirm they fail before implementing:

```bash
cd backend
DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
TEST_DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
uv run pytest tests/test_footprint.py -v -k "test_your_new_test"
```

## 4. Add the route handler

Edit `backend/app/api/routes/footprint.py`.

Rules:
- Route handlers are thin — validate (via Pydantic, automatic) + inject dependencies + call service. No business logic.
- Always `async def`
- Inject `db: AsyncSession = Depends(get_db)` and `settings: Settings = Depends(get_settings)` only if needed
- Set `response_model=YourResponseSchema` on the decorator

```python
@router.get("/footprint/your-path", response_model=YourResponse)
async def your_handler(
    db: AsyncSession = Depends(get_db),
) -> YourResponse:
    return await your_service.your_function(db=db)
```

## 5. Implement the service function

Add the function in `backend/app/services/land_analysis.py` (or a new service file if clearly separate).

Rules:
- All PostGIS queries use `text()` with named parameters — no f-strings in SQL
- Geometry stored in SRID 4326; buffer operations use SRID 3857, then transform back
- Handle the "no results" case gracefully (don't raise, return empty/zero values)

## 6. Run the full test suite

```bash
cd backend
DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
TEST_DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
uv run pytest --cov=app --cov-report=term-missing -v
```

All tests must pass before continuing.

## 7. Regenerate the frontend client

The frontend client must be regenerated any time request or response schemas change.

```bash
# Backend must be running
uv run uvicorn app.main:app --reload &
sleep 2
cd ..
./scripts/generate-client.sh
```

Then verify the frontend still type-checks:

```bash
cd frontend && pnpm typecheck
```

Fix any TypeScript errors before committing.

## 8. Commit

Stage backend changes and the regenerated client together in a single commit. Don't commit them separately — a mismatched client and schema breaks the frontend.
