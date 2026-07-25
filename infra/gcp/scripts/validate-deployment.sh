#!/usr/bin/env bash

set -euo pipefail

ENVIRONMENT="${1:?Usage: $0 <dev|prod>}"
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
  echo "ERROR: Environment must be dev or prod." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM="$SCRIPT_DIR/terraform.sh"
NAME_PREFIX="orchestrator-ai-${ENVIRONMENT}"

required_commands=(curl gcloud jq rg)
for required_command in "${required_commands[@]}"; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "ERROR: Required command is unavailable: $required_command" >&2
    exit 1
  fi
done

required_output() {
  local output_name="$1"
  local output_value
  output_value="$("$TERRAFORM" output -raw "$output_name")"
  if [ -z "$output_value" ]; then
    echo "ERROR: Terraform output is empty: $output_name" >&2
    exit 1
  fi
  printf '%s' "$output_value"
}

API_URL="$(required_output api_cloud_run_url)"
WEB_URL="$(required_output web_cloud_run_url)"
PUBLIC_API_URL="$(required_output public_api_url)"
SQL_CONNECTION_NAME="$(required_output cloud_sql_connection_name)"
MEDIA_BUCKET="$(required_output media_bucket_name)"
DATABASE_NAME="$(required_output database_name)"
WORK_PROVIDER="$(required_output work_provider)"
PROJECT_ID="${SQL_CONNECTION_NAME%%:*}"
REGION_WITH_INSTANCE="${SQL_CONNECTION_NAME#*:}"
REGION="${REGION_WITH_INSTANCE%%:*}"
SQL_INSTANCE_NAME="${SQL_CONNECTION_NAME##*:}"
PUBLIC_WEB_URL="${PUBLIC_API_URL/api./www.}"
PUBLIC_API_DOMAIN="${PUBLIC_API_URL#https://}"
PUBLIC_WEB_DOMAIN="${PUBLIC_WEB_URL#https://}"

echo "Validating Cloud Run service health..."
curl --fail --silent --show-error --max-time 20 "$API_URL/health" >/dev/null
curl --fail --silent --show-error --max-time 20 "$WEB_URL/health" >/dev/null

invoke_status="$(
  curl \
    --silent \
    --output /dev/null \
    --write-out '%{http_code}' \
    --max-time 20 \
    "$API_URL/invoke/providers-models"
)"
if [[ "$invoke_status" != "200" && "$invoke_status" != "401" && "$invoke_status" != "403" ]]; then
  echo "ERROR: API invoke endpoint returned HTTP $invoke_status" >&2
  exit 1
fi

echo "Validating Cloud Run provider and secret configuration..."
api_service_json="$(
  gcloud run services describe "${NAME_PREFIX}-api" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format=json
)"
required_env_pairs=(
  "AUTH_PROVIDER=google_oidc"
  "CONFIG_PROVIDER=gcp_secret_manager"
  "DB_PROVIDER=postgresql"
  "RAG_PROVIDER=postgresql"
  "STORAGE_PROVIDER=gcs"
  "LLM_PROVIDER=openrouter"
  "OBSERVABILITY_PROVIDER=database_events"
  "WORK_PROVIDER=$WORK_PROVIDER"
  "OPENROUTER_VIDEO_ENABLED=false"
  "OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED=false"
)
for required_pair in "${required_env_pairs[@]}"; do
  required_name="${required_pair%%=*}"
  required_value="${required_pair#*=}"
  actual_value="$(
    jq -r \
      --arg required_name "$required_name" \
      '.spec.template.spec.containers[0].env[]
       | select(.name == $required_name)
       | .value // empty' \
      <<<"$api_service_json"
  )"
  if [ "$actual_value" != "$required_value" ]; then
    echo "ERROR: $required_name expected '$required_value', received '$actual_value'." >&2
    exit 1
  fi
done

required_secret_env=(
  DATABASE_URL
  GOOGLE_CLIENT_SECRET
  JWT_SECRET
  OPENROUTER_API_KEY
  POSTGRESQL_URL
  RAG_POSTGRESQL_URL
)
for required_name in "${required_secret_env[@]}"; do
  secret_name="$(
    jq -r \
      --arg required_name "$required_name" \
      '.spec.template.spec.containers[0].env[]
       | select(.name == $required_name)
       | .valueFrom.secretKeyRef.name // empty' \
      <<<"$api_service_json"
  )"
  if [ -z "$secret_name" ]; then
    echo "ERROR: $required_name is not backed by Secret Manager." >&2
    exit 1
  fi
done

echo "Validating Cloud SQL security and migration state..."
sql_instance_json="$(
  gcloud sql instances describe "$SQL_INSTANCE_NAME" \
    --project="$PROJECT_ID" \
    --format=json
)"
authorized_network_count="$(
  jq '.settings.ipConfiguration.authorizedNetworks // [] | length' \
    <<<"$sql_instance_json"
)"
if [ "$authorized_network_count" -ne 0 ]; then
  echo "ERROR: Cloud SQL has public authorized networks configured." >&2
  exit 1
fi
if [ "$(jq -r '.state' <<<"$sql_instance_json")" != "RUNNABLE" ]; then
  echo "ERROR: Cloud SQL instance is not RUNNABLE." >&2
  exit 1
fi
gcloud sql databases describe "$DATABASE_NAME" \
  --instance="$SQL_INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  >/dev/null

echo "Validating Secret Manager versions..."
required_secret_suffixes=(
  database-url
  google-client-secret
  jwt-secret
  openrouter-api-key
)
for secret_suffix in "${required_secret_suffixes[@]}"; do
  enabled_versions="$(
    gcloud secrets versions list "${NAME_PREFIX}-${secret_suffix}" \
      --project="$PROJECT_ID" \
      --filter='state=ENABLED' \
      --format='value(name)' |
      wc -l |
      tr -d ' '
  )"
  if [ "$enabled_versions" -eq 0 ]; then
    echo "ERROR: Secret has no enabled version: ${NAME_PREFIX}-${secret_suffix}" >&2
    exit 1
  fi
done

echo "Validating Cloud Storage..."
gcloud storage buckets describe "gs://$MEDIA_BUCKET" \
  --project="$PROJECT_ID" \
  >/dev/null
gcloud storage ls "gs://$MEDIA_BUCKET/" \
  --project="$PROJECT_ID" \
  >/dev/null

echo "Validating custom domains..."
gcloud run domain-mappings describe \
  --domain="$PUBLIC_API_DOMAIN" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  >/dev/null
gcloud run domain-mappings describe \
  --domain="$PUBLIC_WEB_DOMAIN" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  >/dev/null
curl --fail --silent --show-error --max-time 20 \
  "$PUBLIC_API_URL/health" >/dev/null
curl --fail --silent --show-error --max-time 20 \
  "$PUBLIC_WEB_URL/health" >/dev/null

# ---------- Application wiring (fail closed on the classes of bugs that
# ---------- otherwise only surface by clicking around the running app) ----------
echo "Validating application wiring (same-origin proxy, OIDC callback, auth)..."

# The web must proxy /api to the API on its own origin (no CORS). If this serves
# the SPA instead, every authenticated call — and thus login — breaks.
proxy_health="$(curl --silent --max-time 20 "$WEB_URL/api/health" || true)"
if [[ "$proxy_health" != *"platform-api"* ]]; then
  echo "ERROR: web /api proxy did not reach the API. Got: ${proxy_health:0:120}" >&2
  echo "       (check nginx-platform-web.cloudrun.conf + PLATFORM_API_ORIGIN)." >&2
  exit 1
fi

# The OIDC provider redirects to /auth/callback; without that route the auth
# code is silently dropped and login bounces back to the login page.
callback_status="$(
  curl --silent --output /dev/null --write-out '%{http_code}' --max-time 20 \
    "$WEB_URL/auth/callback"
)"
if [ "$callback_status" != "200" ]; then
  echo "ERROR: /auth/callback route missing (HTTP $callback_status); OIDC login would fail." >&2
  exit 1
fi

# The auth endpoints must be reachable through the proxy and answer with API
# JSON (not SPA HTML). Empty body should trigger the API's validation error.
token_exchange_body="$(
  curl --silent --max-time 20 -X POST -H 'Content-Type: application/json' \
    -d '{}' "$WEB_URL/api/auth/google/token-exchange" || true
)"
if [[ "$token_exchange_body" != *"required"* ]]; then
  echo "ERROR: token-exchange not reachable through proxy. Got: ${token_exchange_body:0:120}" >&2
  exit 1
fi

echo "GCP deployment validation passed."
