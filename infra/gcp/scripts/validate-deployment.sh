#!/usr/bin/env bash
# validate-deployment.sh - Validate GCP deployment health
#
# Usage: ./validate-deployment.sh <environment>
# Example: ./validate-deployment.sh dev
#
# Reads Terraform outputs from the specified environment to determine endpoints.
# Requires: gcloud, curl, terraform (run from infra/gcp/)

set -euo pipefail

ENV="${1:?Usage: $0 <environment> (dev|prod)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

PASS=0
FAIL=0
RESULTS=()

check() {
  local name="$1"
  local cmd="$2"
  printf "  %-40s " "$name"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "[PASS]"
    RESULTS+=("PASS: $name")
    ((PASS++))
  else
    echo "[FAIL]"
    RESULTS+=("FAIL: $name")
    ((FAIL++))
  fi
}

echo "============================================"
echo " OrchestratorAI - GCP Deployment Check"
echo " Environment: $ENV"
echo " Timestamp:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "============================================"
echo ""

# Read Terraform outputs
cd "$INFRA_DIR"
echo "Reading Terraform outputs..."
API_URL=$(terraform output -raw api_cloud_run_url 2>/dev/null || echo "")
WEB_URL=$(terraform output -raw web_cloud_run_url 2>/dev/null || echo "")
SQL_CONN=$(terraform output -raw cloud_sql_connection_name 2>/dev/null || echo "")
MEDIA_BUCKET=$(terraform output -raw media_bucket_name 2>/dev/null || echo "")
DB_NAME=$(terraform output -raw database_name 2>/dev/null || echo "")
NAME_PREFIX="orchestrator-ai-${ENV}"

# Extract project ID from connection name (project:region:instance)
PROJECT_ID=$(echo "$SQL_CONN" | cut -d: -f1)
REGION=$(echo "$SQL_CONN" | cut -d: -f2)
echo ""

# ── API Health ──
echo "Cloud Run API Service"
check "API health endpoint" \
  "curl -sf --max-time 10 '${API_URL}/health'"
check "API invoke endpoint present" \
  "curl -sf --max-time 10 -o /dev/null -w '%{http_code}' '${API_URL}/invoke/providers-models' | grep -qE '200|401|403'"
echo ""

# ── Web Health ──
echo "Cloud Run Web Service"
check "Web app responds" \
  "curl -sf --max-time 10 '${WEB_URL}/' -o /dev/null"
check "Web health endpoint" \
  "curl -sf --max-time 10 '${WEB_URL}/health'"
echo ""

# ── Cloud SQL ──
echo "Cloud SQL (PostgreSQL)"
check "Cloud SQL instance running" \
  "gcloud sql instances describe \$(echo '${SQL_CONN}' | cut -d: -f3) --project='${PROJECT_ID}' --format='value(state)' 2>/dev/null | grep -q 'RUNNABLE'"
check "Cloud SQL database exists" \
  "gcloud sql databases describe '${DB_NAME}' --instance=\$(echo '${SQL_CONN}' | cut -d: -f3) --project='${PROJECT_ID}' 2>/dev/null"
echo ""

# ── Secret Manager (prefixed secret IDs created by Terraform) ──
echo "Secret Manager"
check "Secret Manager access" \
  "gcloud secrets list --project='${PROJECT_ID}' --limit=1 --format='value(name)' 2>/dev/null"
check "openrouter-api-key secret exists" \
  "gcloud secrets describe '${NAME_PREFIX}-openrouter-api-key' --project='${PROJECT_ID}' 2>/dev/null"
check "jwt-secret secret exists" \
  "gcloud secrets describe '${NAME_PREFIX}-jwt-secret' --project='${PROJECT_ID}' 2>/dev/null"
check "google-client-secret secret exists" \
  "gcloud secrets describe '${NAME_PREFIX}-google-client-secret' --project='${PROJECT_ID}' 2>/dev/null"
echo ""

# ── Cloud Storage ──
echo "Cloud Storage"
check "Media bucket exists" \
  "gcloud storage buckets describe 'gs://${MEDIA_BUCKET}' --project='${PROJECT_ID}' 2>/dev/null"
check "Media bucket accessible" \
  "gcloud storage ls 'gs://${MEDIA_BUCKET}/' --project='${PROJECT_ID}' 2>/dev/null"
echo ""

# ── Summary ──
TOTAL=$((PASS + FAIL))
echo "============================================"
echo " Results: ${PASS}/${TOTAL} checks passed"
echo "============================================"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "DEPLOYMENT VALIDATION FAILED ($FAIL issues)"
  exit 1
else
  echo "DEPLOYMENT VALIDATION PASSED"
  exit 0
fi
