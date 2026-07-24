# Google Cloud deployment

The unified platform uses one API container and one web container. Google Cloud
deployment selects providers through configuration; product modules do not
contain Google Cloud infrastructure code. Terraform under `infra/gcp` provisions
both Cloud Run services plus Cloud SQL, GCS, Secret Manager, and Artifact
Registry.

## Terraform (recommended)

GCP infrastructure lives in `infra/gcp` (ported from the archived Azure/GCP
Terraform work and aligned to this monolith: one API + one web Cloud Run
service).

```bash
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars + dev.tfvars / prod.tfvars

npm run terraform:gcp:init
npm run terraform:gcp:plan -- -var-file=dev.tfvars -var-file=terraform.tfvars
npm run terraform:gcp:apply -- -var-file=dev.tfvars -var-file=terraform.tfvars

# Build/push images, run migrations, validate:
npm run deploy:gcp:bootstrap -- dev
npm run deploy:gcp:validate -- dev
```

Terraform sets `PLATFORM_API_URL` / `PUBLIC_API_URL` on the API service to
`https://api.{domain_name}` by default. Map those hostnames to Cloud Run after
apply (DNS CNAMEs are created by the networking module).

Cloud Build pipelines: `infra/pipelines/gcp/`.

## Provider profile

Copy `.env.gcp.example` to a secret deployment profile (`.env.gcp`) and replace
every placeholder. The API will not start without `PLATFORM_API_URL` — set it to
the public HTTPS origin of the platform API (typically the same value as
`PUBLIC_API_URL`). Inject that profile into the Cloud Run / GKE service
environment (or Secret Manager-backed env) before rolling out.

Validate it before building:

```bash
set -a
source .env.gcp
set +a
npm run verify:gcp-config
```

`verify:gcp-config` requires `PLATFORM_API_URL` and rejects placeholder hosts
such as `example.com`.

The supported Google Cloud stack is:

- Cloud SQL for PostgreSQL: `DB_PROVIDER=postgresql`
- PostgreSQL RAG storage: `RAG_PROVIDER=postgresql`
- Cloud Storage: `STORAGE_PROVIDER=gcs`
- OpenRouter: `LLM_PROVIDER=openrouter`
- Secret Manager: `CONFIG_PROVIDER=gcp_secret_manager`
- Google OIDC: `AUTH_PROVIDER=google_oidc`
- Database-backed observability: `OBSERVABILITY_PROVIDER=database_events`

## Database preparation

Apply the repository migrations to Cloud SQL before starting the API. The
`20260724120000_add_database_change_stream.sql` migration is required for
Ambient database triggers. The Cloud SQL application role must be able to:

- read and write the application schemas;
- execute `ambient.capture_database_change()`;
- create triggers on tables configured as Ambient database sources;
- connect with `LISTEN/NOTIFY`.

The API fails startup or subscription setup when these requirements are not
met; it does not disable database watchers.

## Workload identity

Use Application Default Credentials through the runtime service account. Grant
that service account only the required roles for Secret Manager and the
configured Cloud Storage buckets. Store `OPENROUTER_API_KEY` in Secret Manager;
do not bake credentials into either container.

OpenRouter text and image requests require zero-data-retention routing. Video
generation is opt-in because OpenRouter video is not eligible for zero data
retention. Keep `OPENROUTER_VIDEO_ENABLED=false` until that boundary is
accepted, then set it and `OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED` to `true`.

## Container build

The existing cloud-neutral Dockerfiles are used for Google Cloud:

```bash
docker build \
  -f docker/nest-api.Dockerfile \
  --build-arg TURBO_FILTER=@orchestratorai/platform-api \
  --build-arg APP_DIR=apps/api \
  -t orchestratorai-api .

docker build \
  -f docker/vite-web.Dockerfile \
  --build-arg TURBO_FILTER=@orchestratorai/platform-web \
  --build-arg APP_DIR=apps/web \
  --build-arg NGINX_CONF=docker/nginx-platform-web.conf \
  --build-arg VITE_API_BASE_URL=/api \
  --build-arg VITE_AUTH_PROVIDER=google_oidc \
  --build-arg VITE_DB_PROVIDER=postgresql \
  --build-arg VITE_STORAGE_PROVIDER=gcs \
  --build-arg VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
  --build-arg VITE_GOOGLE_REDIRECT_URI="$VITE_GOOGLE_REDIRECT_URI" \
  -t orchestratorai-web .
```

Run the API behind an HTTPS load balancer and route the web application's
`/api` path to it. Run migrations as a separate deployment job before rolling
out a new API revision.
