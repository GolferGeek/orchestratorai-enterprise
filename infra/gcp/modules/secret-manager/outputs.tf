output "secret_ids_map" {
  description = "Map of secret name to fully qualified secret ID"
  value = {
    for key, secret in google_secret_manager_secret.secrets :
    key => secret.secret_id
  }
}

output "secret_names" {
  description = "List of created secret names"
  value       = [for secret in google_secret_manager_secret.secrets : secret.secret_id]
}
