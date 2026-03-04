# Contributing to Farm Footprint Explorer

## Getting Started

Set up the full stack locally before making any changes:

→ [docs/runbooks/local-dev-setup.md](docs/runbooks/local-dev-setup.md)

---

## Workflow

### Branches and PRs

- Never commit directly to `main`.
- Create a branch per task: `feat/`, `fix/`, `chore/` prefixes are fine.
- Each PR should do one thing. Mixing a feature and a refactor in the same PR makes review harder.
- Open the PR when you're ready for review, not before. Draft PRs are fine for early feedback.
- CI must pass before merging. Self-review is acceptable on a solo project; on a team, at least one other reviewer is required.

### Commit messages

Write commits in the imperative: "Add polygon size validation", not "Added" or "Adding". Keep the subject line under 72 characters. If the why isn't obvious, add a body.

---

## Test-Driven Development

Write tests before or alongside implementation — not after.

### Backend

Every route and service function needs a corresponding pytest test. Run the full suite:

```bash
cd backend

DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
TEST_DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
uv run pytest --cov=app --cov-report=term-missing -v
```

Tests use a real PostGIS database. The `db_session` fixture rolls back after each test — no manual cleanup needed. GFW API calls are mocked by default via the `mock_ingest` autouse fixture in `conftest.py`; use `respx` to mock httpx in `test_gfw_client.py`.

### Frontend

Every component needs a Vitest + React Testing Library test for its key behaviours. Run:

```bash
cd frontend
pnpm test          # watch mode
pnpm test --run    # single pass (CI)
pnpm typecheck     # tsc --noEmit
```

Prefer testing behaviour over implementation: "the results panel shows an alert count" rather than "the component calls setState with X".

---

## Backend Conventions

### Schema changes

Pydantic schemas in `app/schemas/footprint.py` define the API contract. When adding or changing fields:

1. Update the schema.
2. Update `model_config["json_schema_extra"]["examples"]` so the `/docs` UI stays accurate.
3. Regenerate the frontend client (see below).
4. Input validation belongs in the Pydantic layer — not in service code. Invalid requests should return 422 before touching the database.

### Database changes

Use Alembic for all schema changes. Never alter the production schema by hand.

→ [docs/runbooks/database-migrations.md](docs/runbooks/database-migrations.md)

### Spatial queries

All PostGIS queries use `text()` with named parameters to prevent SQL injection. Geometry columns use SRID 4326. Buffer operations use SRID 3857 (metres), then transform back to 4326.

---

## Frontend Conventions

### API calls

**Never hand-write fetch calls to the backend.** The TypeScript client is generated from the OpenAPI spec. After any backend schema change:

```bash
# Backend must be running
./scripts/generate-client.sh
```

Then run `pnpm typecheck` — the compiler surfaces every callsite that needs updating.

→ [docs/decisions/004-generated-api-client.md](docs/decisions/004-generated-api-client.md) explains why.

### TypeScript

`"strict": true` is non-negotiable. No `any`, no `// @ts-ignore`. All API response types come from the generated client.

### Component responsibilities

- `routes/index.tsx` — state, event wiring, no direct rendering logic
- `components/Map.tsx` — map initialisation and overlays only
- `components/ResultsPanel.tsx` — purely presentational; receives all data as props
- `hooks/useFootprintAnalysis.ts` — API communication and loading/error state

Keep this separation. If a component is reaching into another's concern, that's a signal to rethink the boundary.

---

## Architecture Decisions

Before making a significant architectural change, write an ADR in `docs/decisions/`. Existing decisions are documented there — read them before revisiting a choice.

→ [docs/decisions/](docs/decisions/)

---

## CI

Two workflows run on every PR:

| Workflow | What it checks |
|----------|---------------|
| `ci-backend.yml` | `pytest` against a PostGIS container |
| `ci-frontend.yml` | `vitest --run` + `tsc --noEmit` |

If CI is red, fix it before asking for review.
