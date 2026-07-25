#!/usr/bin/env bash

set -euo pipefail

ENVIRONMENT="${1:?Usage: $0 <dev|prod> <plan|apply> [tfvars-file]}"
MODE="${2:?Usage: $0 <dev|prod> <plan|apply> [tfvars-file]}"
TFVARS_FILE="${3:-${ENVIRONMENT}.tfvars}"

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
  echo "ERROR: Environment must be dev or prod." >&2
  exit 1
fi
if [[ "$MODE" != "plan" && "$MODE" != "apply" ]]; then
  echo "ERROR: Mode must be plan or apply." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$INFRA_DIR/../.." && pwd)"
TFVARS_PATH="$INFRA_DIR/$TFVARS_FILE"
SECRETS_FILE="${GCP_SECRETS_FILE:-$REPO_ROOT/.env.secrets}"
TERRAFORM="$SCRIPT_DIR/terraform.sh"
PROXY_IMAGE="gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.18.2"
PROXY_CONTAINER="orchestratorai-cloud-sql-proxy-${ENVIRONMENT}-$$"
PROXY_RUNNING=false

cleanup() {
  if [ "$PROXY_RUNNING" = true ]; then
    docker rm -f "$PROXY_CONTAINER" >/dev/null
    PROXY_RUNNING=false
  fi
}
trap cleanup EXIT

required_commands=(awk curl docker gcloud jq pg_isready psql rg)
for required_command in "${required_commands[@]}"; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "ERROR: Required command is unavailable: $required_command" >&2
    exit 1
  fi
done

if [ ! -f "$TFVARS_PATH" ]; then
  echo "ERROR: Terraform variable file is missing: $TFVARS_PATH" >&2
  exit 1
fi
if [ ! -f "$SECRETS_FILE" ]; then
  echo "ERROR: GCP secrets file is missing: $SECRETS_FILE" >&2
  exit 1
fi

read_assignment() {
  local file_path="$1"
  local variable_name="$2"
  awk -v variable_name="$variable_name" '
    $0 ~ "^[[:space:]]*" variable_name "[[:space:]]*=" {
      sub("^[[:space:]]*" variable_name "[[:space:]]*=[[:space:]]*", "")
      if ($0 ~ /^".*"$/) {
        sub(/^"/, "")
        sub(/"$/, "")
      }
      print
      exit
    }
  ' "$file_path"
}

require_secret() {
  local secret_name="$1"
  local secret_value
  secret_value="$(read_assignment "$SECRETS_FILE" "$secret_name")"
  if [ -z "$secret_value" ]; then
    echo "ERROR: $secret_name must be set in $SECRETS_FILE" >&2
    exit 1
  fi
  printf '%s' "$secret_value"
}

PROJECT_ID="$(read_assignment "$TFVARS_PATH" project_id)"
REGION="$(read_assignment "$TFVARS_PATH" region)"
DOMAIN_NAME="$(read_assignment "$TFVARS_PATH" domain_name)"
GOOGLE_CLIENT_ID="$(read_assignment "$TFVARS_PATH" google_client_id)"
REGION="${REGION:-us-central1}"

for required_value_name in PROJECT_ID DOMAIN_NAME GOOGLE_CLIENT_ID; do
  if [ -z "${!required_value_name}" ]; then
    echo "ERROR: $required_value_name is missing from $TFVARS_PATH" >&2
    exit 1
  fi
done

OPENROUTER_API_KEY="$(require_secret OPENROUTER_API_KEY)"
GOOGLE_CLIENT_SECRET="$(require_secret GOOGLE_CLIENT_SECRET)"
JWT_SECRET="$(require_secret JWT_SECRET)"
DB_PASSWORD="$(require_secret DB_PASSWORD)"
POSTGRES_PASSWORD="$(require_secret POSTGRES_PASSWORD)"
export TF_VAR_db_password="$DB_PASSWORD"

echo "Checking Google Cloud authentication..."
gcloud auth print-access-token >/dev/null
gcloud auth application-default print-access-token >/dev/null
gcloud projects describe "$PROJECT_ID" --format='value(projectId)' |
  rg -Fxq "$PROJECT_ID"

STATE_BUCKET="${PROJECT_ID}-terraform-state"
existing_state_bucket="$(
  gcloud storage buckets list \
    --project="$PROJECT_ID" \
    --filter="name=$STATE_BUCKET" \
    --format='value(name)'
)"
if [ -z "$existing_state_bucket" ]; then
  if [ "$MODE" = "plan" ]; then
    echo "ERROR: Terraform state bucket does not exist: gs://$STATE_BUCKET" >&2
    echo "Run the apply workflow once to create the secured state bucket." >&2
    exit 1
  fi
  echo "Creating secured Terraform state bucket..."
  gcloud storage buckets create "gs://$STATE_BUCKET" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access
  gcloud storage buckets update "gs://$STATE_BUCKET" \
    --versioning \
    --public-access-prevention
fi

state_bucket_json="$(
  gcloud storage buckets describe "gs://$STATE_BUCKET" \
    --project="$PROJECT_ID" \
    --format=json
)"
if [ "$(jq -r '.versioning_enabled' <<<"$state_bucket_json")" != "true" ]; then
  echo "ERROR: Terraform state bucket versioning is not enabled." >&2
  exit 1
fi
if [ "$(jq -r '.public_access_prevention' <<<"$state_bucket_json")" != "enforced" ]; then
  echo "ERROR: Terraform state bucket public access prevention is not enforced." >&2
  exit 1
fi

"$TERRAFORM" init \
  -reconfigure \
  -backend-config="bucket=$STATE_BUCKET" \
  -backend-config="prefix=${ENVIRONMENT}/terraform/state"
"$TERRAFORM" fmt -check -recursive
"$TERRAFORM" validate

terraform_vars=(-var-file="$TFVARS_FILE")

if [ "$MODE" = "plan" ]; then
  "$TERRAFORM" plan \
    -input=false \
    "${terraform_vars[@]}"
  echo "GCP $ENVIRONMENT plan completed. No infrastructure was changed."
  exit 0
fi

echo "Planning foundational infrastructure..."
"$TERRAFORM" plan \
  -input=false \
  "${terraform_vars[@]}" \
  -target=module.project_setup \
  -target=module.networking \
  -target=module.identity \
  -target=module.artifact_registry \
  -target=module.secret_manager \
  -target=module.database \
  -target=module.storage \
  -out=foundation.tfplan
"$TERRAFORM" apply -input=false foundation.tfplan

ARTIFACT_REGISTRY_URL="$("$TERRAFORM" output -raw artifact_registry_url)"
SQL_CONNECTION_NAME="$("$TERRAFORM" output -raw cloud_sql_connection_name)"
SQL_INSTANCE_NAME="${SQL_CONNECTION_NAME##*:}"
NAME_PREFIX="orchestrator-ai-${ENVIRONMENT}"

echo "Setting Cloud SQL administrator password..."
gcloud sql users set-password postgres \
  --instance="$SQL_INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --password="$POSTGRES_PASSWORD"

add_secret_version() {
  local secret_suffix="$1"
  local secret_value="$2"
  printf '%s' "$secret_value" |
    gcloud secrets versions add "${NAME_PREFIX}-${secret_suffix}" \
      --project="$PROJECT_ID" \
      --data-file=-
}

encoded_db_password="$(
  jq -rn --arg value "$DB_PASSWORD" '$value | @uri'
)"
database_url="postgresql://orchestrator_app:${encoded_db_password}@/orchestrator_ai?host=/cloudsql/${SQL_CONNECTION_NAME}"

echo "Populating Secret Manager..."
add_secret_version openrouter-api-key "$OPENROUTER_API_KEY"
add_secret_version google-client-secret "$GOOGLE_CLIENT_SECRET"
add_secret_version jwt-secret "$JWT_SECRET"
add_secret_version database-url "$database_url"

echo "Starting Cloud SQL Auth Proxy for strict migrations..."
GCLOUD_CONFIG_DIR="${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}"
# Run as root so the container can read the host ADC file (mode 600). The
# proxy image otherwise runs as a non-root user that cannot read mounted creds.
docker run \
  --detach \
  --name "$PROXY_CONTAINER" \
  --user 0:0 \
  -p 127.0.0.1::5432 \
  -v "$GCLOUD_CONFIG_DIR:/root/.config/gcloud:ro" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/root/.config/gcloud/application_default_credentials.json \
  "$PROXY_IMAGE" \
  --address=0.0.0.0 \
  "$SQL_CONNECTION_NAME" >/dev/null
PROXY_RUNNING=true
PROXY_PORT="$(
  docker port "$PROXY_CONTAINER" 5432/tcp |
    awk -F: '{print $NF}'
)"

export PGHOST=127.0.0.1
export PGPORT="$PROXY_PORT"
export PGUSER=postgres
export PGDATABASE=orchestrator_ai
export PGPASSWORD="$POSTGRES_PASSWORD"
for attempt in $(seq 1 60); do
  if pg_isready >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "ERROR: Cloud SQL Auth Proxy did not become ready." >&2
    docker logs "$PROXY_CONTAINER" >&2
    exit 1
  fi
  sleep 1
done
"$SCRIPT_DIR/migrate-cloud-sql.sh"

# Provision the initial super-admin (idempotent) while the proxy is still up.
# ADMIN_EMAIL is read from the secrets file; if unset, provisioning is skipped.
ADMIN_EMAIL="$(read_assignment "$SECRETS_FILE" ADMIN_EMAIL)"
ADMIN_ORG="$(read_assignment "$SECRETS_FILE" ADMIN_ORG)"
export ADMIN_EMAIL ADMIN_ORG
"$SCRIPT_DIR/provision-admin.sh"

docker rm -f "$PROXY_CONTAINER" >/dev/null
PROXY_RUNNING=false

echo "Configuring Docker authentication for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

API_IMAGE="${ARTIFACT_REGISTRY_URL}/orchestratorai-api:${ENVIRONMENT}"
WEB_IMAGE="${ARTIFACT_REGISTRY_URL}/orchestratorai-web:${ENVIRONMENT}"

echo "Building and pushing API image..."
docker build --platform linux/amd64 \
  -t "$API_IMAGE" \
  -f "$REPO_ROOT/docker/nest-api.Dockerfile" \
  --build-arg TURBO_FILTER="@orchestratorai/platform-api" \
  --build-arg APP_DIR=apps/api \
  "$REPO_ROOT"
docker push "$API_IMAGE"

echo "Building and pushing web image..."
docker build --platform linux/amd64 \
  -t "$WEB_IMAGE" \
  -f "$REPO_ROOT/docker/vite-web.Dockerfile" \
  --build-arg TURBO_FILTER="@orchestratorai/platform-web" \
  --build-arg APP_DIR=apps/web \
  --build-arg NGINX_CONF=docker/nginx-platform-web.cloudrun.conf \
  --build-arg VITE_API_BASE_URL="/api" \
  --build-arg VITE_MONOLITH_MODE=true \
  --build-arg VITE_AUTH_PROVIDER=google_oidc \
  --build-arg VITE_CONFIG_PROVIDER=gcp_secret_manager \
  --build-arg VITE_DB_PROVIDER=postgresql \
  --build-arg VITE_STORAGE_PROVIDER=gcs \
  --build-arg VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  --build-arg VITE_GOOGLE_REDIRECT_URI="https://www.${DOMAIN_NAME}/auth/callback" \
  --build-arg VITE_ENFORCE_HTTPS=true \
  --build-arg VITE_REQUIRE_SECURE_CONTEXT=true \
  "$REPO_ROOT"
docker push "$WEB_IMAGE"

echo "Planning complete runtime infrastructure..."
"$TERRAFORM" plan \
  -input=false \
  "${terraform_vars[@]}" \
  -out=deployment.tfplan
"$TERRAFORM" apply -input=false deployment.tfplan

# Terraform ignores container image changes on the Cloud Run services (the image
# tag is deployed out-of-band so CI can push without Terraform reverting it), so
# roll the freshly-built images onto the services explicitly.
echo "Deploying freshly-built images to Cloud Run..."
gcloud run services update "${NAME_PREFIX}-api" \
  --project="$PROJECT_ID" --region="$REGION" --image="$API_IMAGE" --quiet
gcloud run services update "${NAME_PREFIX}-web" \
  --project="$PROJECT_ID" --region="$REGION" --image="$WEB_IMAGE" --quiet

"$SCRIPT_DIR/validate-deployment.sh" "$ENVIRONMENT"

echo "GCP $ENVIRONMENT deployment completed and validated."
