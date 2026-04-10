#!/bin/bash
#
# Run the full Contract Review E2E test suite.
#
# Prerequisites:
#   - Forge API running on localhost:6200
#   - Auth API running on localhost:6100
#   - Supabase running (REST 54321, Postgres 54322)
#   - legal-department agent seeded in the database
#   - LLM provider available (Ollama with gemma4:31b or cloud provider)
#
# Usage:
#   ./run-contract-review-tests.sh              # Run all
#   ./run-contract-review-tests.sh clause        # Run clause-segmentation only
#   ./run-contract-review-tests.sh specialist    # Run specialist-findings only
#   ./run-contract-review-tests.sh redline       # Run redline-output only
#   ./run-contract-review-tests.sh hitl          # Run hitl-review-flow only
#   ./run-contract-review-tests.sh rejection     # Run rejection-reanalysis only
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

cd "$ROOT_DIR"

# Default: run all contract-review tests
FILTER="${1:-}"

case "$FILTER" in
  clause)
    echo "Running: Clause Segmentation tests"
    npx jest --config apps/forge/api/testing/test/jest-e2e.json \
      legal-department/contract-review/clause-segmentation --verbose
    ;;
  specialist)
    echo "Running: Specialist Findings tests"
    npx jest --config apps/forge/api/testing/test/jest-e2e.json \
      legal-department/contract-review/specialist-findings --verbose
    ;;
  redline)
    echo "Running: Redline Output tests"
    npx jest --config apps/forge/api/testing/test/jest-e2e.json \
      legal-department/contract-review/redline-output --verbose
    ;;
  hitl)
    echo "Running: HITL Review Flow tests"
    npx jest --config apps/forge/api/testing/test/jest-e2e.json \
      legal-department/contract-review/hitl-review-flow --verbose
    ;;
  rejection)
    echo "Running: Rejection Re-Analysis tests"
    npx jest --config apps/forge/api/testing/test/jest-e2e.json \
      legal-department/contract-review/rejection-reanalysis --verbose
    ;;
  *)
    echo "Running: ALL Contract Review E2E tests"
    npx jest --config apps/forge/api/testing/test/jest-e2e.json \
      legal-department/contract-review/ --verbose
    ;;
esac
