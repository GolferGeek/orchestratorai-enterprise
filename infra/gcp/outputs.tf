output "api_cloud_run_url" {
  description = "URL of the API Cloud Run service"
  value       = module.cloud_run.api_url
}

output "web_cloud_run_url" {
  description = "URL of the Web Cloud Run service"
  value       = module.cloud_run.web_url
}

output "platform_api_url" {
  description = "Configured PLATFORM_API_URL (AuthClient). Defaults to https://api.{domain}."
  value       = var.platform_api_url != "" ? var.platform_api_url : "https://api.${var.domain_name}"
}

output "public_api_url" {
  description = "Configured PUBLIC_API_URL. Defaults to platform_api_url."
  value       = var.public_api_url != "" ? var.public_api_url : (var.platform_api_url != "" ? var.platform_api_url : "https://api.${var.domain_name}")
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name"
  value       = module.database.connection_name
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = module.artifact_registry.repository_url
}

output "media_bucket_name" {
  description = "Media storage bucket name"
  value       = module.storage.media_bucket_name
}

output "legal_bucket_name" {
  description = "Legal storage bucket name"
  value       = module.storage.legal_bucket_name
}

output "api_service_account_email" {
  description = "API Cloud Run service account email"
  value       = module.identity.api_service_account_email
}

output "web_service_account_email" {
  description = "Web Cloud Run service account email"
  value       = module.identity.web_service_account_email
}

output "database_name" {
  description = "Cloud SQL database name"
  value       = module.database.database_name
}

output "vertex_ai_endpoint_id" {
  description = "Vertex AI endpoint ID (optional; LLM traffic uses OpenRouter)"
  value       = module.vertex_ai.endpoint_id
}
