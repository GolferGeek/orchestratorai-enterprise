resource "google_vertex_ai_endpoint" "main" {
  name         = "${var.name_prefix}-endpoint"
  display_name = "${var.name_prefix}-endpoint"
  description  = "Vertex AI endpoint for Orchestrator AI (${var.environment})"
  location     = var.region

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }
}

# Model deployments to this endpoint are managed via gcloud CLI or the
# Vertex AI API, not Terraform. Example deployment command:
#
#   gcloud ai endpoints deploy-model ENDPOINT_ID \
#     --region=us-central1 \
#     --model=MODEL_ID \
#     --display-name="model-deployment" \
#     --machine-type=n1-standard-4 \
#     --min-replica-count=1 \
#     --max-replica-count=3
