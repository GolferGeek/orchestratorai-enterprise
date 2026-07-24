# Google Cloud deployment

This stack deploys the unified API and web modules to Cloud Run with:

- Cloud SQL PostgreSQL 15 and pgvector
- GCS media and legal buckets
- Secret Manager
- Artifact Registry
- Google OIDC
- OpenRouter as the LLM plane
- Cloud DNS and Cloud Run custom domain mappings

Video generation is intentionally disabled for the first deployment in both
the runtime configuration and the seeded agent catalog.

## Prerequisites

- Docker
- Google Cloud SDK
- PostgreSQL client tools
- `jq` and `rg`
- A Google Cloud project with billing enabled
- A verified domain for Cloud Run domain mappings

Authenticate both the Google Cloud CLI and Terraform:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project orchestrator-ai-467421
```

Terraform runs from the pinned `hashicorp/terraform:1.9.8` container through
`scripts/terraform.sh`; a workstation Terraform installation is not required.

## Configuration

Non-secret environment values live in `dev.tfvars` and `prod.tfvars`.

The deployment reads secrets from the ignored root `.env.secrets` file by
default. Set `GCP_SECRETS_FILE` to use a different ignored file. These values
are required:

```dotenv
OPENROUTER_API_KEY=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=...
DB_PASSWORD=...
POSTGRES_PASSWORD=...
```

`DB_PASSWORD` belongs to the `orchestrator_app` database role.
`POSTGRES_PASSWORD` belongs to the Cloud SQL administrator role.

## Validate migrations locally

The Cloud SQL baseline contains schema and configuration/reference data only.
It excludes conversations, documents, usage logs, and automation history.

```bash
npm run test:gcp:migrations
```

The test restores the baseline into isolated PostgreSQL 15, applies every
Cloud SQL-compatible migration strictly, and runs the sequence twice to prove
that recorded migrations are not replayed.

The Supabase demo-login migration is explicitly excluded because this profile
uses Google OIDC. Exclusions are declared in
`database/cloud-sql-excluded-migrations.txt`.

## Plan

```bash
npm run deploy:gcp:bootstrap -- dev plan
```

Plan mode never creates infrastructure. The secured Terraform state bucket
must already exist.

## Deploy

```bash
npm run deploy:gcp:bootstrap -- dev apply
```

The apply workflow is deliberately ordered:

1. Create or verify the versioned, access-protected Terraform state bucket.
2. Apply foundational APIs, networking, IAM, Artifact Registry, Secret
   Manager containers, Cloud SQL, and GCS.
3. Populate real secret versions.
4. Run the canonical baseline and migrations through Cloud SQL Auth Proxy.
5. Build and push the API and web images.
6. Plan and apply Cloud Run plus custom domain mappings.
7. Run fail-closed deployment validation.

Any failed migration, image update, secret check, health check, or domain check
terminates the deployment with a non-zero exit status.

## First-deployment provider profile

| Plane | Provider |
|---|---|
| Database | `postgresql` |
| RAG | `postgresql` |
| Storage | `gcs` |
| Auth | `google_oidc` |
| Config | `gcp_secret_manager` |
| LLM | `openrouter` |
| Observability | `database_events` |
| Work routing | `flow` |

Slack remains an available work-routing implementation but is not selected for
the first deployment because it requires separate workspace and channel
configuration.
