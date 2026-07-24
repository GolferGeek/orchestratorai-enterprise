output "media_bucket_name" {
  description = "Name of the media storage bucket"
  value       = google_storage_bucket.media.name
}

output "legal_bucket_name" {
  description = "Name of the legal storage bucket"
  value       = google_storage_bucket.legal.name
}

output "media_bucket_url" {
  description = "URL of the media storage bucket"
  value       = google_storage_bucket.media.url
}

output "legal_bucket_url" {
  description = "URL of the legal storage bucket"
  value       = google_storage_bucket.legal.url
}
