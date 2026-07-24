variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix"
  type        = string
}

variable "domain_name" {
  description = "Public application domain (e.g. orchestratorai.io). API is api.{domain}."
  type        = string
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
}

variable "api_cpu" {
  description = "CPU allocation for API service"
  type        = string
}

variable "api_memory" {
  description = "Memory allocation for API service"
  type        = string
}

variable "web_cpu" {
  description = "CPU allocation for Web service"
  type        = string
}

variable "web_memory" {
  description = "Memory allocation for Web service"
  type        = string
}

variable "api_service_account" {
  description = "Service account email for API Cloud Run service"
  type        = string
}

variable "web_service_account" {
  description = "Service account email for Web Cloud Run service"
  type        = string
}

variable "artifact_registry_url" {
  description = "URL of the Artifact Registry repository"
  type        = string
}

variable "db_connection_name" {
  description = "Cloud SQL instance connection name"
  type        = string
}

variable "secret_ids" {
  description = "Map of secret name to secret resource ID for env injection"
  type        = map(string)
}

variable "gcs_bucket_media" {
  description = "GCS bucket name for media storage"
  type        = string
}

variable "gcs_bucket_legal" {
  description = "GCS bucket name for legal storage"
  type        = string
}

variable "db_password" {
  description = "Database password for the application user"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID for google_oidc auth"
  type        = string
  default     = ""
}

variable "embedding_model" {
  description = "Default embedding model for legacy callers (collections specify their own model)"
  type        = string
  default     = "nomic-embed-text"
}

variable "platform_api_url" {
  description = "Public HTTPS origin of the platform API (AuthClient). Empty = https://api.{domain_name}."
  type        = string
  default     = ""
}

variable "public_api_url" {
  description = "Public HTTPS API origin advertised to clients. Empty = platform_api_url."
  type        = string
  default     = ""
}

variable "cors_origins" {
  description = "Comma-separated CORS origins. Empty = https://www.{domain_name},https://{domain_name}."
  type        = string
  default     = ""
}

variable "openrouter_site_url" {
  description = "OpenRouter site URL attribution. Empty = https://www.{domain_name}."
  type        = string
  default     = ""
}

variable "openrouter_auto_allowed_models" {
  description = "JSON array of OpenRouter model allowlist globs"
  type        = string
  default     = "[\"anthropic/*\",\"openai/*\",\"google/*\",\"deepseek/*\"]"
}
