output "vpc_network_id" {
  description = "VPC network self_link"
  value       = google_compute_network.main.self_link
}

output "vpc_network_name" {
  description = "VPC network name"
  value       = google_compute_network.main.name
}

output "subnet_id" {
  description = "Subnet self_link"
  value       = google_compute_subnetwork.main.self_link
}

output "dns_zone_name" {
  description = "DNS managed zone name"
  value       = google_dns_managed_zone.main.name
}

output "dns_name_servers" {
  description = "DNS zone name servers"
  value       = google_dns_managed_zone.main.name_servers
}
