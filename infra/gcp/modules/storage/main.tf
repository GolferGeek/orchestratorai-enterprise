resource "google_storage_bucket" "media" {
  name          = "${var.name_prefix}-media"
  location      = var.region
  force_destroy = var.environment == "dev"

  uniform_bucket_level_access = true

  cors {
    origin          = ["https://${var.domain_name}"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["Content-Type", "Content-Disposition"]
    max_age_seconds = 3600
  }

  versioning {
    enabled = var.environment == "prod"
  }
}

resource "google_storage_bucket" "legal" {
  name          = "${var.name_prefix}-legal"
  location      = var.region
  force_destroy = var.environment == "dev"

  uniform_bucket_level_access = true

  cors {
    origin          = ["https://${var.domain_name}"]
    method          = ["GET", "HEAD", "PUT", "POST"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }
}
