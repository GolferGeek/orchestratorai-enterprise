# ---------- VPC Network ----------

resource "google_compute_network" "main" {
  name                    = "${var.name_prefix}-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id
}

resource "google_compute_subnetwork" "main" {
  name          = "${var.name_prefix}-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.main.id
  project       = var.project_id
}

# ---------- VPC Peering for Cloud SQL Private IP ----------

resource "google_compute_global_address" "private_ip_range" {
  name          = "${var.name_prefix}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
  project       = var.project_id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# ---------- DNS Zone ----------

resource "google_dns_managed_zone" "main" {
  name        = "${var.name_prefix}-zone"
  dns_name    = "${var.domain_name}."
  description = "DNS zone for Orchestrator AI (${var.environment})"
  project     = var.project_id
}

# DNS records pointing to Cloud Run services.
# These use CNAME records to ghs.googlehosted.com which is required
# for Cloud Run custom domain mappings.
# For production, consider a Global External HTTP(S) Load Balancer
# with Google-managed SSL certificates.

resource "google_dns_record_set" "api" {
  name         = "api.${google_dns_managed_zone.main.dns_name}"
  type         = "CNAME"
  ttl          = 300
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  rrdatas      = ["ghs.googlehosted.com."]
}

# Zone apex cannot use CNAME. Use "www" subdomain for web.
# For bare domain, configure a redirect or use a load balancer with A record.
resource "google_dns_record_set" "web" {
  name         = "www.${google_dns_managed_zone.main.dns_name}"
  type         = "CNAME"
  ttl          = 300
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  rrdatas      = ["ghs.googlehosted.com."]
}
