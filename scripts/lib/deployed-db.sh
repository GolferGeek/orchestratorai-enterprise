# Resolve the database container the deployed API actually reads, from the
# compose configuration. Sourced by migrate-deployed.sh and
# smoke-observability.sh; sets DEPLOYED_URL, DB_PORT and DB_CONTAINER, or
# exits non-zero with the reason. Never guess this: migrations once went to
# 54322 for months while the live site read 6011.

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
