---
description: Make a change to the API request or response schema in Farm Footprint Explorer — the full cross-cutting workflow spanning backend Pydantic schemas, backend tests, client regeneration, and frontend typecheck. Use this any time a field is added, renamed, removed, or its type changes.
argument-hint: "[description of the schema change, e.g. 'add watershed_name string to AnalyseResponse']"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

You are making an API schema change to Farm Footprint Explorer. The change is: $ARGUMENTS

This workflow spans backend and frontend. Complete every step — a partial schema change leaves the client out of sync and breaks the frontend.

## 1. Update the Pydantic schema

Edit `backend/app/schemas/footprint.py`.

- **Adding a field:** add it to the appropriate model. If it's optional with a default, existing clients continue to work. If required, all tests that construct the response need updating.
- **Renaming a field:** update the model and search for all usages: `grep -r "old_field_name" backend/`
- **Removing a field:** check whether any test, service, or route references it before deleting.
- **Changing a type:** check all query results and service code that populate this field.

After editing the schema, update `model_config["json_schema_extra"]["examples"]` to reflect the new shape. This keeps the `/docs` UI accurate.

## 2. Update the service layer

The field needs to be populated somewhere in `backend/app/services/land_analysis.py`. Find where the `AnalyseResponse` (or relevant schema) is constructed and add/update the value.

If the field comes from a new database query, add it following the existing pattern (parametrised `text()` query, named parameters, no f-strings in SQL).

## 3. Run backend tests — expect failures

```bash
cd backend
DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
TEST_DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
uv run pytest -v
```

Tests that assert on the response shape will now fail. Fix them:
- Update assertions to include/exclude the changed field
- Update any fixtures or helper data that construct the schema

Run again until all backend tests pass.

## 4. Regenerate the frontend client

The generated client in `frontend/app/client/` must be updated to match the new schema.

```bash
cd backend
# Ensure the backend is running with the new schema
uv run uvicorn app.main:app --reload &
sleep 3

cd ..
./scripts/generate-client.sh
```

This overwrites `frontend/app/client/types.gen.ts` (and possibly `services.gen.ts`). Do not edit these files manually — re-run the script if you need to change them.

If you cannot run the backend (e.g. working offline), manually edit `frontend/app/client/types.gen.ts` to add/remove/rename the field. This is a valid stopgap — just remember to regenerate properly before merging.

## 5. Fix frontend callsites

```bash
cd frontend && pnpm typecheck
```

TypeScript will surface every frontend location that references the changed field. Work through the errors:

- **Renamed field:** update every reference to use the new name
- **New required field:** update all places that construct the type (likely tests)
- **New optional field in response:** update `ResultsPanel.tsx` to display it if needed; tests only need updating if they assert on the new field

Run typecheck again until it's clean.

## 6. Update frontend tests if needed

```bash
cd frontend && pnpm test --run
```

If the ResultsPanel or other components were updated to display the new field, add or update tests to cover it. If you removed a field that was asserted on, remove those assertions.

## 7. Final check — both suites clean

```bash
# Backend
cd backend
DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
TEST_DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
uv run pytest -v

# Frontend
cd ../frontend && pnpm test --run && pnpm typecheck
```

## 8. Commit everything together

Stage and commit backend schema, service changes, regenerated client, and frontend changes in a single commit. Never commit the backend schema change without the regenerated client — a mismatched client is a runtime error waiting to happen.

```bash
git add backend/app/schemas/ backend/app/services/ backend/tests/ \
        frontend/app/client/ frontend/app/components/ frontend/tests/
```
