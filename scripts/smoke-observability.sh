#!/usr/bin/env bash
# Post-deploy observability smoke (effort 5b, O7): one small LLM call on the
# default model must show up in the live admin stream, the admin usage list
# (by its request id) and the admin event log. Exits non-zero, with the
# reason, when any of the three misses it.
#
#   scripts/smoke-observability.sh      (run by deploy-studio.sh after the health check)
#
# Needs in .env: SMOKE_ADMIN_EMAIL, SMOKE_ADMIN_PASSWORD (a platform
# super-admin), DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL. CF_PUBLIC_URL names
# the site (default https://enterprise.orchestratorai.io).
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
cd "${ROOT_DIR}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

setting() {
  local value
  value="$(grep -E "^$1=" .env | tail -1 | cut -d= -f2-)"
  if [[ -z "${value}" ]]; then
    echo "Observability smoke: $1 is not set in .env" >&2
    exit 1
  fi
  printf '%s' "${value}"
}

# shellcheck source=lib/deployed-db.sh
source "${ROOT_DIR}/scripts/lib/deployed-db.sh"

# The smoke's own conversation, so its usage row can be written (llm_usage
# has a foreign key to conversations). Owned by the smoke admin, org "*".
SMOKE_CONVERSATION_ID="5e0e0000-0000-4000-a000-00000000d3a1"
SMOKE_ADMIN_EMAIL="$(setting SMOKE_ADMIN_EMAIL)"
docker exec -i "${DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
  -v conv="${SMOKE_CONVERSATION_ID}" -v email="${SMOKE_ADMIN_EMAIL}" <<'SQL'
INSERT INTO public.conversations (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
SELECT :'conv'::uuid, u.id, 'deploy-smoke', 'smoke', '*', now(), now(), now()
  FROM auth.users u WHERE u.email = :'email'
ON CONFLICT (id) DO NOTHING;
SQL

API_URL="${CF_PUBLIC_URL:-https://enterprise.orchestratorai.io}/api" \
SMOKE_CONVERSATION_ID="${SMOKE_CONVERSATION_ID}" \
SMOKE_ADMIN_EMAIL="${SMOKE_ADMIN_EMAIL}" \
SMOKE_ADMIN_PASSWORD="$(setting SMOKE_ADMIN_PASSWORD)" \
SMOKE_PROVIDER="$(setting DEFAULT_LLM_PROVIDER)" \
SMOKE_MODEL="$(setting DEFAULT_LLM_MODEL)" \
SMOKE_TAG="deploy-smoke-$(git rev-parse --short HEAD)" \
  node scripts/smoke-observability.mjs
