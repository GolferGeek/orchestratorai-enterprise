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

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
}

variable "db_password" {
  description = "Database password for the application user"
  type        = string
  sensitive   = true
}

variable "vpc_network_id" {
  description = "VPC network self_link for private IP (null for dev/public)"
  type        = string
  default     = null
}
