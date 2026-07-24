output "endpoint_id" {
  description = "Vertex AI endpoint ID"
  value       = google_vertex_ai_endpoint.main.id
}

output "endpoint_name" {
  description = "Vertex AI endpoint display name"
  value       = google_vertex_ai_endpoint.main.display_name
}
