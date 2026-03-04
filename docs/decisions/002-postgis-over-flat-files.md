# ADR 002 — PostGIS over Flat-File Geospatial Storage

**Status:** Accepted
**Date:** 2026-03

---

## Context

The app needs to store and query two kinds of geospatial data:

1. **Land cover polygons** (ESA WorldCover, 10 m resolution) — large static dataset; queries are spatial intersections against a user-drawn polygon.
2. **Deforestation alerts** (GFW Integrated Alerts) — continuously ingested point data; queries are point-in-polygon counts grouped by confidence and year.

A decision was needed on the storage and query strategy for both datasets.

---

## Options Considered

### Option A — Flat files (GeoParquet / GeoJSON / Shapefile)

Store data as files on disk or object storage (e.g. S3). Query at request time using GeoPandas in-process.

**Pros:**
- Zero infrastructure to manage
- Easy to inspect files with standard GIS tools
- GeoPandas has a familiar pandas-like API

**Cons:**
- No index — every spatial query scans the entire file
- GeoParquet requires loading (potentially large) file partitions into memory per request
- No built-in deduplication — alert re-ingestion requires client-side set logic
- Concurrent requests require either file locking or loading multiple copies into memory
- Query latency grows linearly with dataset size
- No transaction support — partial ingestion can corrupt state

### Option B — SQLite + SpatiaLite

Embedded spatial database. No server process required.

**Pros:**
- No Docker service needed
- File-based — easy to copy/backup

**Cons:**
- Async support is poor (no asyncpg equivalent)
- Concurrency is limited (write lock on the whole file)
- Community support and tooling is smaller than PostGIS
- CI would need a different setup (no standard SpatiaLite container)

### Option C — PostgreSQL + PostGIS

Dedicated PostgreSQL database with the PostGIS spatial extension.

**Pros:**
- Spatial indexes (GIST) make intersection and within queries fast as data grows
- `ON CONFLICT DO NOTHING` enables idempotent, parallel alert ingestion
- SQLAlchemy async support via `asyncpg`
- Alembic handles schema evolution with rollback support
- Well-supported in CI (standard Docker image: `postgis/postgis`)
- `ST_Buffer`, `ST_Intersects`, `ST_Within`, `ST_Area`, `ST_Centroid` — the full PostGIS function set covers all current query needs

**Cons:**
- Requires a running PostgreSQL service (Docker Compose locally, managed DB in prod)
- Schema migrations add process overhead when iterating on data models

---

## Decision

**PostgreSQL 15 + PostGIS 3.3.**

---

## Rationale

The core requirement is **spatial intersection queries** — "which land cover polygons overlap this user-drawn polygon?" and "which deforestation alerts are within this area?". These are exactly the operations that PostGIS's GIST spatial index is built for. Without an index, every query becomes a full table scan — unacceptable as alert data grows to millions of rows.

The deduplication requirement for alert ingestion (`UNIQUE(longitude, latitude, alert_date, source)` + `ON CONFLICT DO NOTHING`) is a natural fit for PostgreSQL's conflict-resolution semantics. Replicating this in flat files would require read-modify-write logic with locking.

Using an async ORM (SQLAlchemy + asyncpg) means the database connection model fits naturally into FastAPI's async request handling, with no additional threading or executor overhead.

The infrastructure cost (a single Docker service locally, a managed PostgreSQL instance in production) is low and well-understood.

---

## Consequences

- Docker Compose is required for local development (`docker compose up -d db`).
- Alembic migrations are used for all schema changes — no hand-editing production schema.
- All geometry columns use SRID 4326 (WGS84). Buffer calculations use SRID 3857 (Web Mercator) for metre-accurate distances, then transform back to 4326 for storage.
- GeoAlchemy2 is used for ORM-level geometry types; raw `text()` queries are used for complex multi-step spatial operations.
- `UNIQUE(longitude, latitude, alert_date, source)` requires de-normalising coordinates onto the alert row, since PostGIS geometry columns cannot participate in `UNIQUE` constraints.
- A future move to a managed PostGIS-compatible service (e.g. Supabase, AWS RDS with PostGIS, Neon) requires no application code changes — only `DATABASE_URL`.
