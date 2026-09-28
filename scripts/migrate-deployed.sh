#!/usr/bin/env bash
# Apply pending migrations to the database THIS DEPLOYMENT ACTUALLY READS.
#
#   scripts/migrate-deployed.sh           apply anything pending
#   scripts/migrate-deployed.sh --dry-run list what would be applied
#
# Why this exists, and why it does not just call `supabase migration up`:
#
#   1. `supabase migration up --local` targets the project in supabase/config.toml.
#      From 2026-07-16 to 2026-09-28 that file was orchestratorai-local's (port
#      54322), a copy made by the monolith consolidation (6763773e). The deployed containers read DATABASE_URL from
#      docker-compose.cloudflare.yml, which points at 6011. They are different
#      databases. Every schema change made through the deploy script therefore
#      landed somewhere the live site never reads, silently, for as long as that
#      overlay has existed.
#
#   2. The Supabase migration history table is empty in both databases — the
#      schema came from a baseline dump, not from replaying migrations. So
#      `migration up` would try to apply all 34 from scratch and fail on the
#      first object that already exists.
#
# This script resolves the target from the compose configuration rather than
# assuming it, refuses to run if it cannot prove the target matches what the
# deployment reads, and tracks what it has applied in its own ledger.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
cd "${ROOT_DIR}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# shellcheck source=lib/deployed-db.sh
source "${ROOT_DIR}/scripts/lib/deployed-db.sh"

echo "Deployment reads port ${DB_PORT} -> container ${DB_CONTAINER}"

PGPASS="$(docker exec "${DB_CONTAINER}" printenv POSTGRES_PASSWORD)"
psql_run() {
  # supabase_admin owns the public schema; the postgres role lacks CREATE on it
  # after a no-owner restore, so DDL has to run as the owner.
  #
  # CONSEQUENCE, and it has bitten once: every object a migration CREATEs is
  # owned by supabase_admin, while the API connects as `postgres` (see
  # DATABASE_URL on platform-api) and every pre-existing table is owned by
  # postgres. A new table is therefore unreadable and unwritable by the
  # application until it is handed over:
  #
  #     ALTER TABLE <schema>.<table> OWNER TO postgres;
  #
  # risk.mitigations shipped without this and failed at runtime with
  # "permission denied for table mitigations" — after spending the LLM calls
  # that produced the rows. A migration that creates a table must include the
  # ALTER, and a dry run will NOT catch it, because the dry run also connects
  # as supabase_admin.
  docker exec -i -e "PGPASSWORD=${PGPASS}" "${DB_CONTAINER}" \
    psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"
}

# ---------------------------------------------------------------------------
# 3. Ledger. Separate from supabase_migrations.schema_migrations, which is empty
#    here and owned by the CLI.
# ---------------------------------------------------------------------------
psql_run <<'SQL'
CREATE TABLE IF NOT EXISTS public.deployment_migrations (
  version     TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.deployment_migrations IS
  'Migrations applied by scripts/migrate-deployed.sh to the database this deployment reads. Distinct from supabase_migrations.schema_migrations, which the CLI owns and which is empty because the schema came from a baseline dump.';
SQL

APPLIED="$(psql_run -t -A -c 'SELECT version FROM public.deployment_migrations' || true)"

# ---------------------------------------------------------------------------
# 4. An empty ledger means a fresh database: build it with
#    scripts/baseline/bootstrap.sh, never by marking files applied.
#
#    This script used to "adopt" every existing migration on an empty ledger,
#    asserting the schema already reflected them. It did not: at least
#    20260316100001_agent_table_v2, 20260724120000_add_database_change_stream
#    and 20260806133000_create_agent_pipelines were adopted and never ran here
#    (found and repaired 2026-09-28, 20260928131500 and 20260928160000). The
#    baseline in supabase/baseline is the Studio's schema as of its CUTOFF;
#    scripts/baseline/check-drift.sh fails a deploy when the two part ways.
# ---------------------------------------------------------------------------
if [[ -z "${APPLIED}" ]]; then
  echo "The ledger is empty. For a fresh database run scripts/baseline/bootstrap.sh;" >&2
  echo "it loads supabase/baseline and records what it covers. Nothing was applied." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Apply what is pending, oldest first.
# ---------------------------------------------------------------------------
PENDING=()
for file in supabase/migrations/*.sql; do
  version="$(basename "${file}" .sql | cut -d_ -f1)"
  grep -qx "${version}" <<<"${APPLIED}" || PENDING+=("${file}")
done

if [[ ${#PENDING[@]} -eq 0 ]]; then
  echo "No pending migrations."
  exit 0
fi

echo "Pending (${#PENDING[@]}):"
printf '  %s\n' "${PENDING[@]##*/}"

if [[ "${DRY_RUN}" == true ]]; then
  exit 0
fi

for file in "${PENDING[@]}"; do
  version="$(basename "${file}" .sql | cut -d_ -f1)"
  printf 'applying %-52s ' "$(basename "${file}")"
  if psql_run -f - < "${file}" >/dev/null; then
    psql_run -c "INSERT INTO public.deployment_migrations (version, filename) VALUES ('${version}', '$(basename "${file}")')"
    echo "ok"
  else
    echo "FAILED"
    echo "Migration ${file} failed against ${DB_CONTAINER}. Nothing further applied." >&2
    exit 1
  fi
done

echo "Applied ${#PENDING[@]} migration(s) to ${DB_CONTAINER}."
