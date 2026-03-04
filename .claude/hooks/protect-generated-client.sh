#!/usr/bin/env bash
# Blocks direct edits to the auto-generated OpenAPI client.
# These files are overwritten by scripts/generate-client.sh — manual edits are lost.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == *"/frontend/app/client/"* ]]; then
  echo "frontend/app/client/ is auto-generated — do not edit it directly." >&2
  echo "" >&2
  echo "To update the client after a backend schema change:" >&2
  echo "  1. Ensure the backend is running: uv run uvicorn app.main:app --reload" >&2
  echo "  2. Regenerate: ./scripts/generate-client.sh" >&2
  echo "  3. Run: cd frontend && pnpm typecheck" >&2
  exit 2
fi

exit 0
