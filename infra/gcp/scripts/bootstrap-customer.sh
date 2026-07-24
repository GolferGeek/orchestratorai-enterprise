#!/usr/bin/env bash
# bootstrap-customer.sh - Stand up GCP environment for a new customer
#
# Usage: ./bootstrap-customer.sh <environment> [tfvars-file]
# Example: ./bootstrap-customer.sh dev dev.tfvars
#
# Prerequisites: gcloud, terraform, docker, psql
# Run from infra/gcp/ or the script resolves the path automatically.
#
# chmod +x bootstrap-customer.sh

set -euo pipefail

ENV="${1:?Usage: $0 <environment> (dev|prod) [tfvars-file]}"
TFVARS="${2:-${ENV}.tfvars}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$INFRA_DIR/../.." && pwd)"

echo "============================================"
echo " OrchestratorAI - GCP Bootstrap"
echo " Environment: $ENV"
echo " Tfvars:      $TFVARS"
echo " Timestamp:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "============================================"
echo ""

# ── Step 1: Prerequisites ──
echo "Step 1: Checking prerequisites..."
MISSING=()
command -v gcloud    >/dev/null 2>&1 || MISSING+=("gcloud (Google Cloud SDK)")
command -v terraform >/dev/null 2>&1 || MISSING+=("terraform")
command -v docker    >/dev/null 2>&1 || MISSING+=("docker")
command -v psql      >/dev/null 2>&1 || MISSING+=("psql (PostgreSQL client)")

if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "ERROR: Missing required tools:"
  for m in "${MISSING[@]}"; do
    echo "  - $m"
  done
  echo ""
  echo "Install them and try again."
  exit 1
fi

# Verify gcloud auth
if ! gcloud auth print-access-token > /dev/null 2>&1; then
  echo "ERROR: Not authenticated with gcloud. Run: gcloud auth login"
  exit 1
fi
echo "  gcloud:    $(gcloud version 2>/dev/null | head -1 | awk '{print $4}')"
echo "  terraform: $(terraform version -json | python3 -c 'import sys,json; print(json.load(sys.stdin)["terraform_version"])' 2>/dev/null || terraform version | head -1)"
echo "  docker:    $(docker --version | cut -d' ' -f3 | tr -d ',')"
echo "  psql:      $(psql --version | head -1)"
echo ""

# ── Step 2: Terraform ──
echo "Step 2: Initializing Terraform..."
cd "$INFRA_DIR"

if [ ! -f "$TFVARS" ]; then
  echo "ERROR: Tfvars file not found: $INFRA_DIR/$TFVARS"
  echo "Available tfvars files:"
  ls -1 *.tfvars 2>/dev/null || echo "  (none)"
  exit 1
fi

terraform init -upgrade

echo ""
echo "Planning infrastructure..."
terraform plan -var-file="$TFVARS" -out=tfplan

echo ""
echo "Applying infrastructure..."
terraform apply tfplan
rm -f tfplan

echo ""
echo "Reading outputs..."
AR_URL=$(terraform output -raw artifact_registry_url)
API_URL=$(terraform output -raw api_cloud_run_url)
WEB_URL=$(terraform output -raw web_cloud_run_url)
DB_NAME=$(terraform output -raw database_name)
SQL_CONN=$(terraform output -raw cloud_sql_connection_name)
PROJECT_ID=$(echo "$SQL_CONN" | cut -d: -f1)
REGION=$(echo "$SQL_CONN" | cut -d: -f2)

echo "  Project:    $PROJECT_ID"
echo "  Region:     $REGION"
echo "  API URL:    $API_URL"
echo "  Web URL:    $WEB_URL"
echo "  Registry:   $AR_URL"
echo "  Database:   $DB_NAME"
echo ""

# ── Step 3: Database Migration ──
echo "Step 3: Running PostgreSQL migration..."
echo ""

# For dev, Cloud SQL has a public IP with 0.0.0.0/0 allowed.
# Get the public IP of the Cloud SQL instance.
DB_IP=$(gcloud sql instances describe "$(echo "$SQL_CONN" | cut -d: -f3)" \
  --project="$PROJECT_ID" \
  --format='value(ipAddresses[0].ipAddress)' 2>/dev/null)

if [ -z "$DB_IP" ]; then
  echo "WARNING: Could not determine Cloud SQL public IP."
  echo "  For dev, ensure the instance has a public IP."
  echo "  For prod, use Cloud SQL Auth Proxy instead."
  echo ""
  echo "Skipping database migration. Run manually after bootstrap:"
  echo "  PGPASSWORD=\$DB_PASS psql -h <cloud-sql-ip> -U orchestrator_app -d $DB_NAME"
else
  echo "  Cloud SQL IP: $DB_IP"
  echo ""

  # Prompt for DB password if not set
  if [ -z "${TF_VAR_db_password:-}" ]; then
    echo -n "Enter database password (for orchestrator_app user): "
    read -rs DB_PASS
    echo ""
  else
    DB_PASS="$TF_VAR_db_password"
  fi

  # Prompt for postgres superuser password for bootstrap/post-migrate steps
  if [ -z "${POSTGRES_PASS:-}" ]; then
    echo -n "Enter postgres superuser password: "
    read -rs POSTGRES_PASS
    echo ""
  fi

  # Run Cloud SQL bootstrap (creates roles, auth.users stub) as postgres superuser
  echo "  Running Cloud SQL bootstrap..."
  PGPASSWORD="$POSTGRES_PASS" psql \
    "host=$DB_IP port=5432 dbname=$DB_NAME user=postgres sslmode=require" \
    -f "$SCRIPT_DIR/cloud-sql-bootstrap.sql" \
    --quiet 2>&1 || {
      echo "  WARNING: Bootstrap had errors (may be idempotent, continuing)"
    }
  echo ""

  # Run all Supabase migration files in order
  MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
  if [ ! -d "$MIGRATIONS_DIR" ]; then
    MIGRATIONS_DIR="$REPO_ROOT/apps/api/supabase/migrations"
  fi
  if [ -d "$MIGRATIONS_DIR" ]; then
    MIGRATION_COUNT=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l | tr -d ' ')
    echo "  Found $MIGRATION_COUNT migration files in $MIGRATIONS_DIR"
    echo ""

    SUCCESS=0
    FAIL=0
    for MIGRATION_FILE in "$MIGRATIONS_DIR"/*.sql; do
      MIGRATION_NAME=$(basename "$MIGRATION_FILE")
      PGPASSWORD="$POSTGRES_PASS" psql \
        "host=$DB_IP port=5432 dbname=$DB_NAME user=postgres sslmode=require" \
        -f "$MIGRATION_FILE" \
        --quiet 2>&1 >/dev/null && {
          SUCCESS=$((SUCCESS + 1))
        } || {
          FAIL=$((FAIL + 1))
          echo "  WARNING: $MIGRATION_NAME had errors (may be idempotent)"
        }
    done

    echo "  Migrations: $SUCCESS succeeded, $FAIL with warnings"
    echo ""

    # Run Cloud SQL post-migrate fixups (ensure authz.users, grants)
    echo "  Running Cloud SQL post-migration fixup..."
    PGPASSWORD="$POSTGRES_PASS" psql \
      "host=$DB_IP port=5432 dbname=$DB_NAME user=postgres sslmode=require" \
      -f "$SCRIPT_DIR/cloud-sql-post-migrate.sql" \
      --quiet 2>&1 || {
        echo "  WARNING: Post-migrate had errors (may be idempotent)"
      }

    echo ""
    echo "  Database migration complete."
  else
    echo "  WARNING: No migrations directory found at supabase/migrations"
    echo "  Skipping database migration."
  fi
fi
echo ""

# ── Step 4: Docker Build & Push ──
echo "Step 4: Building and pushing Docker images..."
echo ""

echo "Configuring Docker for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

cd "$REPO_ROOT"

# Prefer terraform-derived public API URL for AuthClient + web build args.
PLATFORM_API_PUBLIC_URL=$(terraform -chdir="$INFRA_DIR" output -raw api_cloud_run_url 2>/dev/null || echo "$API_URL")
DOMAIN_NAME=$(grep -E '^\s*domain_name\s*=' "$INFRA_DIR/$TFVARS" | sed 's/.*= *"\(.*\)"/\1/' || true)
if [ -n "$DOMAIN_NAME" ]; then
  PLATFORM_API_PUBLIC_URL="https://api.${DOMAIN_NAME}"
fi

echo "  Building API image (linux/amd64)..."
docker build --platform linux/amd64 \
  -t "${AR_URL}/orchestratorai-api:${ENV}" \
  -f docker/nest-api.Dockerfile \
  --build-arg TURBO_FILTER="@orchestratorai/platform-api" \
  --build-arg APP_DIR=apps/api \
  .
docker push "${AR_URL}/orchestratorai-api:${ENV}"

echo "  Building Web image (linux/amd64)..."

# Read Google Client ID from tfvars
GOOGLE_CLIENT_ID=$(grep 'google_client_id' "$INFRA_DIR/$TFVARS" | sed 's/.*= *"\(.*\)"/\1/')
if [ -z "$GOOGLE_CLIENT_ID" ]; then
  echo "  WARNING: google_client_id not found in $TFVARS"
fi

WEB_ORIGIN="${WEB_URL}"
if [ -n "$DOMAIN_NAME" ]; then
  WEB_ORIGIN="https://www.${DOMAIN_NAME}"
fi

docker build --platform linux/amd64 \
  -t "${AR_URL}/orchestratorai-web:${ENV}" \
  -f docker/vite-web.Dockerfile \
  --build-arg TURBO_FILTER="@orchestratorai/platform-web" \
  --build-arg APP_DIR=apps/web \
  --build-arg NGINX_CONF=docker/nginx-platform-web.cloudrun.conf \
  --build-arg VITE_API_BASE_URL="${PLATFORM_API_PUBLIC_URL}" \
  --build-arg VITE_MONOLITH_MODE="true" \
  --build-arg VITE_AUTH_PROVIDER="google_oidc" \
  --build-arg VITE_CONFIG_PROVIDER="gcp_secret_manager" \
  --build-arg VITE_DB_PROVIDER="postgresql" \
  --build-arg VITE_STORAGE_PROVIDER="gcs" \
  --build-arg VITE_GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID}" \
  --build-arg VITE_GOOGLE_REDIRECT_URI="${WEB_ORIGIN}/auth/callback" \
  --build-arg VITE_ENFORCE_HTTPS="true" \
  --build-arg VITE_REQUIRE_SECURE_CONTEXT="true" \
  .
docker push "${AR_URL}/orchestratorai-web:${ENV}"

# ── Step 5: Update Cloud Run to use new images ──
echo ""
echo "Step 5: Updating Cloud Run services..."
echo ""

INSTANCE_PREFIX="orchestrator-ai-${ENV}"

gcloud run services update "${INSTANCE_PREFIX}-api" \
  --region="$REGION" \
  --image="${AR_URL}/orchestratorai-api:${ENV}" \
  --quiet 2>/dev/null || echo "  Note: API service update may require manual revision."

gcloud run services update "${INSTANCE_PREFIX}-web" \
  --region="$REGION" \
  --image="${AR_URL}/orchestratorai-web:${ENV}" \
  --quiet 2>/dev/null || echo "  Note: Web service update may require manual revision."

# ── Step 6: Validate ──
echo ""
echo "Step 6: Running deployment validation..."
if [ -f "$SCRIPT_DIR/validate-deployment.sh" ]; then
  "$SCRIPT_DIR/validate-deployment.sh" "$ENV"
else
  echo "  Checking API health..."
  API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health" 2>/dev/null || echo "000")
  echo "  API health: HTTP $API_STATUS"

  echo "  Checking Web health..."
  WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${WEB_URL}" 2>/dev/null || echo "000")
  echo "  Web health: HTTP $WEB_STATUS"
fi

# ── Summary ──
echo ""
echo "============================================"
echo " Bootstrap Complete"
echo "============================================"
echo ""
echo "  Project:    $PROJECT_ID"
echo "  Region:     $REGION"
echo "  API URL:    $API_URL"
echo "  Web URL:    $WEB_URL"
echo "  Public API: $PLATFORM_API_PUBLIC_URL"
echo "  Registry:   $AR_URL"
echo "  Database:   $DB_NAME ($DB_IP)"
echo ""
echo "Next steps:"
echo "  1. Verify Cloud Run services are running: gcloud run services list"
echo "  2. Map custom domains api.{domain} and www.{domain} to Cloud Run"
echo "  3. Populate Secret Manager values (openrouter-api-key, jwt-secret, google-client-secret)"
echo "  4. Confirm PLATFORM_API_URL on the API service matches the public HTTPS origin"
echo ""
echo "Provider plane defaults for GCP (monolith):"
echo "  DB_PROVIDER=postgresql"
echo "  STORAGE_PROVIDER=gcs"
echo "  AUTH_PROVIDER=google_oidc"
echo "  CONFIG_PROVIDER=gcp_secret_manager"
echo "  RAG_PROVIDER=postgresql"
echo "  LLM_PROVIDER=openrouter"
echo "  OBSERVABILITY_PROVIDER=database_events"
echo "  WORK_PROVIDER=slack"
echo ""
