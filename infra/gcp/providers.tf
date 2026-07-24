terraform {
  backend "gcs" {
    # Create this bucket once before first init, or pass -backend-config.
    bucket = "orchestrator-ai-tfstate"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
