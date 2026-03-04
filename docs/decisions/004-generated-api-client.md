# ADR 004 — Auto-Generated API Client (No Hand-Written Fetch Calls)

**Status:** Accepted
**Date:** 2026-03

---

## Context

The frontend needs to communicate with the FastAPI backend. Any time the frontend calls the backend there are three things that must stay in sync: the URL and HTTP method, the request body shape, and the response type. In a TypeScript codebase with strict mode enabled, a mismatch between any of these and the actual backend contract is a runtime bug that the compiler won't catch.

A decision was needed on how to manage this contract between frontend and backend.

---

## Options Considered

### Option A — Hand-written fetch calls

Write `fetch()` or `axios` calls directly in the frontend, with manually typed request/response interfaces.

**Pros:**
- No tooling setup
- Full control over the implementation

**Cons:**
- Types must be kept in sync manually — a backend field rename silently breaks the frontend
- No guarantee that the frontend TypeScript types match the Pydantic schemas at any given moment
- Each developer must know the exact URL and HTTP method for every endpoint
- Error handling boilerplate is repeated at every call site

### Option B — Shared type package

Extract shared types into a monorepo package, import them in both backend (via type stubs) and frontend.

**Pros:**
- Types are in one place

**Cons:**
- Backend is Python; frontend is TypeScript — there is no meaningful shared type primitive across the two languages without a separate code generation step anyway
- Still requires hand-written fetch calls

### Option C — Generate client from OpenAPI spec

FastAPI auto-generates an OpenAPI 3.x spec at `/openapi.json` from the Pydantic schemas. Use `@hey-api/openapi-ts` to generate a TypeScript client from that spec.

**Pros:**
- TypeScript types are derived directly from Pydantic models — guaranteed to match at generation time
- URL, method, and request/response types are all in the generated output — frontend code never needs to know these details
- Adding or renaming a field in a Pydantic schema → regenerate → TypeScript compiler immediately catches every callsite that needs updating
- Request serialisation and response deserialisation are handled by the generated client
- The `/docs` UI (Swagger) is also powered by the same spec — no extra documentation effort

**Cons:**
- Requires running the backend to regenerate (or manually syncing `types.gen.ts` during development)
- Generated files must not be edited by hand — changes are overwritten on next regeneration
- Adds a code generation step to the workflow after backend schema changes

---

## Decision

**Generate the TypeScript client from the OpenAPI spec** using `@hey-api/openapi-ts`. Hand-written fetch calls to the backend are prohibited.

---

## How It Works

### Generation

```bash
# Backend must be running at http://localhost:8000
./scripts/generate-client.sh
```

This runs `openapi-ts` against `http://localhost:8000/openapi.json` and writes output to `frontend/app/client/`:

```
frontend/app/client/
├── client.gen.ts      # Singleton client configured with base URL
├── types.gen.ts       # TypeScript interfaces for all schemas
└── services.gen.ts    # One function per endpoint
```

All three files are committed to the repository. Do not edit them by hand — changes will be overwritten.

### Usage in the frontend

```typescript
import { analyseFootprintAnalysePost } from '../client';

const response = await analyseFootprintAnalysePost({
  body: { geometry },
});

if (response.error) {
  // response.error is typed as the backend's error response
} else {
  // response.data is typed as AnalyseResponse
}
```

### Client configuration

The client base URL is set once at app startup in `frontend/app/main.tsx`:

```typescript
import { client } from './client/client.gen';
client.setConfig({ baseUrl: import.meta.env.VITE_API_BASE_URL });
```

No other file needs to know where the backend lives.

---

## Workflow After a Backend Schema Change

1. Edit the Pydantic schema in `backend/app/schemas/footprint.py`
2. Update `model_config["json_schema_extra"]["examples"]` so `/docs` shows realistic payloads
3. Start the backend: `uv run uvicorn app.main:app --reload`
4. Regenerate the client: `./scripts/generate-client.sh`
5. Run `pnpm typecheck` — the compiler will surface every frontend location that needs updating
6. Fix callsites, update tests, commit everything together

If the backend can't be run locally (e.g. during initial schema design), manually update `frontend/app/client/types.gen.ts` as a temporary measure and run `pnpm typecheck`. Regenerate properly before merging.

---

## Consequences

- `frontend/app/client/` is committed and must not be `.gitignore`'d — it is the source of truth for frontend types at any given commit.
- Any PR that changes a backend schema field must include the regenerated client in the same commit.
- CI (`tsc --noEmit`) will catch type mismatches introduced by un-regenerated client files.
- This pattern does not prevent runtime drift between deployed frontend and backend versions — versioned deployments and backwards-compatible schema changes remain the responsibility of the developer.
