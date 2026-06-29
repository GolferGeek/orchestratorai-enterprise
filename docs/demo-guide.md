# Demo Guide

This guide gives reviewers a short path through the local platform.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker or a local Supabase/Postgres stack
- Optional: Ollama with `nomic-embed-text` for RAG ingestion

## Start the Platform

```bash
npm install
cp .env.example .env
touch .env.secrets
npm run dev:all
```

For a single-domain style demo, use the gateway profile:

```bash
npm run dev:all:gateway
```

Check service health:

```bash
./scripts/dev-servers.sh status
```

## Suggested Walkthrough

1. Open the Command shell.
2. Log in with a configured local/demo user.
3. Open Admin and review organizations, users, roles, entitlements, observability, and RAG management.
4. In Admin RAG Management, select the Legal organization and verify the seeded legal collections.
5. Open Forge and review the legal workflow surfaces.
6. Open Compose to inspect simpler agent runner patterns.
7. Open Protocol Lab to review protocol/provider experimentation.

## RAG Verification

Run the legal RAG loader. It is idempotent and will skip documents that are already ingested:

```bash
set -a
source .env
source .env.secrets 2>/dev/null || true
set +a
npx ts-node scripts/ingest-law-documents.ts
```

Expected result for an already-seeded database: the loader reports skipped documents and zero failures.

## What To Look For

- Product separation across Command, Admin, Forge, Compose, Pulse, Bridge, and Protocol Lab.
- Shared transport and execution-context contracts.
- Centralized auth/RBAC and admin tooling.
- RAG collection and document management.
- LangGraph workflow surfaces in Forge.
- Local-first architecture that can run behind a gateway for demos.

## Known Review Notes

This is an active product repository, not a minimal starter template. Some products are more mature than others. Planning docs in `docs/efforts/` capture both shipped work and future work.
