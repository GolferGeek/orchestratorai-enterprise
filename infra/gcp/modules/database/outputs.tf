output "connection_name" {
  description = "Cloud SQL instance connection name for Cloud Run"
  value       = google_sql_database_instance.main.connection_name
}

output "instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.main.name
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.orchestrator_ai.name
}

output "private_ip" {
  description = "Private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.main.private_ip_address
}

output "public_ip" {
  description = "Public IP address of the Cloud SQL instance (dev only)"
  value       = google_sql_database_instance.main.public_ip_address
}
