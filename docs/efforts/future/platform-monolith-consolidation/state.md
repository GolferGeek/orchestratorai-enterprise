# Platform Monolith Consolidation — State Ledger

**Last updated**: 2026-07-16
**Current phase**: Complete for starter-runtime consolidation
**Active branch**: `codex/ai-platform-monolith-consolidation`
**Active agents**: Orchestration agent
**Implementation status**: The starter runtime now consists of one deployable API app (`apps/api`) and one deployable web app (`apps/web`). Old product deployables, old workspaces, old product scripts, old product Docker services, old product ports, and old product entitlement slugs have been removed from active starter code/templates. Protocol Lab is classified outside the starter runtime. Spark deployment uses one public Cloudflare endpoint with nginx routing between web and API.

## Final Runtime Shape

```text
apps/
  api/
  web/

packages/
  transport-types/
  planes/
  ui/
```

API modules:

- `auth`
- `admin`
- `agents`
- `workflows`
- `ambient`
- `secure-conversations`
- `rag`
- `health`

Web modules:

- `app`
- `shell`
- `modules/auth`
- `modules/admin`
- `modules/agents`
- `modules/workflows`
- `modules/ambient`
- `modules/secure-conversations`
- `modules/rag`
- `modules/settings`
- `shared`
- `testing`

## Completed Work

- Admin screens and API behavior were copied into the unified platform.
- RAG management was promoted to a first-class RAG module while keeping `@orchestratorai/planes/rag` authoritative.
- Settings now owns operational admin screens in the web app.
- Agents behavior was copied from the old Compose surface into `apps/api/src/agents` and `apps/web/src/modules/agents`.
- Marketing Swarm was moved to Workflows and removed from Agents.
- Ambient behavior was copied from Pulse into `apps/api/src/ambient` and `apps/web/src/modules/ambient`.
- Secure Conversations behavior was copied from Bridge into `apps/api/src/secure-conversations` and `apps/web/src/modules/secure-conversations`.
- Visible module naming is normalized to Agents, Workflows, Ambient, Secure Conversations, Admin, RAG, and Settings.
- Docker Compose now targets `platform-api` and `platform-web`; optional Lightning remains behind the `lightning` profile.
- Entitlement storage now uses current module slugs directly:
  - `workflows`
  - `agents`
  - `ambient`
  - `secure-conversations`
  - `assistant`
- Shared auth clients target the unified platform API auth endpoint.
- Frontend copied admin services use platform module names instead of old standalone API names.
- `.env.example`, Nginx gateway config, and database plane defaults match active local Supabase ports `54321` and `54322`.
- README now teaches the unified starter runtime.
- `agent-handoffs.md` and `completion-report.md` exist.
- `production-checklist.md` documents Spark env, Cloudflare/nginx routing, backup/restore sources, demo credentials, and provider catalog decisions.

## Protocol Lab Disposition

Protocol Lab is developer/demo-only material and is not part of the starter runtime. It should only return through a separate future effort with explicit product scope.

## Current Verification

Most recent successful gates:

- `npm run lint -- --max-warnings=0`
- `npm run build`
- `npm test`
- `npm run test:integration:health`
- `npm run test:integration:admin -- --runInBand`
- `./scripts/dev-servers.sh status`

Local runtime status at close:

- Supabase REST: `54321`
- Supabase Postgres: `54322`
- Platform API: `6700`
- Platform web: `6701`

Spark runtime status:

- Public URL: `https://orchestratorai.io`
- Public health endpoint: `https://orchestratorai.io/api/health`
- Native Spark Cloudflare origin: `http://localhost:7777`
- Platform API container: `platform-api:6700`
- Platform web container: `platform-web:6701`
- Spark Ollama base URL: `http://100.120.203.62:11434`

Provider catalog disposition:

- Anthropic, OpenAI, xAI, and Ollama remain active.
- Google Gemini remains in the catalog but inactive because the deployed key returned `API_KEY_INVALID`.
- Sora video remains in the catalog but inactive until a client configures Sora-capable OpenAI video access.

## Known Residual Risk

`npm audit --audit-level=moderate` still reports the accepted upstream Google Vertex SDK chain:

- `@google-cloud/vertexai@1.12.0`
- `google-auth-library@9.15.1`
- `gaxios@6.7.1`
- `uuid@9.0.1`

`@google-cloud/vertexai@1.12.0` was the latest package version checked on 2026-07-16. A scoped override to a newer `google-auth-library` left npm with an invalid dependency tree and was not committed. This is documented in `docs/security/audit-exceptions.md` and should be addressed when/if a client wants Vertex AI enabled.

## Source Of Truth Files

- `intention.md`
- `plan.md`
- `migration-map.md`
- `verification-log.md`
- `agent-handoffs.md`
- `hardening-report.md`
- `completion-report.md`
