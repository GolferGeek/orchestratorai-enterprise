# ---------- API Service (Nest platform API) ----------

locals {
  derived_api_url             = var.platform_api_url != "" ? var.platform_api_url : "https://api.${var.domain_name}"
  derived_public_api_url      = var.public_api_url != "" ? var.public_api_url : local.derived_api_url
  derived_cors_origins        = var.cors_origins != "" ? var.cors_origins : "https://www.${var.domain_name},https://${var.domain_name}"
  derived_openrouter_site_url = var.openrouter_site_url != "" ? var.openrouter_site_url : "https://www.${var.domain_name}"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "${var.name_prefix}-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.api_service_account

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.db_connection_name]
      }
    }

    containers {
      # Image tags are managed by Cloud Build / deploy scripts.
      image = "${var.artifact_registry_url}/orchestratorai-api:${var.environment}"

      ports {
        # Nest listens on PLATFORM_API_PORT (see env below).
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.api_cpu
          memory = var.api_memory
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PLATFORM_API_PORT"
        value = "8080"
      }

      env {
        name  = "PLATFORM_API_URL"
        value = local.derived_api_url
      }

      env {
        name  = "PUBLIC_API_URL"
        value = local.derived_public_api_url
      }

      env {
        name  = "CORS_ORIGINS"
        value = local.derived_cors_origins
      }

      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      # Provider plane selectors — must match .env.gcp.example
      env {
        name  = "AUTH_PROVIDER"
        value = "google_oidc"
      }

      env {
        name  = "CONFIG_PROVIDER"
        value = "gcp_secret_manager"
      }

      env {
        name  = "DB_PROVIDER"
        value = "postgresql"
      }

      env {
        name  = "RAG_PROVIDER"
        value = "postgresql"
      }

      env {
        name  = "STORAGE_PROVIDER"
        value = "gcs"
      }

      env {
        name  = "LLM_PROVIDER"
        value = "openrouter"
      }

      env {
        name  = "OBSERVABILITY_PROVIDER"
        value = "database_events"
      }

      env {
        name  = "WORK_PROVIDER"
        value = var.work_provider
      }

      env {
        name  = "KNOWLEDGE_PROVIDER"
        value = "none"
      }

      env {
        name  = "EMBEDDING_MODEL"
        value = var.embedding_model
      }

      # Database connection via the Cloud SQL connector (unix socket). The
      # complete URL remains in Secret Manager and never appears in a revision.
      env {
        name = "POSTGRESQL_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["database-url"]
            version = "latest"
          }
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["database-url"]
            version = "latest"
          }
        }
      }

      env {
        name = "RAG_POSTGRESQL_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["database-url"]
            version = "latest"
          }
        }
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCP_REGION"
        value = var.region
      }

      env {
        name  = "GCS_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCS_BUCKET_MEDIA"
        value = var.gcs_bucket_media
      }

      env {
        name  = "GCS_BUCKET_LEGAL"
        value = var.gcs_bucket_legal
      }

      env {
        name  = "MEDIA_STORAGE_BUCKET"
        value = var.gcs_bucket_media
      }

      env {
        name  = "ASSET_FETCH_EXTERNAL"
        value = "false"
      }

      env {
        name  = "ASSET_FETCH_MAX_BYTES"
        value = "26214400"
      }

      env {
        name  = "ASSET_EXTERNAL_STRATEGY"
        value = "redirect"
      }

      env {
        name  = "OPENROUTER_SITE_URL"
        value = local.derived_openrouter_site_url
      }

      env {
        name  = "OPENROUTER_SITE_NAME"
        value = "OrchestratorAI"
      }

      env {
        name  = "OPENROUTER_AUTO_ALLOWED_MODELS"
        value = var.openrouter_auto_allowed_models
      }

      env {
        name  = "OPENROUTER_AUTO_COST_QUALITY_TRADEOFF"
        value = "3"
      }

      env {
        name  = "OPENROUTER_VIDEO_ENABLED"
        value = "false"
      }

      env {
        name  = "OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED"
        value = "false"
      }

      # Auth (google_oidc) — non-secret config
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }

      env {
        name  = "GOOGLE_ISSUER_URL"
        value = "https://accounts.google.com"
      }

      env {
        name  = "GOOGLE_JWKS_URI"
        value = "https://www.googleapis.com/oauth2/v3/certs"
      }

      # Secrets injected from Secret Manager
      # Secret names use hyphens; env vars use UPPER_SNAKE (e.g. openrouter-api-key → OPENROUTER_API_KEY).
      dynamic "env" {
        for_each = {
          for key, value in var.secret_ids : key => value
          if key != "database-url"
        }
        content {
          name = upper(replace(env.key, "-", "_"))
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# ---------- Web Service (static SPA) ----------

resource "google_cloud_run_v2_service" "web" {
  name     = "${var.name_prefix}-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.web_service_account

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = "${var.artifact_registry_url}/orchestratorai-web:${var.environment}"

      ports {
        # docker/nginx-platform-web.cloudrun.conf listens on 8080
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.web_cpu
          memory = var.web_memory
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      # Host of the API service, used by the nginx /api same-origin proxy in
      # docker/nginx-platform-web.cloudrun.conf. The web build sets
      # VITE_API_BASE_URL=/api so the browser stays on one origin (no CORS).
      env {
        name  = "PLATFORM_API_ORIGIN"
        value = trimprefix(google_cloud_run_v2_service.api.uri, "https://")
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# ---------- Public access IAM ----------

resource "google_cloud_run_service_iam_member" "api_public" {
  location = google_cloud_run_v2_service.api.location
  service  = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"

  lifecycle {
    replace_triggered_by = [google_cloud_run_v2_service.api.id]
  }
}

resource "google_cloud_run_service_iam_member" "web_public" {
  location = google_cloud_run_v2_service.web.location
  service  = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"

  lifecycle {
    replace_triggered_by = [google_cloud_run_v2_service.web.id]
  }
}

# ---------- Custom domain mappings ----------

resource "google_cloud_run_domain_mapping" "api" {
  location = var.region
  name     = "api.${var.domain_name}"

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.api.name
  }
}

resource "google_cloud_run_domain_mapping" "web" {
  location = var.region
  name     = "www.${var.domain_name}"

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.web.name
  }
}
