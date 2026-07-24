#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATABASE_DIR="$SCRIPT_DIR/../database"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
EXCLUSIONS_FILE="$DATABASE_DIR/cloud-sql-excluded-migrations.txt"

required_commands=(awk psql sha256sum rg)
for required_command in "${required_commands[@]}"; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "ERROR: Required command is unavailable: $required_command" >&2
    exit 1
  fi
done

required_env=(PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD)
for required_name in "${required_env[@]}"; do
  if [ -z "${!required_name:-}" ]; then
    echo "ERROR: Required environment variable is unset: $required_name" >&2
    exit 1
  fi
done

psql_base=(psql -X --quiet -v ON_ERROR_STOP=1)

sql_scalar() {
  "${psql_base[@]}" -Atqc "$1"
}

apply_file_transactionally() {
  local file_path="$1"
  "${psql_base[@]}" --single-transaction -f "$file_path"
}

echo "Checking Cloud SQL migration state..."
"${psql_base[@]}" -c "
  CREATE SCHEMA IF NOT EXISTS orchestrator_deploy;
  CREATE TABLE IF NOT EXISTS orchestrator_deploy.schema_migrations (
    migration_name TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('applied', 'excluded')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
"

baseline_name="cloud-sql-baseline-v1"
baseline_checksum="$(
  {
    sha256sum "$SCRIPT_DIR/cloud-sql-bootstrap.sql"
    sha256sum "$DATABASE_DIR/baseline-schema.sql"
    sha256sum "$DATABASE_DIR/baseline-seed.sql"
  } | sha256sum | awk '{print $1}'
)"
stored_baseline_checksum="$(
  sql_scalar "
    SELECT sha256
    FROM orchestrator_deploy.schema_migrations
    WHERE migration_name = '$baseline_name'
      AND status = 'applied';
  "
)"

if [ -n "$stored_baseline_checksum" ]; then
  if [ "$stored_baseline_checksum" != "$baseline_checksum" ]; then
    echo "ERROR: Applied Cloud SQL baseline checksum differs from the repository." >&2
    exit 1
  fi
  echo "Cloud SQL baseline already applied."
else
  existing_agent_table="$(
    sql_scalar "SELECT to_regclass('public.agents') IS NOT NULL;"
  )"
  if [ "$existing_agent_table" = "t" ]; then
    echo "ERROR: public.agents exists without a recorded Cloud SQL baseline." >&2
    echo "Refusing to infer or overwrite database state." >&2
    exit 1
  fi

  echo "Applying Cloud SQL baseline..."
  apply_file_transactionally "$SCRIPT_DIR/cloud-sql-bootstrap.sql"
  apply_file_transactionally "$DATABASE_DIR/baseline-schema.sql"
  apply_file_transactionally "$DATABASE_DIR/baseline-seed.sql"
  "${psql_base[@]}" -c "
    INSERT INTO orchestrator_deploy.schema_migrations (
      migration_name,
      sha256,
      status
    )
    VALUES ('$baseline_name', '$baseline_checksum', 'applied');
  "
fi

while IFS= read -r excluded_name; do
  if [ -z "$excluded_name" ] || [[ "$excluded_name" == \#* ]]; then
    continue
  fi
  if [ ! -f "$MIGRATIONS_DIR/$excluded_name" ]; then
    echo "ERROR: Excluded migration does not exist: $excluded_name" >&2
    exit 1
  fi
done < "$EXCLUSIONS_FILE"

while IFS= read -r migration_path; do
  migration_name="$(basename "$migration_path")"
  migration_checksum="$(sha256sum "$migration_path" | awk '{print $1}')"
  stored_record="$(
    sql_scalar "
      SELECT status || ':' || sha256
      FROM orchestrator_deploy.schema_migrations
      WHERE migration_name = '$migration_name';
    "
  )"

  if [ -n "$stored_record" ]; then
    stored_status="${stored_record%%:*}"
    stored_checksum="${stored_record#*:}"
    if [ "$stored_checksum" != "$migration_checksum" ]; then
      echo "ERROR: Migration checksum changed after recording: $migration_name" >&2
      exit 1
    fi
    echo "Already $stored_status: $migration_name"
    continue
  fi

  if rg -Fxq "$migration_name" "$EXCLUSIONS_FILE"; then
    echo "Recording provider-inapplicable migration: $migration_name"
    "${psql_base[@]}" -c "
      INSERT INTO orchestrator_deploy.schema_migrations (
        migration_name,
        sha256,
        status
      )
      VALUES ('$migration_name', '$migration_checksum', 'excluded');
    "
    continue
  fi

  echo "Applying migration: $migration_name"
  tracking_statement="INSERT INTO orchestrator_deploy.schema_migrations (migration_name, sha256, status) VALUES ('$migration_name', '$migration_checksum', 'applied');"
  if rg -q '^BEGIN;$' "$migration_path"; then
    begin_count="$(rg -c '^BEGIN;$' "$migration_path")"
    commit_count="$(rg -c '^COMMIT;$' "$migration_path")"
    if [ "$begin_count" -ne 1 ] || [ "$commit_count" -ne 1 ]; then
      echo "ERROR: Explicitly transactional migration must contain one BEGIN and one COMMIT: $migration_name" >&2
      exit 1
    fi
    awk -v tracking_statement="$tracking_statement" '
      /^COMMIT;$/ {
        print tracking_statement
      }
      {
        print
      }
    ' "$migration_path" | "${psql_base[@]}"
  else
    "${psql_base[@]}" --single-transaction \
      -f "$migration_path" \
      -c "$tracking_statement"
  fi
done < <(find "$MIGRATIONS_DIR" -type f -name '*.sql' | sort)

apply_file_transactionally "$SCRIPT_DIR/cloud-sql-deployment-policy.sql"
apply_file_transactionally "$SCRIPT_DIR/cloud-sql-post-migrate.sql"

active_agents="$(sql_scalar "SELECT count(*) FROM public.agents WHERE status = 'active';")"
if [ "$active_agents" -eq 0 ]; then
  echo "ERROR: Migration completed without any active agents." >&2
  exit 1
fi

echo "Cloud SQL migration completed with $active_agents active agents."
