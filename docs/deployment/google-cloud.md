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

---

# Runbook — issues we hit and where each fix lives

Everything above is the happy path. This section is the reality: what actually
broke bringing up the Cloud SQL + OpenRouter profile on `dev.orchestratorai.io`,
and — the part that matters most — **where each fix had to live**. See the
[folder README](./README.md) for why that column is the point.

## Issues we hit

| # | Symptom | Root cause | Fix location | Reference |
|---|---------|-----------|--------------|-----------|
| 1 | Login bounced straight back to the login page | The OIDC redirect callback route and handler did not exist in the web app | **Code** | `AuthCallbackPage.vue` + `/auth/callback` route (commit `e484e42`) |
| 2 | Org selector empty; `rbac_*` functions failed with `relation "..." does not exist` | RBAC SQL functions reference sibling-schema tables unqualified; the app DB role's `search_path` was just `public` | **Deploy (cannot fix in code)** — see below | `cloud-sql-post-migrate.sql` (commit `0025e51`) |
| 3 | API failed at startup: `must be owner of table checkpoint_blobs` | LangGraph runs `ALTER TABLE` on its checkpoint/store tables during `setup()`, which needs ownership, not just DML grants | **Deploy (cannot fix in code)** — see below | `cloud-sql-post-migrate.sql` (commit `dcaa1fc`) |
| 4 | Marketing Swarm failed instantly; agents had invalid providers (`ollama`, `xai`, `claude-sonnet-4-6`) | The shared baseline **seed data** targets the local multi-provider profile, not OpenRouter | **Deploy (cannot fix in code)** — see below | swarm normalization block in `cloud-sql-post-migrate.sql` (commit `a6d0c3c`) |
| 5 | Swarm's Claude writers/editors returned `404 No endpoints found matching your data policy` | OpenRouter client sent `require_parameters: true`; under `zdr: true` Claude's only ZDR endpoint (Amazon Bedrock) does not advertise `temperature`/`top_p`, so no endpoint matched | **Code** | dropped `require_parameters` (commit `ff07072`) — privacy unchanged (`zdr` + `data_collection: deny` still enforced) |
| 6 | Swarm appeared "stuck on waiting for edit"; progress moved in waves | `processWritingAndEditing` dispatched a batch then `await Promise.all`-ed the whole batch before refilling — a slot freed by a fast write idled until the slowest item finished. With every model on the cloud track, it looked like a hard write→edit barrier | **Code** | refilling worker pool (commit `f7ac39b`) |
| 7 | HR/RAG keyword search threw a `tsquery` syntax error on punctuation | The query was built from raw user tokens without sanitization | **Code** | sanitize tokens before `to_tsquery` (commit `f81edd2`) |
| 8 | RAG embedding dropdown listed Vertex/OpenAI models that do not work on OpenRouter | The picker was not scoped to the active provider profile | **Code** | dropdown limited to OpenRouter embedding models (commit `a50100d`) |
| 9 | New users could log in but had no permissions / no default role | JIT auto-provisioning did not assign a default role | **Code** | default new OIDC users to `viewer` on org `*` (commit `68ae6c4`) |
| 10 | Model picker overwhelming; some models not zero-data-retention | No allow-list; ZDR not enforced at selection time | **Env + code** | `OPENROUTER_AUTO_ALLOWED_MODELS` curated to ZDR-only models; client enforces `zdr: true` (commits `67ec3e3`, `fae184f`) |
| 11 | API container failed at startup: missing `KNOWLEDGE_PROVIDER` | Required provider selector not set on the service | **Terraform / env** | `KNOWLEDGE_PROVIDER=none` (commit `dcaa1fc`) |
| 12 | Cloud SQL Auth Proxy failed with `--gcloud-auth` (no `gcloud` in the proxy image) | Proxy needs ADC, not the gcloud helper | **Deploy script** | `--user 0:0` + `GOOGLE_APPLICATION_CREDENTIALS` (commit `88d77e6`) |
| 13 | Terraform did not receive `db_password`; state-bucket versioning check misfired | `TF_VAR_*` not forwarded into the Terraform Docker container; wrong `jq` paths | **Deploy script** | forward `-e TF_VAR_*`; fix `jq` paths (commit `71cc282`) |
| 14 | Deployed image never updated (Terraform kept pulling the old tag) | Terraform `ignore_changes = [image]` (image is managed out-of-band) | **Deploy script** | deploy fresh image via `gcloud run services update` (commit `dcaa1fc`) |
| 15 | CORS friction between web and API origins | Two separate origins | **Terraform** | same-origin nginx `/api` proxy via `PLATFORM_API_ORIGIN`; web built with `VITE_API_BASE_URL=/api` (commit `b6b06e7`) |

## Cannot be fixed in the codebase — handle at deploy

These recur on **every** new GCP instance because the application is correct but
depends on the environment being shaped a certain way. Do not try to "fix" these
in app code.

- **App DB role needs a cross-schema `search_path`.** Our RBAC and other SQL
  functions intentionally reference sibling-schema tables unqualified. The app
  role otherwise defaults to `public` and the functions fail at runtime. Deploy
  must run `ALTER ROLE orchestrator_app SET search_path = <all app schemas>`.
  → `infra/gcp/scripts/cloud-sql-post-migrate.sql`.
- **LangGraph checkpoint/store tables must be owned by the app role.** The
  runtime `ALTER`s them during `setup()`; DML grants are not enough. Deploy
  reassigns ownership after migrations. → same script.
- **Seed model configs must be normalized to the OpenRouter profile.** The
  shared baseline seed ships local/multi-provider model ids (`ollama`, `xai`,
  `claude-sonnet-4-6`) that do not resolve through OpenRouter. Deploy rewrites
  them (idempotent, table-guarded) to ZDR-capable OpenRouter ids. → same script.
- **The ZDR model allow-list is a per-deployment policy, not code.** Which
  models are permitted is environment configuration
  (`OPENROUTER_AUTO_ALLOWED_MODELS`); the client only *enforces* `zdr: true`.

## Scripts we added

All under `infra/gcp/scripts/` unless noted. Designed to be idempotent and safe
to re-run.

- **`cloud-sql-post-migrate.sql`** — the deploy-time reconciliation described
  above: grants, `search_path`, LangGraph table ownership, seed normalization.
- **`provision-admin.sh`** — grants `ADMIN_EMAIL` global `super-admin`; verifies
  `search_path`. Runs during bootstrap so the first login is usable.
- **`validate-deployment.sh`** — fail-closed post-deploy checks: web `/api/health`
  actually proxies API JSON, `/auth/callback` returns 200, token exchange rejects
  with "required". Fails the deploy if any check regresses.
- **`bootstrap-customer.sh`** — end-to-end: Terraform → build/push images →
  deploy → migrate → provision admin → validate.
- **`migrate-cloud-sql.sh` / `test-cloud-sql-migrations.sh`** — apply and
  dry-run-test migrations against Cloud SQL through the Auth Proxy.
- **`terraform.sh`** — runs pinned `hashicorp/terraform` in Docker and forwards
  `TF_VAR_*` into the container.
- **`scripts/ingest-law-documents-gcp.ts`** (repo root) — legal-document
  ingestion using OpenRouter embeddings against Cloud SQL via the proxy.

## Known architectural debt

- **The Marketing Swarm runs as a minutes-long job inside a single HTTP request**
  on scale-to-zero Cloud Run. It currently survives because the API service is
  configured `cpu-throttling=false` (CPU always allocated) with a 1800s request
  timeout, so background work continues after the response would otherwise idle
  the CPU. **This is a workaround, not a design.** If swarm runs grow or
  concurrency increases, move the job off the request path to a real queue
  (Cloud Tasks / Pub/Sub) with a worker. Flagged as the #1 debt from this effort.
- **Cold starts.** `min_instances = 0` means the first request after idle pays a
  container cold start. Acceptable for a dev/handout URL; set a floor for
  latency-sensitive production.

## Verification checklist

Run `npm run deploy:gcp:validate -- <env>` (wraps `validate-deployment.sh`).
Manually, a healthy environment passes:

1. `GET https://<web>/api/health` returns the **API's** health JSON (proxy works).
2. Google login completes and lands on the app (not back at `/auth/callback`).
3. The org selector is populated (proves `search_path` + RBAC functions).
4. A RAG collection lists and a keyword search returns without a `tsquery` error.
5. A Marketing Swarm run pipelines continuously (writes and edits interleave; no
   wave-stall) and every writer×editor combo reaches `approved`/ranked.
