locals {
  name_prefix = "orchestrator-ai-${var.environment}"
}

module "project_setup" {
  source = "./modules/project-setup"

  project_id = var.project_id
}

module "networking" {
  source = "./modules/networking"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  domain_name = var.domain_name
  name_prefix = local.name_prefix

  depends_on = [module.project_setup]
}

module "identity" {
  source = "./modules/identity"

  project_id  = var.project_id
  environment = var.environment
  name_prefix = local.name_prefix

  depends_on = [module.project_setup]
}

module "artifact_registry" {
  source = "./modules/artifact-registry"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  name_prefix = local.name_prefix

  depends_on = [module.project_setup]
}

module "secret_manager" {
  source = "./modules/secret-manager"

  project_id         = var.project_id
  environment        = var.environment
  name_prefix        = local.name_prefix
  secret_ids         = var.secret_ids
  cloud_run_sa_email = module.identity.api_service_account_email

  depends_on = [module.project_setup, module.identity]
}

module "database" {
  source = "./modules/database"

  project_id     = var.project_id
  region         = var.region
  environment    = var.environment
  name_prefix    = local.name_prefix
  db_tier        = var.db_tier
  db_password    = var.db_password
  vpc_network_id = var.environment == "prod" ? module.networking.vpc_network_id : null

  depends_on = [module.project_setup, module.networking]
}

module "storage" {
  source = "./modules/storage"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  name_prefix = local.name_prefix
  domain_name = var.domain_name

  depends_on = [module.project_setup]
}

module "cloud_run" {
  source = "./modules/cloud-run"

  project_id            = var.project_id
  region                = var.region
  environment           = var.environment
  name_prefix           = local.name_prefix
  domain_name           = var.domain_name
  min_instances         = var.cloud_run_min_instances
  max_instances         = var.cloud_run_max_instances
  api_cpu               = var.api_cpu
  api_memory            = var.api_memory
  web_cpu               = var.web_cpu
  web_memory            = var.web_memory
  api_service_account   = module.identity.api_service_account_email
  web_service_account   = module.identity.web_service_account_email
  artifact_registry_url = module.artifact_registry.repository_url
  db_connection_name    = module.database.connection_name
  secret_ids            = module.secret_manager.secret_ids_map
  gcs_bucket_media      = module.storage.media_bucket_name
  gcs_bucket_legal      = module.storage.legal_bucket_name
  google_client_id      = var.google_client_id
  embedding_model       = var.embedding_model
  platform_api_url      = var.platform_api_url
  public_api_url        = var.public_api_url
  cors_origins          = var.cors_origins
  work_provider         = var.work_provider

  depends_on = [
    module.project_setup,
    module.identity,
    module.artifact_registry,
    module.database,
    module.secret_manager,
  ]
}
