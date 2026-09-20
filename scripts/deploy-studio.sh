#!/usr/bin/env bash
# Deploy orchestratorai-enterprise on the Mac Studio (enterprise.orchestratorai.io).
#
#   scripts/deploy-studio.sh            pull main, migrate local Supabase, build, restart, health-check
#   scripts/deploy-studio.sh --no-pull  deploy the working tree as-is
#
# Wraps `deploy-platform.sh local` (nginx on :7777, which the native cloudflared
# tunnel routes the public hostnames to). Docker builds started from an ssh
# session cannot reach the macOS keychain that Docker Desktop's credential
# helper uses, so the helper is disabled for the build and restored after.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

if [[ "${1:-}" != "--no-pull" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree is dirty; commit or stash first (or use --no-pull to deploy as-is)." >&2
    git status --short >&2
    exit 1
  fi
  git pull -q --ff-only origin main
fi
echo "Deploying $(git log --oneline -1)"

# Apply any new migrations to the local Supabase stack this deployment uses.
if command -v supabase >/dev/null 2>&1 && lsof -nP -iTCP:54322 -sTCP:LISTEN >/dev/null 2>&1; then
  supabase migration up --local 2>&1 | grep -vE "^\s*$" | tail -3 || true
elif command -v supabase >/dev/null 2>&1; then
  echo "Local Supabase is not running (port 54322); skipping migrations." >&2
fi

DOCKER_CFG="$HOME/.docker/config.json"
BACKUP=""
if [[ -f "${DOCKER_CFG}" ]] && grep -q '"credsStore"' "${DOCKER_CFG}"; then
  BACKUP="$(mktemp "${DOCKER_CFG}.bak.XXXX")"
  cp "${DOCKER_CFG}" "${BACKUP}"
  python3 - "${DOCKER_CFG}" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
d.pop("credsStore", None); d.pop("credHelpers", None)
json.dump(d, open(p, "w"), indent=2)
PY
  trap 'cp "${BACKUP}" "${DOCKER_CFG}"; rm -f "${BACKUP}"' EXIT
fi

export CF_PUBLIC_URL="${CF_PUBLIC_URL:-https://enterprise.orchestratorai.io}"
export CF_LOCAL_PORT="${CF_LOCAL_PORT:-7777}"
DOCKER_BUILDKIT=1 ./scripts/deploy-platform.sh local

# Public check through Cloudflare.
for _ in $(seq 1 30); do
  if curl -fsS -m 10 "${CF_PUBLIC_URL}/api/health" >/dev/null 2>&1; then
    echo "Live: ${CF_PUBLIC_URL} ($(git rev-parse --short HEAD))"
    exit 0
  fi
  sleep 2
done
echo "Deployed locally but ${CF_PUBLIC_URL}/api/health did not answer; check the cloudflared tunnel." >&2
exit 1
