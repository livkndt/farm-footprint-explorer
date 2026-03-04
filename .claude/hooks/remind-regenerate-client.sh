#!/usr/bin/env bash
# After editing a backend schema file, reminds Claude to regenerate the
# frontend client and run typecheck before committing.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == *"/backend/app/schemas/"* ]]; then
  echo "Backend schema changed. Before committing, complete these steps:"
  echo "  1. Run the backend: cd backend && uv run uvicorn app.main:app --reload"
  echo "  2. Regenerate the client: ./scripts/generate-client.sh"
  echo "  3. Check for TypeScript errors: cd frontend && pnpm typecheck"
  echo "  4. Commit the schema change and regenerated client/ together in one commit."
fi

exit 0
