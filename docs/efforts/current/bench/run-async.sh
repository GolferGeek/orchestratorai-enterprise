#!/usr/bin/env bash
# Legal Department async-workspace bench harness.
#
# Drives the new async path end-to-end via curl, no UI required:
#   1. POST /legal-department/jobs   → { jobId, conversationId }
#   2. GET  /observability/stream?conversationId=…  → tail until completed/failed
#   3. GET  /legal-department/jobs/:id  → final result
#
# Usage:
#   ./run-async.sh                       # model from invoke-body.json
#   ./run-async.sh gemma4:e4b            # override model
#   ./run-async.sh gemma4:e4b ./mydoc.txt # override model + document path
#
# Requires:
#   - docs/efforts/current/bench/invoke-body.json (existing capture)
#   - jq
#   - Forge API on localhost:6200
#
# No bearer token: the new endpoints take ExecutionContext from the body,
# matching the rest of Forge API.
#
# See: docs/efforts/current/prd.md  Phase 3.

set -euo pipefail
cd "$(dirname "$0")"

MODEL="${1:-}"
DOC_PATH="${2:-}"
BODY_FILE="invoke-body.json"
API="${LEGAL_API_URL:-http://localhost:6200}"

if [[ ! -f "$BODY_FILE" ]]; then
  echo "Missing $BODY_FILE" >&2
  exit 1
fi

# Build the request body. The new async endpoint mirrors the existing v2
# invoke shape: { context, data }. We strip params.metadata if present.
BODY=$(jq '{ context: .params.context, data: .params.data }' "$BODY_FILE")

if [[ -n "$MODEL" ]]; then
  BODY=$(echo "$BODY" | jq --arg m "$MODEL" '.context.model = $m')
fi

if [[ -n "$DOC_PATH" ]]; then
  if [[ ! -f "$DOC_PATH" ]]; then
    echo "Document not found: $DOC_PATH" >&2
    exit 1
  fi
  CONTENT=$(cat "$DOC_PATH")
  BODY=$(echo "$BODY" | jq --arg c "$CONTENT" '.data.content = $c')
fi

CURRENT_MODEL=$(echo "$BODY" | jq -r '.context.model')
ORG_SLUG=$(echo "$BODY" | jq -r '.context.orgSlug')

echo "▶ Async bench: model=$CURRENT_MODEL, org=$ORG_SLUG"
echo "▶ POST $API/legal-department/jobs"
echo

ENQUEUE_RESPONSE=$(curl -sS -X POST "$API/legal-department/jobs" \
  -H 'Content-Type: application/json' \
  --data-binary "$BODY")

JOB_ID=$(echo "$ENQUEUE_RESPONSE" | jq -r '.jobId // empty')
CONV_ID=$(echo "$ENQUEUE_RESPONSE" | jq -r '.conversationId // empty')

if [[ -z "$JOB_ID" || -z "$CONV_ID" ]]; then
  echo "Enqueue failed:" >&2
  echo "$ENQUEUE_RESPONSE" >&2
  exit 1
fi

echo "✔ Enqueued job $JOB_ID"
echo "  conversationId: $CONV_ID"
echo

# Tail observability stream in the background, kill it when the job completes.
STREAM_LOG=$(mktemp)
curl -sS -N "$API/observability/stream?conversationId=$CONV_ID" \
  > "$STREAM_LOG" 2>&1 &
STREAM_PID=$!
trap 'kill $STREAM_PID 2>/dev/null || true; rm -f "$STREAM_LOG"' EXIT

echo "▶ Polling job status (events streaming to $STREAM_LOG)..."
LAST_STATUS=""
LAST_STEP=""
while true; do
  ROW=$(curl -sS "$API/legal-department/jobs/$JOB_ID?orgSlug=$ORG_SLUG")
  STATUS=$(echo "$ROW" | jq -r '.status // "?"')
  STEP=$(echo "$ROW" | jq -r '.current_step // ""')
  if [[ "$STATUS" != "$LAST_STATUS" || "$STEP" != "$LAST_STEP" ]]; then
    echo "  [$(date +%H:%M:%S)] status=$STATUS step=$STEP"
    LAST_STATUS="$STATUS"
    LAST_STEP="$STEP"
  fi
  case "$STATUS" in
    completed)
      echo
      echo "✔ Job completed."
      RESULT=$(echo "$ROW" | jq '.result')
      ERROR_FIELD=""
      break ;;
    failed)
      echo
      echo "✘ Job failed."
      RESULT=""
      ERROR_FIELD=$(echo "$ROW" | jq -r '.error // "(no error message)"')
      break ;;
  esac
  sleep 2
done

echo
echo "===== STREAMED EVENTS ====="
cat "$STREAM_LOG" | head -100
echo "===== /STREAMED EVENTS ====="
echo

if [[ -n "$ERROR_FIELD" ]]; then
  echo "Error: $ERROR_FIELD"
  exit 1
fi

echo "===== FINAL RESULT ====="
echo "$RESULT" | jq '.'
echo "===== /FINAL RESULT ====="
