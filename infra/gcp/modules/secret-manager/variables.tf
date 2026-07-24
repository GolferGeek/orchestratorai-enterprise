variable "project_id" {
  description = "GCP project ID"
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

variable "secret_ids" {
  description = "List of secret IDs to create"
  type        = list(string)
}

variable "cloud_run_sa_email" {
  description = "Cloud Run API service account email for IAM binding"
  type        = string
}
