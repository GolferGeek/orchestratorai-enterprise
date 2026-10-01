#!/usr/bin/env bash
# Lint and typecheck every workspace, then every test suite, with every
# database spec on and nothing skipped: apps/api, packages/planes,
# packages/transport-types, apps/web.
#
#   scripts/test-all.sh     (npm run test:all; deploy-studio.sh runs it before building)
#
# Fails on any failed test, and on any skipped one: a skip hides a spec that
# no longer runs. The database specs use TEST_DATABASE_URL (default: the local
# Supabase Postgres on 6011) and clean up after themselves.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
cd "${ROOT_DIR}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

DB="${TEST_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:6011/postgres}"
export WORKFLOW_RUNS_TEST_DATABASE_URL="${DB}" HUMAN_REVIEW_TEST_DATABASE_URL="${DB}"
export CHECKPOINTER_TEST_DATABASE_URL="${DB}" JOB_QUEUE_TEST_DATABASE_URL="${DB}"

LOG="$(mktemp)"
trap 'rm -f "${LOG}"' EXIT

suite() {
  local name="$1" dir="$2"; shift 2
  printf '%-18s ' "${name}"
  if ! (cd "${dir}" && "$@") >"${LOG}" 2>&1; then
    echo "FAILED"
    grep -E '^(FAIL| FAIL)|●|Tests:|Test Files' "${LOG}" | head -40 >&2
    exit 1
  fi
  local summary
  summary="$(grep -E '^Tests:|^ +Tests ' "${LOG}" | tail -1 | sed 's/^ *//')"
  if grep -qiE '(Tests:|Tests ).*(skipped|todo)' <<<"${summary}"; then
    echo "SKIPPED TESTS: ${summary}"
    exit 1
  fi
  echo "${summary}"
}

# A lint error or a type error fails the run, like a failing test.
check() {
  local name="$1" dir="$2"; shift 2
  printf '%-18s ' "${name}"
  if ! (cd "${dir}" && "$@") >"${LOG}" 2>&1; then
    echo "FAILED"
    head -40 "${LOG}" >&2
    exit 1
  fi
  echo "clean"
}

check "lint api" apps/api npx eslint . --max-warnings 0
check "lint planes" packages/planes npx eslint . --max-warnings 0
check "lint web" apps/web npx eslint . --max-warnings 0
check "types api" apps/api npx tsc --noEmit -p tsconfig.json
check "types planes" packages/planes npx tsc --noEmit -p tsconfig.test.json
check "types transport" packages/transport-types npx tsc --noEmit -p tsconfig.json
check "types web" apps/web npx vue-tsc --noEmit

suite "apps/api" apps/api npx jest
suite "packages/planes" packages/planes npx jest --config jest.config.js
suite "transport-types" packages/transport-types npx jest --config jest.config.cjs
suite "apps/web" apps/web npm test --silent
echo "Lint and types clean; all suites green, nothing skipped."
