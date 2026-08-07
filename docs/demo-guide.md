# Demo Guide

This guide gives technical reviewers, prospective design partners, and funders a
short path through the current unified platform.

## Fastest Review: Hosted Environment

1. Open `https://dev.orchestratorai.io`.
2. Confirm `https://dev.orchestratorai.io/api/health` returns the platform API
   health response.
3. Use a reviewer account supplied privately by the repository owner. Credentials
   must never be added to this guide or committed to the repository.
4. After login, open the dashboard and visit:
   - **Admin** for organizations, users, roles, entitlements, observability, and
     RAG management.
   - **Agents** for configurable agent conversations and provider/model routing.
   - **Workflows** for LangGraph-backed workflows and run history.
   - **Ambient** for internal event-driven automation.
   - **Secure Conversations** for external agent-to-agent communication.
   - **RAG** for collection and document management.
   - **Settings** for platform configuration and health.

The hosted environment is a development demonstration, not a production
customer environment. Use synthetic or approved demonstration data only.

## Local Review

### Prerequisites

- Node.js 20+
- npm 10+
- Docker or a local Supabase/Postgres stack
- Optional: Ollama with `nomic-embed-text` for local RAG ingestion

### Start the Platform

```bash
npm install
cp .env.example .env
touch .env.secrets
npm run dev:all
```

Check service health:

```bash
./scripts/dev-servers.sh status
curl http://127.0.0.1:6700/health
```

Open `http://127.0.0.1:6701`.

## Five-Minute Reviewer Walkthrough

1. **Platform boundary:** show the single web application and API, then explain
   that provider-specific infrastructure is isolated behind shared planes.
2. **Administration:** show organization isolation, users, RBAC, entitlements,
   observability, and RAG collections.
3. **Working AI path:** run one pre-verified agent or workflow with synthetic
   inputs and show its result.
4. **Traceability:** show the execution context, run history, provider/model
   selection, latency, and cost evidence available for that run.
5. **Deployment evidence:** show the GCP runbook and the fail-closed validation
   script rather than claiming a deployment time that has not been measured.

Keep the demonstration focused on one complete, observable workflow. Do not
attempt to tour every module.

## RAG Verification

The legal RAG loader is idempotent and skips documents that are already
ingested:

```bash
set -a
source .env
source .env.secrets 2>/dev/null || true
set +a
npx ts-node scripts/ingest-law-documents.ts
```

Expected result for an already-seeded database: skipped documents and zero
failures.

## Technical Verification

Before a scheduled review:

```bash
npm run lint
npm run build
npm test
npm run audit:accepted
```

Also verify the selected demonstration workflow end to end in the same
environment that will be shown.

## Review Boundaries

- This is an active product and design-partner platform, not a finished
  subscription product.
- The unified `apps/api` and `apps/web` runtime is current. References to the
  older Command, Forge, Compose, Pulse, Bridge, or Protocol Lab applications in
  historical effort documents describe prior architecture or retained concepts.
- Only synthetic or permissioned data belongs in demonstrations.
- A passing health endpoint proves service availability, not workflow accuracy,
  security certification, or production readiness.
- Known risks and planned work belong in the diligence materials; do not hide
  them during review.
