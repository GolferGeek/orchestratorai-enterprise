#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="orchestratorai-cloud-sql-test-$$"

cleanup() {
  if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    docker rm -f "$CONTAINER_NAME" >/dev/null
  fi
}
trap cleanup EXIT

docker run \
  --detach \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD=test-password \
  -e POSTGRES_DB=orchestrator_ai \
  -p 127.0.0.1::5432 \
  pgvector/pgvector:pg15 >/dev/null

PGPORT="$(
  docker port "$CONTAINER_NAME" 5432/tcp |
    awk -F: '{print $NF}'
)"
export PGHOST=127.0.0.1
export PGPORT
export PGUSER=postgres
export PGDATABASE=orchestrator_ai
export PGPASSWORD=test-password

for attempt in $(seq 1 30); do
  if pg_isready >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "ERROR: PostgreSQL test container did not become ready." >&2
    exit 1
  fi
  sleep 1
done

psql -X -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE orchestrator_app LOGIN PASSWORD 'app-password';" \
  >/dev/null

"$SCRIPT_DIR/migrate-cloud-sql.sh"
"$SCRIPT_DIR/migrate-cloud-sql.sh"

applied_count="$(
  psql -X -Atqc "
    SELECT count(*)
    FROM orchestrator_deploy.schema_migrations
    WHERE status = 'applied';
  "
)"
excluded_count="$(
  psql -X -Atqc "
    SELECT count(*)
    FROM orchestrator_deploy.schema_migrations
    WHERE status = 'excluded';
  "
)"
active_agent_count="$(
  psql -X -Atqc "
    SELECT count(*)
    FROM public.agents
    WHERE status = 'active';
  "
)"
video_agent_policy_count="$(
  psql -X -Atqc "
    SELECT count(*)
    FROM public.agents
    WHERE slug = 'video-generator'
      AND agent_type = 'media'
      AND status = 'disabled'
      AND metadata->>'hidden' = 'true'
      AND metadata->>'status' = 'disabled';
  "
)"

if [ "$applied_count" -lt 2 ]; then
  echo "ERROR: Expected baseline and migrations to be recorded." >&2
  exit 1
fi
if [ "$excluded_count" -ne 1 ]; then
  echo "ERROR: Expected exactly one provider-inapplicable migration." >&2
  exit 1
fi
if [ "$active_agent_count" -eq 0 ]; then
  echo "ERROR: Expected active agents after migration." >&2
  exit 1
fi
if [ "$video_agent_policy_count" -ne 1 ]; then
  echo "ERROR: Expected the first-deployment policy to disable the video agent." >&2
  exit 1
fi

echo "Cloud SQL migration test passed."
