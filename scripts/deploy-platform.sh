#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-}"

BASE_COMPOSE=(-f docker-compose.yml -f docker-compose.cloudflare.yml)
LOCAL_COMPOSE=(-f docker-compose.yml -f docker-compose.cloudflare.yml -f docker-compose.cloudflare-local.yml)

usage() {
  cat <<'USAGE'
Usage:
  npm run deploy:local
  CF_PUBLIC_URL=https://your-domain.example npm run deploy:spark

Modes:
  local  Build and run the deployed gateway locally on CF_LOCAL_PORT or 7777.
  spark  Build and run the deployed gateway plus Cloudflare tunnel.
USAGE
}

require_cloudflare_config() {
  local config_file="${ROOT_DIR}/cloudflared/config.yml"
  if [[ ! -f "${config_file}" ]]; then
    echo "Missing cloudflared/config.yml. Copy cloudflared/config.yml.template and fill in the tunnel UUID and hostname." >&2
    exit 1
  fi

  local credentials_file
  credentials_file="$(
    awk -F': *' '/credentials-file:/ { print $2 }' "${config_file}" |
      sed "s/^['\"]//; s/['\"]$//"
  )"

  if [[ -z "${credentials_file}" ]]; then
    echo "cloudflared/config.yml is missing credentials-file." >&2
    exit 1
  fi

  credentials_file="${credentials_file#/etc/cloudflared/}"
  if [[ ! -f "${ROOT_DIR}/cloudflared/${credentials_file}" ]]; then
    echo "Missing cloudflared credential file: cloudflared/${credentials_file}" >&2
    exit 1
  fi
}

wait_for_public_health() {
  local public_url="$1"
  local attempts="${2:-45}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl -fsS "${public_url}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for ${public_url}/api/health" >&2
  return 1
}

wait_for_nginx_api_health() {
  local attempts="${1:-45}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if docker compose "${BASE_COMPOSE[@]}" exec -T nginx wget -qO- http://platform-api:6700/health >/dev/null; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for nginx to reach platform-api health." >&2
  return 1
}

cd "${ROOT_DIR}"

case "${MODE}" in
  local)
    export CF_LOCAL_PORT="${CF_LOCAL_PORT:-7777}"
    export CF_PUBLIC_URL="${CF_PUBLIC_URL:-http://localhost:${CF_LOCAL_PORT}}"
    HEALTH_URL="${CF_HEALTH_URL:-http://localhost:${CF_LOCAL_PORT}}"
    docker compose "${LOCAL_COMPOSE[@]}" build platform-api platform-web nginx
    docker compose "${LOCAL_COMPOSE[@]}" up -d --force-recreate platform-api platform-web nginx
    wait_for_public_health "${HEALTH_URL}"
    echo "Local deployed gateway is running at ${HEALTH_URL}"
    ;;
  spark)
    if [[ -z "${CF_PUBLIC_URL:-}" ]]; then
      echo "CF_PUBLIC_URL is required, for example: CF_PUBLIC_URL=https://orchestratorai.io npm run deploy:spark" >&2
      exit 1
    fi
    require_cloudflare_config
    docker compose "${BASE_COMPOSE[@]}" build platform-api platform-web nginx
    docker compose "${BASE_COMPOSE[@]}" up -d --force-recreate platform-api platform-web nginx cloudflared
    wait_for_nginx_api_health
    echo "Spark deployed gateway is running behind Cloudflare at ${CF_PUBLIC_URL}"
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
