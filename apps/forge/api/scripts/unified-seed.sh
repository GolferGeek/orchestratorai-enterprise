#!/usr/bin/env bash
set -euo pipefail

SKIP_RESET=false
VERIFY_ONLY=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-reset)
      SKIP_RESET=true
      shift
      ;;
    --verify-only)
      VERIFY_ONLY=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown flag: $1" >&2
      echo "Usage: $0 [--skip-reset] [--verify-only] [--dry-run]" >&2
      exit 1
      ;;
  esac
done

DB_PROVIDER="${DB_PROVIDER:-}"
if [[ -z "${DB_PROVIDER}" ]]; then
  echo "DB_PROVIDER is required (supabase_pg|sqlserver)" >&2
  exit 1
fi

run_cmd() {
  local cmd="$1"
  echo "→ $cmd"
  if [[ "${DRY_RUN}" == "false" ]]; then
    eval "$cmd"
  fi
}

echo "========================================"
echo " Unified Seed Bootstrap"
echo "========================================"
echo "DB_PROVIDER=${DB_PROVIDER}"
echo "SKIP_RESET=${SKIP_RESET}"
echo "VERIFY_ONLY=${VERIFY_ONLY}"
echo "DRY_RUN=${DRY_RUN}"

if [[ "${VERIFY_ONLY}" == "false" ]]; then
  if [[ "${DB_PROVIDER}" == "supabase_pg" ]]; then
    if [[ "${SKIP_RESET}" == "false" ]]; then
      run_cmd "supabase db reset"
    else
      echo "Skipping supabase db reset"
    fi
  elif [[ "${DB_PROVIDER}" == "sqlserver" ]]; then
    run_cmd "npm run bootstrap:sqlserver-pilot-schema"
  else
    echo "Unsupported DB_PROVIDER: ${DB_PROVIDER}" >&2
    exit 1
  fi
fi

run_cmd "npm run init:verify"
echo "✅ Unified seed bootstrap completed"
