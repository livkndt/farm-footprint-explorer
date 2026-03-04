# Runbook — Testing the GFW API Integration

This runbook covers validating the Global Forest Watch (GFW) Integrated Alerts integration at each layer: API key, HTTP client, ingestion service, and end-to-end.

---

## Overview

The GFW integration has three components:

| Component | File | Test file |
|-----------|------|-----------|
| HTTP client | `app/services/gfw_client.py` | `tests/test_gfw_client.py` |
| Alert ingestion | `app/services/alert_ingestion.py` | `tests/test_footprint.py` (via mock) |
| End-to-end route | `app/api/routes/footprint.py` | `tests/test_footprint.py` |

In the test suite, `ingest_alerts_for_geometry` is mocked by default so tests don't hit the live GFW API. This runbook covers how to verify the live integration.

---

## Step 1 — Verify the API Key

### Using curl

```bash
# Replace with your actual API key from backend/.env
GFW_KEY=your-key-here

curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "x-api-key: $GFW_KEY" \
  -H "Content-Type: application/json" \
  --location \
  "https://data-api.globalforestwatch.org/dataset/gfw_integrated_alerts/latest/query/json" \
  -d '{
    "sql": "SELECT latitude, longitude, gfw_integrated_alerts__date, gfw_integrated_alerts__confidence FROM results WHERE gfw_integrated_alerts__date >= '\''2025-01-01'\'' LIMIT 1",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[30, -5], [31, -5], [31, -4], [30, -4], [30, -5]]]
    }
  }'
```

Expected responses:

| HTTP code | Meaning |
|-----------|---------|
| `200` | Key is valid and query succeeded |
| `307` | GFW redirect — re-run with `--location` flag (already included above) |
| `403` | Key is invalid or expired — get a new one from [globalforestwatch.org/developer](https://www.globalforestwatch.org/developer) |
| `429` | Rate limited — wait and retry |

> **Note:** The GFW key validation endpoint (`/auth/apikey/{id}/validate`) is unreliable and may return "Unauthorized" even for working keys. Always test against the data endpoint directly.

### Check the key in `.env`

```bash
grep GFW_API_KEY backend/.env
```

If the key is missing or looks like the placeholder from `.env.example`, replace it.

---

## Step 2 — Run the Unit Tests (mocked)

The standard test suite mocks GFW and verifies application logic in isolation:

```bash
cd backend

DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
TEST_DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
uv run pytest tests/test_gfw_client.py tests/test_footprint.py -v
```

`test_gfw_client.py` uses `respx` to intercept the httpx call and simulate GFW responses, including:

- Successful response with multiple alerts
- HTTP error response
- Redirect (307) handling

These tests run without a real GFW API key and without network access.

---

## Step 3 — Smoke Test the Live Client

To exercise the actual GFW API from Python (useful after a key change or GFW endpoint update):

```bash
cd backend

# Run a one-off async script using the real client
DATABASE_URL=postgresql+asyncpg://farmuser:farmpass@localhost:5432/farmfootprint \
GFW_API_KEY=your-key-here \
uv run python -c "
import asyncio
from app.services.gfw_client import fetch_deforestation_alerts

async def main():
    alerts = await fetch_deforestation_alerts(
        geometry={
            'type': 'Polygon',
            'coordinates': [[[30, -5], [31, -5], [31, -4], [30, -4], [30, -5]]]
        },
        lookback_days=365,
        api_key='your-key-here',
        base_url='https://data-api.globalforestwatch.org',
    )
    print(f'Fetched {len(alerts)} alerts')
    if alerts:
        print(f'First alert: {alerts[0]}')

asyncio.run(main())
"
```

Expected output:

```
Fetched 47 alerts
First alert: longitude=30.1 latitude=-4.8 alert_date=2024-03-12 confidence='high'
```

If you see `RuntimeError: GFW API returned an error: ...`, inspect the full error message — it will contain the GFW API's error body.

---

## Step 4 — Test Ingestion End-to-End

With the database and backend running:

```bash
# Backend in one terminal:
cd backend && uv run uvicorn app.main:app --reload

# Send a test request in another terminal:
curl -s -X POST http://localhost:8000/footprint/analyse \
  -H "Content-Type: application/json" \
  -d '{
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[30, -5], [31, -5], [31, -4], [30, -4], [30, -5]]]
    }
  }' | python3 -m json.tool
```

In the response, check:

```json
{
  "alerts_live": true,
  "alerts_fetched_at": "2025-03-04T10:23:00Z",
  "deforestation_alerts": {
    "count": 47,
    ...
  }
}
```

- `alerts_live: true` — GFW fetch succeeded and alerts were ingested
- `alerts_live: false` — GFW fetch failed; results use cached data. Check backend logs for the warning.

---

## Step 5 — Verify Ingested Data in the Database

After a successful ingest, inspect the alerts table:

```bash
docker compose exec db psql -U farmuser -d farmfootprint -c "
SELECT
    COUNT(*) AS total_alerts,
    MIN(alert_date) AS earliest,
    MAX(alert_date) AS latest,
    source
FROM deforestation_alerts
GROUP BY source;
"
```

Expected output:

```
 total_alerts |  earliest  |   latest   |          source
--------------+------------+------------+-------------------------
           47 | 2024-03-12 | 2025-03-01 | gfw_integrated_alerts
```

Check the de-duplicated upsert is working — run the analysis again for the same polygon and verify the count doesn't increase:

```bash
# Before second request
docker compose exec db psql -U farmuser -d farmfootprint -c "SELECT COUNT(*) FROM deforestation_alerts;"

# Send request again (same polygon)
curl -s -X POST http://localhost:8000/footprint/analyse ...

# After second request — count should be the same
docker compose exec db psql -U farmuser -d farmfootprint -c "SELECT COUNT(*) FROM deforestation_alerts;"
```

---

## Debugging Common Problems

### `alerts_live: false` in response

The GFW fetch failed. Check backend logs for the warning line:

```
WARNING  app.services.alert_ingestion:alert_ingestion.py:XX GFW fetch failed: ...
```

Common causes:
- `GFW_API_KEY` is missing or invalid in `backend/.env` — run Step 1 to verify
- GFW API is temporarily unavailable — retry after a few minutes
- `GFW_API_BASE_URL` is set to a wrong value — check `backend/.env`

### `httpx.RemoteProtocolError` or timeout

The GFW API has a 30-second timeout configured. If requests are timing out, the polygon being queried may be very large (lots of alerts to return). Try a smaller polygon for testing.

### No alerts returned for a region

Not all regions have recent deforestation alerts. Try a known high-alert area such as the Amazon basin (approximately `[-65, -10]` to `[-45, 5]`). The `GFW_ALERTS_LOOKBACK_DAYS` setting (default: 365) controls how far back the query looks — extend it if needed.

### GFW redirect not followed

If you see a 307 response without following, ensure the httpx client is initialised with `follow_redirects=True`. This is set in `gfw_client.py`:

```python
async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
```

If it was accidentally removed, re-add it.

---

## Refreshing a Stale API Key

1. Go to [globalforestwatch.org/developer](https://www.globalforestwatch.org/developer) and generate a new key.
2. Update `backend/.env`:
   ```bash
   GFW_API_KEY=new-key-value
   ```
3. Restart the backend:
   ```bash
   # Ctrl+C the running uvicorn, then:
   uv run uvicorn app.main:app --reload
   ```
4. Re-run Step 1 to verify the new key works.
