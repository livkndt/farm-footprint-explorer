# Runbook — Database Migrations

This runbook covers creating, applying, and reverting Alembic migrations for Farm Footprint Explorer.

---

## Overview

Alembic manages all schema changes. Migration files live in `backend/alembic/versions/`. The database must be running before any migration command.

All commands run from `backend/`.

---

## Apply Pending Migrations

```bash
cd backend

DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
uv run alembic upgrade head
```

`head` applies all migrations that haven't been applied yet. This is idempotent — running it again when already at head does nothing.

To apply a specific number of migrations:

```bash
uv run alembic upgrade +1    # apply one migration forward
```

---

## Check Current Migration State

```bash
uv run alembic current
# e.g. 0002_add_alert_unique_constraint (head)
```

See migration history:

```bash
uv run alembic history --verbose
```

---

## Create a New Migration

### Option A — Auto-generate from model changes (recommended starting point)

After editing `backend/app/models/footprint.py`:

```bash
uv run alembic revision --autogenerate -m "describe_the_change"
```

Alembic compares your ORM models to the current database schema and generates a migration file. **Always review the generated file before applying** — autogenerate can miss spatial column types, custom constraints, or `text()` DDL.

### Option B — Write migration manually

```bash
uv run alembic revision -m "describe_the_change"
```

Opens a blank migration file. Write the `upgrade()` and `downgrade()` functions manually.

### When to write manually

- Adding or changing PostGIS geometry columns (GeoAlchemy2 types may not autogenerate correctly)
- Creating spatial indexes with `CREATE INDEX ... USING GIST`
- Running raw DDL that has no SQLAlchemy ORM equivalent
- Adding a `UNIQUE` constraint that references de-normalised columns (e.g. the alert deduplication constraint)

### Example: adding a spatial index manually

```python
def upgrade() -> None:
    op.execute(
        "CREATE INDEX ix_deforestation_alerts_geometry "
        "ON deforestation_alerts USING GIST (geometry)"
    )

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_deforestation_alerts_geometry")
```

---

## Revert a Migration

```bash
# Revert one migration
uv run alembic downgrade -1

# Revert to a specific revision
uv run alembic downgrade 0001

# Revert all migrations (empty database)
uv run alembic downgrade base
```

---

## Migration File Naming Convention

Files follow the pattern `NNNN_short_description.py`:

```
alembic/versions/
├── 0001_create_spatial_tables.py
├── 0002_add_alert_unique_constraint.py
└── 0003_your_new_migration.py
```

Use a 4-digit prefix incremented by 1. Alembic also generates a random hex revision ID — keep both in the filename comment header.

---

## Running Migrations in CI

The CI workflow starts a PostGIS container and runs migrations before running tests:

```yaml
# From ci-backend.yml — migrations run as part of test setup
- run: uv run alembic upgrade head
  env:
    DATABASE_URL: postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint
```

If a migration fails in CI, check:
1. The migration file is committed (not just on your local branch)
2. The `down_revision` chain is correct — each migration must point to the previous one
3. The migration doesn't depend on data or extensions not present in the CI container

---

## Alembic and asyncpg

The `DATABASE_URL` uses `postgresql+asyncpg://` for the application. Alembic uses a **synchronous** connection internally. The `alembic/env.py` converts the URL automatically:

```python
# env.py handles this conversion:
url = config.get_main_option("sqlalchemy.url")
url = url.replace("postgresql+asyncpg://", "postgresql://")
```

This requires `psycopg2-binary` to be installed (it's in `pyproject.toml`). You don't need to change the `DATABASE_URL` for migrations — `env.py` handles it.

---

## Troubleshooting

### `Connection refused` / `FATAL: database does not exist`

The database container isn't running, or hasn't finished initialising.

```bash
docker compose up -d db
# Wait ~5 seconds, then retry
uv run alembic upgrade head
```

### `Target database is not up to date`

You have a stale migration state. Another developer applied a migration you haven't pulled yet.

```bash
git pull
uv run alembic upgrade head
```

### Multiple heads (migration branch divergence)

If two developers created migrations from the same base, Alembic will refuse to run until the conflict is resolved.

```bash
uv run alembic heads
# Shows both revision IDs

# Merge them into a single migration
uv run alembic merge -m "merge_heads" <rev1> <rev2>
uv run alembic upgrade head
```

### `Can't locate revision` after `downgrade`

The revision ID in the database no longer matches a file in `alembic/versions/`. This usually means a migration file was deleted after being applied.

Do not delete migration files once they've been applied to any environment. If you need to undo a schema change, write a new downgrade migration.
