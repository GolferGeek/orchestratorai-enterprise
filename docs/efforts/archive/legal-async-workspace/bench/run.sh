#!/usr/bin/env bash
# Legal Department local-model bench harness.
#
# Usage:
#   ./run.sh                       # uses model from invoke-body.json as-is
#   ./run.sh gemma4:e4b            # swaps model field, runs once
#   ./run.sh qwen3:32b             # any model in the API's Ollama list
#
# Requires:
#   - docs/efforts/current/bench/invoke-body.json   (captured request body)
#   - docs/efforts/current/bench/.token             (Bearer ... — gitignored)
#   - jq
#   - Forge Web running on localhost:5201 (which proxies /invoke/stream to API)

set -euo pipefail
cd "$(dirname "$0")"

MODEL="${1:-}"
BODY_FILE="invoke-body.json"
TOKEN_FILE=".token"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing $TOKEN_FILE — capture a fresh bearer token from a logged-in browser session." >&2
  exit 1
fi

if [[ -n "$MODEL" ]]; then
  BODY=$(jq --arg m "$MODEL" '.params.context.model = $m' "$BODY_FILE")
else
  BODY=$(cat "$BODY_FILE")
fi

CURRENT_MODEL=$(echo "$BODY" | jq -r '.params.context.model')
echo "▶ Invoking Legal Department with model: $CURRENT_MODEL"
echo "▶ POST http://localhost:5201/invoke/stream"
echo

TOKEN=$(cat "$TOKEN_FILE")

curl -sS -N \
  -X POST 'http://localhost:5201/invoke/stream' \
  -H "Authorization: $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  --data-binary "$BODY"
