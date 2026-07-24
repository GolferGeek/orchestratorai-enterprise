# GCP Terraform — OrchestratorAI Enterprise monolith

Provisions the Google Cloud stack for the unified platform:

- **API** Cloud Run service (`orchestrator-ai-{env}-api`)
- **Web** Cloud Run service (`orchestrator-ai-{env}-web`)
- Cloud SQL PostgreSQL, GCS buckets, Secret Manager, Artifact Registry
- Networking / DNS CNAMEs for `api.{domain}` and `www.{domain}`

## Quick start

```bash
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars   # fill project_id + db_password
# edit dev.tfvars / prod.tfvars for domain + sizing

terraform init
terraform plan  -var-file=dev.tfvars -var-file=terraform.tfvars
terraform apply -var-file=dev.tfvars -var-file=terraform.tfvars

# Build images, push, migrate, validate:
./scripts/bootstrap-customer.sh dev
./scripts/validate-deployment.sh dev
```

Or from the repo root:

```bash
npm run terraform:gcp:plan -- -var-file=dev.tfvars -var-file=terraform.tfvars
npm run deploy:gcp:bootstrap -- dev
```

## Required runtime env (set by Terraform on the API service)

| Variable | Purpose |
|---|---|
| `PLATFORM_API_PORT=8080` | Nest listen port (Cloud Run container port) |
| `PLATFORM_API_URL` | AuthClient self-calls — defaults to `https://api.{domain}` |
| `PUBLIC_API_URL` | Public API origin |
| `LLM_PROVIDER=openrouter` | Matches `.env.gcp.example` |
| `OBSERVABILITY_PROVIDER=database_events` | |
| `WORK_PROVIDER=slack` | |

Populate Secret Manager after apply (`PLACEHOLDER_REPLACE_ME` versions are ignored by Terraform after first write):

- `{prefix}-openrouter-api-key`
- `{prefix}-jwt-secret`
- `{prefix}-google-client-secret`
- `{prefix}-slack-bot-token` / `{prefix}-slack-signing-secret` (when Slack is enabled)

## Images

| Image | Dockerfile | Listen |
|---|---|---|
| `orchestratorai-api` | `docker/nest-api.Dockerfile` | 8080 via `PLATFORM_API_PORT` |
| `orchestratorai-web` | `docker/vite-web.Dockerfile` + `docker/nginx-platform-web.cloudrun.conf` | 8080 |

Cloud Build configs: `infra/pipelines/gcp/`.
