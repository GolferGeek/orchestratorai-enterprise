resource "google_sql_database_instance" "main" {
  name             = "${var.name_prefix}-pg"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true

    # pgvector extension is available by default on Cloud SQL PostgreSQL 15+.
    # Install it in SQL with: CREATE EXTENSION IF NOT EXISTS vector;

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.environment == "prod"
      start_time                     = "03:00"
      transaction_log_retention_days = var.environment == "prod" ? 7 : 1

      backup_retention_settings {
        retained_backups = var.environment == "prod" ? 30 : 7
      }
    }

    ip_configuration {
      ipv4_enabled = var.environment == "dev"

      dynamic "authorized_networks" {
        for_each = var.environment == "dev" ? [1] : []
        content {
          name  = "allow-all-dev"
          value = "0.0.0.0/0"
        }
      }

      private_network = var.vpc_network_id
    }

    insights_config {
      query_insights_enabled  = var.environment == "prod"
      record_application_tags = var.environment == "prod"
      record_client_address   = var.environment == "prod"
    }
  }

  deletion_protection = var.environment == "prod"
}

resource "google_sql_database" "orchestrator_ai" {
  name     = "orchestrator_ai"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app" {
  name     = "orchestrator_app"
  instance = google_sql_database_instance.main.name
  password = var.db_password
}
