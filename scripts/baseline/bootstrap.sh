#!/usr/bin/env bash
# Build a fresh database from the baseline:
#   supabase/baseline/schema.sql + seed.sql, the demo and admin login personas
#   (passwords from VITE_DEMO_USER_PASSWORD and ADMIN_USER_PASSWORD in .env)
#   and the system user,
#   then every migration after supabase/baseline/CUTOFF,
# and record all of it in public.deployment_migrations, so
# scripts/migrate-deployed.sh carries on from there.
#
#   scripts/baseline/bootstrap.sh                   the database this deployment reads (must be fresh)
#   scripts/baseline/bootstrap.sh --database NAME   another database in the same Postgres (scratch, drift check)
#   BOOTSTRAP_DB_CONTAINER=<container> scripts/baseline/bootstrap.sh
#                                                   a new environment's database in a container the
#                                                   compose config doesn't describe (a client's stack)
#
# Refuses a database that already has a ledger or an agents table: this is for
# new environments only.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "${ROOT_DIR}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"
# shellcheck source=../lib/deployed-db.sh
source "${ROOT_DIR}/scripts/lib/deployed-db.sh"
# A new environment's own database in a container you name. The fresh-database
# check below still refuses anything that already has a schema.
if [[ -n "${BOOTSTRAP_DB_CONTAINER:-}" ]]; then DB_CONTAINER="${BOOTSTRAP_DB_CONTAINER}"; fi

DATABASE=postgres
if [[ "${1:-}" == "--database" ]]; then DATABASE="${2:?--database needs a name}"; fi
PW="$(docker exec "${DB_CONTAINER}" printenv POSTGRES_PASSWORD)"
run() { docker exec -i -e PGPASSWORD="${PW}" "${DB_CONTAINER}" psql -U supabase_admin -d "${DATABASE}" -X -q -v ON_ERROR_STOP=1 "$@"; }
CUTOFF="$(cat supabase/baseline/CUTOFF)"

# migrate-deployed.sh may already have created an empty ledger; an empty one is fine.
has_agents="$(run -At -c "SELECT to_regclass('public.agents') IS NOT NULL")"
recorded=0
if [[ "$(run -At -c "SELECT to_regclass('public.deployment_migrations') IS NOT NULL")" == "t" ]]; then
  recorded="$(run -At -c "SELECT count(*) FROM public.deployment_migrations")"
fi
if [[ "${has_agents}" == "t" || "${recorded}" != "0" ]]; then
  echo "${DATABASE} already has a schema (public.agents, or ${recorded} migrations recorded); bootstrap is for fresh databases only." >&2
  exit 1
fi

echo "Loading the baseline (cutoff ${CUTOFF}) into ${DATABASE}..."
run < supabase/baseline/schema.sql >/dev/null
run < supabase/baseline/seed.sql >/dev/null
# The login personas and the system user live in auth.users, which the
# baseline does not carry.
run < supabase/migrations/20260716150000_seed_demo_login_user.sql >/dev/null
run < supabase/migrations/20260920120000_seed_admin_login_user.sql >/dev/null
run < supabase/baseline/system-user.sql >/dev/null

# The persona migrations give each persona a random password nobody knows; the
# real ones come from .env and never from the repo. The value reaches psql
# through the container's environment (docker exec -e NAME, no value on the
# command line) and \getenv, and is sent as a bind parameter, so it never
# shows in a process list, an error message or a log.
set_persona_password() {
  local email="$1" key="$2" value
  value="$(grep -E "^${key}=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  if [[ -z "${value}" ]]; then
    echo "${key} is not set in .env: ${email} keeps a random password and cannot sign in until you set one." >&2
    return
  fi
  local updated
  updated="$(PGPASSWORD="${PW}" PERSONA_PASSWORD="${value}" docker exec -i -e PGPASSWORD -e PERSONA_PASSWORD "${DB_CONTAINER}" \
    psql -U supabase_admin -d "${DATABASE}" -X -q -At -v ON_ERROR_STOP=1 -v email="${email}" <<'SQL'
\set VERBOSITY terse
\set SHOW_CONTEXT never
\getenv persona_password PERSONA_PASSWORD
WITH u AS (
  UPDATE auth.users
     SET encrypted_password = extensions.crypt($1, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE email = $2
  RETURNING 1
)
SELECT count(*) FROM u \bind :persona_password :email \g
SQL
)"
  if [[ "${updated}" != "1" ]]; then
    echo "Setting the password for ${email} updated ${updated:-0} rows, expected 1." >&2
    exit 1
  fi
  echo "Set the password for ${email} from ${key}."
}
set_persona_password demo-user@orchestratorai.io VITE_DEMO_USER_PASSWORD
set_persona_password admin-user@orchestratorai.io ADMIN_USER_PASSWORD

run >/dev/null <<'SQL'
CREATE TABLE IF NOT EXISTS public.deployment_migrations (
  version     TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.deployment_migrations IS
  'Migrations in this database: the ones folded into supabase/baseline (up to its CUTOFF) and each applied since by scripts/migrate-deployed.sh.';
SQL

for file in supabase/migrations/*.sql; do
  name="$(basename "${file}")"; version="${name%%_*}"
  if [[ "${version}" > "${CUTOFF}" ]]; then
    echo "applying ${name}"
    run < "${file}" >/dev/null
  fi
  run -c "INSERT INTO public.deployment_migrations (version, filename) VALUES ('${version}', '${name}')" >/dev/null
done
echo "Bootstrapped ${DATABASE}: baseline ${CUTOFF} and $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') migrations recorded."
