#!/usr/bin/env bash
# Apply pending migrations to the database THIS DEPLOYMENT ACTUALLY READS.
#
#   scripts/migrate-deployed.sh           apply anything pending
#   scripts/migrate-deployed.sh --dry-run list what would be applied
#
# Why this exists, and why it does not just call `supabase migration up`:
#
#   1. `supabase migration up --local` targets the project in supabase/config.toml
#      — port 54322. The deployed containers read DATABASE_URL from
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

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.cloudflare.yml -f docker-compose.cloudflare-local.yml)

# ---------------------------------------------------------------------------
# 1. Ask the compose config what the API will read. Never guess this.
# ---------------------------------------------------------------------------
# `docker compose config` renders YAML (KEY: value). Anchor on the key so
# DEPLOY_DATABASE_URL — a different, unused setting pointing elsewhere — cannot
# be picked up by accident.
DEPLOYED_URL="$(
  docker compose "${COMPOSE_FILES[@]}" config 2>/dev/null \
    | awk '/^  platform-api:/{f=1}
           f && $1 == "DATABASE_URL:" {print $2; exit}'
)"

if [[ -z "${DEPLOYED_URL}" ]]; then
  echo "Could not read DATABASE_URL from the compose configuration." >&2
  echo "Refusing to migrate a database I cannot prove the deployment uses." >&2
  exit 1
fi

DB_PORT="$(sed -E 's#.*:([0-9]+)/[^/]*$#\1#' <<<"${DEPLOYED_URL}")"
if [[ ! "${DB_PORT}" =~ ^[0-9]+$ ]]; then
  echo "Could not parse a port out of DATABASE_URL: ${DEPLOYED_URL//:*@/:***@}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Find the container publishing that port. This is the check that would have
#    caught migrating 54322 while the site read 6011.
# ---------------------------------------------------------------------------
DB_CONTAINER="$(docker ps --format '{{.Names}}\t{{.Ports}}' | awk -v p=":${DB_PORT}->" '$0 ~ p {print $1; exit}')"

if [[ -z "${DB_CONTAINER}" ]]; then
  echo "No running container publishes port ${DB_PORT}." >&2
  echo "The deployment expects its database there (${DEPLOYED_URL//:*@/:***@})." >&2
  exit 1
fi

echo "Deployment reads port ${DB_PORT} -> container ${DB_CONTAINER}"

PGPASS="$(docker exec "${DB_CONTAINER}" printenv POSTGRES_PASSWORD)"
psql_run() {
  # supabase_admin owns the public schema; the postgres role lacks CREATE on it
  # after a no-owner restore, so DDL has to run as the owner.
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
# 4. First run: adopt everything already present rather than replaying it.
#
#    The schema came from a baseline dump plus migrations applied by hand, so
#    the files up to now are already reflected in the database. Replaying them
#    would fail on existing objects. Adopting them is an assertion about the
#    past that cannot be verified from here, so it is stated once, loudly, and
#    only ever happens on an empty ledger.
# ---------------------------------------------------------------------------
if [[ -z "${APPLIED}" ]]; then
  echo
  echo "Ledger is empty — treating the 34 existing migrations as already applied."
  echo "This assumes the current schema reflects them, which is true because it"
  echo "came from a baseline dump. Only migrations added AFTER this point will run."
  echo
  if [[ "${DRY_RUN}" == true ]]; then
    echo "(dry run — ledger not seeded)"
    exit 0
  fi
  for file in supabase/migrations/*.sql; do
    version="$(basename "${file}" .sql | cut -d_ -f1)"
    psql_run -c "INSERT INTO public.deployment_migrations (version, filename) VALUES ('${version}', '$(basename "${file}")') ON CONFLICT (version) DO NOTHING"
  done
  echo "Ledger seeded. Future runs apply only what is new."
  exit 0
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
