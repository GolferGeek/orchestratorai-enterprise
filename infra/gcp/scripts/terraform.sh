#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
GCLOUD_CONFIG_DIR="${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}"
ADC_FILE="$GCLOUD_CONFIG_DIR/application_default_credentials.json"
TERRAFORM_IMAGE="hashicorp/terraform:1.9.8"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is required to run the pinned Terraform toolchain." >&2
  exit 1
fi
if [ ! -f "$ADC_FILE" ]; then
  echo "ERROR: Google Application Default Credentials are missing." >&2
  echo "Run: gcloud auth application-default login" >&2
  exit 1
fi

# Forward Terraform input variables (TF_VAR_*) into the container. The bootstrap
# exports secrets such as TF_VAR_db_password; without this they never reach Terraform.
tf_var_env_args=()
while IFS='=' read -r tf_var_name _; do
  tf_var_env_args+=(-e "$tf_var_name")
done < <(env | grep '^TF_VAR_' || true)

docker run \
  --rm \
  --interactive \
  -v "$INFRA_DIR:/workspace" \
  -v "$GCLOUD_CONFIG_DIR:/root/.config/gcloud:ro" \
  -w /workspace \
  -e GOOGLE_APPLICATION_CREDENTIALS=/root/.config/gcloud/application_default_credentials.json \
  ${tf_var_env_args[@]+"${tf_var_env_args[@]}"} \
  "$TERRAFORM_IMAGE" \
  "$@"
