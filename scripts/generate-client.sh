#!/usr/bin/env bash
# generate-client.sh
#
# Fetches the OpenAPI spec from the running backend and regenerates the
# TypeScript client in frontend/app/client/.
#
# Run this whenever backend schemas or routes change:
#   ./scripts/generate-client.sh
#
# Prerequisites:
#   - Backend running locally on http://localhost:8000
#   - npx available (Node.js installed)

set -euo pipefail

SPEC_URL="http://localhost:8000/openapi.json"
OUTPUT_DIR="frontend/app/client"

echo "Fetching OpenAPI spec from $SPEC_URL..."
curl -sf "$SPEC_URL" -o /tmp/openapi.json

echo "Generating TypeScript client into $OUTPUT_DIR..."
npx @hey-api/openapi-ts \
  --input /tmp/openapi.json \
  --output "$OUTPUT_DIR" \
  --client @hey-api/client-fetch

echo "Done. Client regenerated at $OUTPUT_DIR"
