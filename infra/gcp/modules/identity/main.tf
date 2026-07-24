resource "google_service_account" "cloud_run_api" {
  account_id   = "${var.name_prefix}-api-sa"
  display_name = "Cloud Run API Service Account (${var.environment})"
  project      = var.project_id
}

resource "google_service_account" "cloud_run_web" {
  account_id   = "${var.name_prefix}-web-sa"
  display_name = "Cloud Run Web Service Account (${var.environment})"
  project      = var.project_id
}

# API SA: Secret Manager accessor
resource "google_project_iam_member" "api_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

# API SA: Cloud SQL client
resource "google_project_iam_member" "api_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

# API SA: Storage object admin
resource "google_project_iam_member" "api_storage_admin" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

# API SA: Artifact Registry reader
resource "google_project_iam_member" "api_artifact_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

# Web SA: Artifact Registry reader
resource "google_project_iam_member" "web_artifact_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.cloud_run_web.email}"
}
