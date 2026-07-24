variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be 'dev' or 'prod'."
  }
}

variable "domain_name" {
  description = "Custom domain name for the application"
  type        = string
}

variable "db_password" {
  description = "Database password for the application user"
  type        = string
  sensitive   = true
}

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-f1-micro"
}

variable "cloud_run_min_instances" {
  description = "Minimum Cloud Run instances"
  type        = number
  default     = 0
}

variable "cloud_run_max_instances" {
  description = "Maximum Cloud Run instances"
  type        = number
  default     = 5
}

variable "api_cpu" {
  description = "CPU allocation for API Cloud Run service"
  type        = string
  default     = "1"
}

variable "api_memory" {
  description = "Memory allocation for API Cloud Run service"
  type        = string
  default     = "512Mi"
}

variable "web_cpu" {
  description = "CPU allocation for Web Cloud Run service"
  type        = string
  default     = "1"
}

variable "web_memory" {
  description = "Memory allocation for Web Cloud Run service"
  type        = string
  default     = "256Mi"
}

variable "google_client_id" {
  description = "Google OAuth client ID for google_oidc auth provider"
  type        = string
  default     = ""
}

variable "embedding_model" {
  description = "Default embedding model for legacy callers (collections specify their own model)"
  type        = string
  default     = "text-embedding-3-small"
}

variable "secret_ids" {
  description = "Secret IDs for Secret Manager. Names map to Cloud Run env vars via upper(replace(name, '-', '_'))."
  type        = list(string)
  default = [
    # Auth (google_oidc)
    "google-client-secret",
    # LLM (openrouter)
    "openrouter-api-key",
    # JWT signing
    "jwt-secret",
    # One connection URL is injected under all database plane env names.
    "database-url",
  ]
}

variable "work_provider" {
  description = "Work-routing plane provider"
  type        = string
  default     = "flow"

  validation {
    condition     = contains(["flow", "slack", "ado"], var.work_provider)
    error_message = "work_provider must be 'flow', 'slack', or 'ado'."
  }
}

variable "platform_api_url" {
  description = "Public HTTPS origin of the platform API. Empty defaults to https://api.{domain_name}."
  type        = string
  default     = ""
}

variable "public_api_url" {
  description = "Public HTTPS API origin advertised to clients. Empty defaults to platform_api_url."
  type        = string
  default     = ""
}

variable "cors_origins" {
  description = "Comma-separated CORS origins. Empty defaults to https://www.{domain_name},https://{domain_name}."
  type        = string
  default     = ""
}
