# Platform Monolith Consolidation — Production Checklist

**Last updated**: 2026-07-16

## Spark Runtime

- Repo: `/home/golfergeek/projects/orchestratorai-enterprise-platform`
- Deploy command: `CF_PUBLIC_URL=https://orchestratorai.io CF_LOCAL_PORT=7777 npm run deploy:spark`
- Public health: `https://orchestratorai.io/api/health`
- Local Spark gateway origin: `http://localhost:7777`
- Native Spark Cloudflare config: `/home/golfergeek/.cloudflared/config-orchestratorai.yml`

The Spark deployment uses one Cloudflare endpoint that forwards to nginx, which then routes `/api/*` to `platform-api:6700` and all web routes to `platform-web:6701`.

## Required Env

- `CF_PUBLIC_URL=https://orchestratorai.io`
- `CF_LOCAL_PORT=7777`
- `PLATFORM_API_URL=http://platform-api:6700` (set automatically by `deploy:spark` / `docker-compose.cloudflare.yml`; AuthClient will not start without it)
- `PUBLIC_API_URL` (set from `CF_PUBLIC_URL` by the Cloudflare compose overlay)
- `DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:6011/postgres`
- `SUPABASE_URL=http://host.docker.internal:6010`
- `OLLAMA_BASE_URL=http://100.120.203.62:11434`
- Login credentials are never embedded in the frontend build.

Do not replace the demo password with an ad hoc value. The seed data and demo docs expect `DemoUser123!`.

## Database

- Apply Supabase migrations before deploy verification.
- Current demo data restore source: `supabase/backups/archive/20260716T193045Z/local-source-54322-full-noclean.sql.gz`
- Spark pre-restore archive: `/home/golfergeek/db-archives/20260716T193101Z/spark-before-restore-full.sql.gz`

## Provider Catalog

- Active commercial text providers: Anthropic (`claude-sonnet-4-6`), OpenAI (`gpt-4o`), xAI (`grok-3`).
- Active local models are the Spark Ollama models kept in `public.llm_models`.
- Google Gemini is retained but inactive because the deployed key returned `API_KEY_INVALID`.
- Sora video is retained but inactive until a client configures Sora-capable OpenAI video access.

## Verification

- `npm run lint -- --max-warnings=0`
- `npm run build`
- `npm test`
- `npm run audit:accepted`
- Browser route sweep on `https://orchestratorai.io`:
  - `/`
  - `/login`
  - `/app/dashboard`
  - `/app/admin/users`
  - `/app/agents`
  - `/app/rag/collections`
  - `/app/workflows/marketing-swarm`
  - `/app/ambient`
  - `/app/secure-conversations/settings`
