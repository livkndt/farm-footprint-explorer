#!/usr/bin/env bash
# Blocks edits to existing Alembic migration files.
# Applied migrations must not be modified — create a new migration instead.
# Note: Write (creating a new file) is intentionally not blocked, only Edit.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == *"/backend/alembic/versions/"* ]]; then
  echo "Existing migration files must not be edited." >&2
  echo "" >&2
  echo "To make a schema change, create a new migration:" >&2
  echo "  cd backend && uv run alembic revision -m 'description_of_change'" >&2
  echo "" >&2
  echo "See docs/runbooks/database-migrations.md for guidance." >&2
  exit 2
fi

exit 0
