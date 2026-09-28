#!/usr/bin/env bash
# Regenerate supabase/baseline/ from the database this deployment reads:
#   schema.sql  every app schema (not Supabase's own), with owners and grants
#   seed.sql    the reference data listed in scripts/baseline/seed-tables.txt
#   CUTOFF      the newest migration the baseline already contains
# A fresh database is then: bootstrap.sh (baseline + personas), then the
# migrations after CUTOFF. Run this only to fold migrations into a new
# baseline, and commit the result with the migrations it replaces kept in place.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "${ROOT_DIR}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"
# shellcheck source=../lib/deployed-db.sh
source "${ROOT_DIR}/scripts/lib/deployed-db.sh"
PW="$(docker exec "${DB_CONTAINER}" printenv POSTGRES_PASSWORD)"
OUT=supabase/baseline

# Supabase's own schemas come with every Supabase database; the baseline holds ours.
SUPABASE_OWNED="'auth','storage','realtime','_realtime','vault','supabase_functions','net','extensions','graphql','graphql_public','pgbouncer','pgsodium','pgsodium_masks','cron','information_schema','supabase_migrations'"
schemas="$(docker exec "${DB_CONTAINER}" psql -U postgres -X -At -c \
  "SELECT string_agg('-n ' || nspname, ' ' ORDER BY nspname) FROM pg_namespace WHERE nspname NOT IN (${SUPABASE_OWNED}) AND nspname NOT LIKE 'pg\_%'")"

applied_newest="$(docker exec "${DB_CONTAINER}" psql -U postgres -X -At -c "SELECT max(version) FROM public.deployment_migrations")"
file_newest="$(basename "$(ls supabase/migrations/*.sql | tail -1)" | cut -d_ -f1)"
if [[ "${applied_newest}" != "${file_newest}" ]]; then
  echo "The database's newest migration (${applied_newest}) is not the repository's (${file_newest}); migrate or pull first." >&2
  exit 1
fi

# pg_dump -n leaves out extensions and publication membership, so both are
# written explicitly: extensions in our schemas first, the realtime
# publication's tables last. Schemas are created IF NOT EXISTS (public exists).
psql_at(){ docker exec "${DB_CONTAINER}" psql -U postgres -X -At -c "$1"; }
{
  echo "-- The app schema of a fresh database (scripts/baseline/generate.sh from the Studio)."
  psql_at "SELECT format('CREATE SCHEMA IF NOT EXISTS %I;' || chr(10) || 'CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I;', n.nspname, e.extname, n.nspname)
           FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
           WHERE n.nspname NOT IN (${SUPABASE_OWNED}) AND n.nspname NOT LIKE 'pg\_%' ORDER BY 1"
  # shellcheck disable=SC2086 # word splitting of the -n list is intended
  docker exec -e PGPASSWORD="${PW}" "${DB_CONTAINER}" pg_dump -U supabase_admin -d postgres \
    --schema-only --no-comments ${schemas} -T public.deployment_migrations \
    | sed -E -e '/^-- Dumped (by pg_dump|from database) version/d' -e '/^\\(un)?restrict /d' \
             -e 's/^CREATE SCHEMA ([a-z_]+);/CREATE SCHEMA IF NOT EXISTS \1;/'
  psql_at "SELECT format('ALTER PUBLICATION %I ADD TABLE %I.%I;', pubname, schemaname, tablename)
           FROM pg_publication_tables WHERE schemaname NOT IN (${SUPABASE_OWNED}) ORDER BY 1"
} > "${OUT}/schema.sql"

{
  echo "-- Reference data for a fresh database (scripts/baseline/generate.sh; tables in scripts/baseline/seed-tables.txt)."
  echo "SET session_replication_role = replica;"
  grep -vE '^\s*(#|$)' scripts/baseline/seed-tables.txt | while read -r table where; do
    columns="$(docker exec "${DB_CONTAINER}" psql -U postgres -X -At -c \
      "SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) FROM pg_attribute WHERE attrelid = '${table}'::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '' AND attidentity <> 'a'")"
    echo "COPY ${table} (${columns}) FROM stdin;"
    docker exec "${DB_CONTAINER}" psql -U postgres -X -q -c \
      "COPY (SELECT ${columns} FROM ${table} ${where} ORDER BY 1) TO STDOUT"
    echo '\.'
  done
  echo "SET session_replication_role = origin;"
} > "${OUT}/seed.sql"

echo "${file_newest}" > "${OUT}/CUTOFF"
echo "Baseline written: $(wc -l < "${OUT}/schema.sql") schema lines, $(grep -c '^COPY' "${OUT}/seed.sql") seed tables, cutoff ${file_newest}"
