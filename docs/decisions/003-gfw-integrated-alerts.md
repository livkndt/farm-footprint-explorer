# ADR 003 — GFW Integrated Alerts as Deforestation Data Source

**Status:** Accepted
**Date:** 2025-01

---

## Context

The app needs a source of deforestation event data that can be queried by polygon to answer: "how many deforestation alerts occurred in this area, and when?"

Requirements:
- Global coverage
- Recent data (ideally updated weekly or faster)
- Free to use without per-request billing at development and small-production scale
- Returns enough metadata to show confidence level and date for each alert
- Accessible via an HTTP API (no bulk file download required at this stage)

---

## Options Considered

### Option A — GFW GLAD-L Alerts (single algorithm)

Original UMD/GLAD Landsat-based alerts. ~30 m resolution, updated weekly.

**Pros:** Well-established, widely cited in academic literature.

**Cons:** Single-source — alerts are only as good as one algorithm's accuracy. Lower spatial resolution than newer products. Superseded by Integrated Alerts for most use cases.

### Option B — RADD Alerts (Wageningen University)

Radar-based (Sentinel-1) alerts. Works through cloud cover, covering tropical Asia and Africa.

**Pros:** Cloud-penetrating radar fills gaps left by optical sensors.

**Cons:** Regional coverage only (not global). Would need to be combined with another source for complete coverage.

### Option C — GFW Integrated Alerts

Combines three independent alert systems: GLAD-L (Landsat), RADD (Sentinel-1 radar), and CCDC-GLAD (Sentinel-2). An alert is classified as:
- **High confidence** — confirmed by ≥ 2 independent systems
- **Nominal** — detected by 1 system with supporting evidence
- **Low confidence** — single-system detection

Available through the Global Forest Watch data API.

**Pros:**
- Global coverage
- Multi-source fusion reduces false positives (high-confidence alerts are more reliable)
- Confidence levels are meaningful to end users ("high" = multiple satellites agree)
- Free API key, no per-request billing
- Well-documented API with SQL-like query interface
- Actively maintained by GFW / World Resources Institute

**Cons:**
- API key required (must be obtained from globalforestwatch.org)
- API returns HTTP 307 redirect to versioned endpoints — requires `follow_redirects=True`
- Key validation endpoint (`/auth/apikey/{id}/validate`) is unreliable — must test against the actual data endpoint
- No `area_ha` value in the raw API response — alert area is set to `0.0` on ingestion

### Option D — Hansen Global Forest Change (annual)

Annual global forest cover loss at 30 m resolution.

**Pros:** Very high quality, peer-reviewed methodology.

**Cons:** Annual cadence only — too coarse for near-real-time alerts. Better suited to trend analysis than event detection.

---

## Decision

**GFW Integrated Alerts**, accessed via the Global Forest Watch data API.

---

## Rationale

GFW Integrated Alerts are the best available free source for near-real-time deforestation event detection with global coverage. The multi-source fusion model directly maps to user-meaningful confidence levels, which the UI surfaces as a breakdown (high / nominal / low / other). This gives users a basis to assess data quality without needing to understand the underlying algorithms.

The API's SQL-like query interface (`WHERE gfw_integrated_alerts__date >= '...'`) means the service can request only the date range needed, keeping ingestion payloads small. The `geometry` parameter in the request body lets GFW do the spatial filter server-side — avoiding full dataset downloads.

The ingestion architecture (fetch → batch upsert → `ON CONFLICT DO NOTHING`) means the app can re-request the same date range on every analysis without creating duplicate alerts, and falls back to cached data if the GFW API is unavailable at request time.

---

## Known Limitations

- **`area_ha` is always `0.0` on ingestion.** The GFW API does not return per-alert area. The `area_ha` column exists in the schema for future use (e.g. from a richer data product or derived from a pixel-count estimate). Alert counts and date ranges are reliable; area figures should be treated as estimates.

- **API key management.** The GFW API key is a long-lived credential stored in `backend/.env` (gitignored). Key rotation requires updating this file and restarting the backend. There is no automatic key refresh.

- **HTTP 307 redirect.** GFW routes `/latest` to a versioned endpoint (e.g. `/v20260304/query/json`). The httpx client handles this transparently with `follow_redirects=True`. If GFW changes their versioning scheme this may break.

- **No webhook or push.** There is no mechanism for GFW to push new alerts to the app. Alerts are fetched on demand at analysis time, limited to the `GFW_ALERTS_LOOKBACK_DAYS` window (default: 365 days).

---

## Consequences

- `backend/.env` must contain a valid `GFW_API_KEY`. Copy from `backend/.env.example` and add a key obtained from [globalforestwatch.org/developer](https://www.globalforestwatch.org/developer).
- If the GFW API is unreachable or returns an error, analysis proceeds with cached alerts and `alerts_live: false` is returned to the frontend. The results panel shows a warning.
- The `GFW_ALERTS_LOOKBACK_DAYS` setting controls how far back alerts are fetched. Increasing this value increases ingestion time and API payload size.
- Any future switch to a different alert data source requires changes to `gfw_client.py` and `alert_ingestion.py` only — the rest of the stack (schema, queries, frontend) is data-source agnostic.
