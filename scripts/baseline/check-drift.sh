#!/usr/bin/env bash
# Does the repository still build the database this deployment reads?
# Builds a scratch database the way a fresh environment is built
# (scripts/baseline/bootstrap.sh: baseline, then the migrations after CUTOFF)
# and compares every app-schema object (columns, constraints, indexes,
# functions, triggers, policies, owners) with the live one. Any difference
# fails: a schema change was made outside a migration, or a migration did not
# run here. deploy-studio.sh runs this after migrating.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "${ROOT_DIR}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"
# shellcheck source=../lib/deployed-db.sh
source "${ROOT_DIR}/scripts/lib/deployed-db.sh"

SCRATCH=schema_drift_check
PW="$(docker exec "${DB_CONTAINER}" printenv POSTGRES_PASSWORD)"
adm() { docker exec -i -e PGPASSWORD="${PW}" "${DB_CONTAINER}" psql -U supabase_admin -X -q -v ON_ERROR_STOP=1 "$@"; }
objects() { docker exec -i "${DB_CONTAINER}" psql -U postgres -X -At -d "$1" < scripts/baseline/schema-objects.sql; }
cleanup() { adm -d postgres -c "DROP DATABASE IF EXISTS ${SCRATCH}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
adm -d postgres -c "CREATE DATABASE ${SCRATCH}" >/dev/null
# What a new Supabase database already has before our schema: its auth and
# extensions schemas (with uuid-ossp and pgcrypto), and the realtime publication.
docker exec -e PGPASSWORD="${PW}" "${DB_CONTAINER}" pg_dump -U supabase_admin -d postgres --schema-only -n auth -n extensions \
  | adm -d "${SCRATCH}" -v ON_ERROR_STOP=0 >/dev/null 2>&1
adm -d "${SCRATCH}" >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE PUBLICATION supabase_realtime;
SQL

./scripts/baseline/bootstrap.sh --database "${SCRATCH}" >/dev/null

LIVE="$(mktemp)"; BUILT="$(mktemp)"
trap 'cleanup; rm -f "${LIVE}" "${BUILT}"' EXIT
objects postgres > "${LIVE}"
objects "${SCRATCH}" > "${BUILT}"
if ! diff -u --label live --label "baseline + migrations" "${LIVE}" "${BUILT}" > "${BUILT}.diff"; then
  echo "Schema drift: the live database differs from what the repository builds." >&2
  grep -E '^[-+][a-z]' "${BUILT}.diff" | head -60 >&2
  echo "(- only live, + only built). Put the change in a migration, or regenerate the baseline." >&2
  rm -f "${BUILT}.diff"
  exit 1
fi
rm -f "${BUILT}.diff"
echo "No schema drift: $(wc -l < "${LIVE}" | tr -d ' ') objects match."
