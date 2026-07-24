output "api_service_account_email" {
  description = "Email of the API Cloud Run service account"
  value       = google_service_account.cloud_run_api.email
}

output "web_service_account_email" {
  description = "Email of the Web Cloud Run service account"
  value       = google_service_account.cloud_run_web.email
}

output "api_service_account_id" {
  description = "Fully qualified ID of the API service account"
  value       = google_service_account.cloud_run_api.id
}

output "web_service_account_id" {
  description = "Fully qualified ID of the Web service account"
  value       = google_service_account.cloud_run_web.id
}
