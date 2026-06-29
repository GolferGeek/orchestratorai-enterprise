# OrchestratorAI Enterprise

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-monorepo-3178c6.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-43853d.svg)](.nvmrc)

OrchestratorAI Enterprise is a multi-product AI platform for building, running, and observing agentic workflows across business domains. The codebase is a TypeScript monorepo built around NestJS APIs, Vue 3 frontends, LangGraph workflows, Supabase/Postgres persistence, and shared transport contracts.

This repository is intended to show how the platform is structured, how products communicate, and how the system keeps agent execution, authorization, observability, and provider concerns separated.

## For Reviewers

If you are evaluating this repository for contract work, funding, or employment, the highest-signal areas are:

- `packages/transport-types` for the shared invocation and execution-context contract.
- `packages/planes` for provider abstraction and multi-cloud portability patterns.
- `apps/auth/api` and `packages/auth-client` for centralized auth/RBAC integration.
- `apps/admin` for operational tooling across organizations, users, roles, entitlements, observability, and RAG.
- `apps/forge` for complex LangGraph workflow architecture.
- `docs/efforts/` for planning depth, product thinking, and implementation history.

## What This Demonstrates

- A multi-app enterprise monorepo with independent product surfaces.
- Shared protocol and execution-context contracts for agent-to-agent invocation.
- Product APIs built with NestJS and product UIs built with Vue 3/Ionic.
- LangGraph-backed workflow orchestration for complex, long-running agent work.
- Supabase/Postgres-backed auth, RBAC, RAG, workflow state, and operational data.
- Provider abstraction through shared "planes" for database, LLM, storage, auth, config, and observability services.
- Local-first development with Docker/Supabase support and gateway routing for multi-app demos.

## Screenshots

Screenshots are stored in `docs/assets/` and show verified local demo surfaces.

| Surface | Preview |
| --- | --- |
| Admin RAG management | ![Admin RAG management](docs/assets/admin-rag.png) |
| Forge dashboard | ![Forge dashboard](docs/assets/forge-dashboard.png) |

## Product Map

| Product | Purpose |
| --- | --- |
| Command | Navigation shell and product launcher based on user entitlements. |
| Auth | Standalone authentication, token validation, organization access, and RBAC service. |
| Admin | Organization, user, role, entitlement, model, observability, and RAG administration. |
| Forge | Complex agent dashboards and LangGraph workflows, including legal workflow tooling. |
| Compose | Simple composable agent runners for context, RAG, API, external, and media workflows. |
| Pulse | Internal ambient automation for event-driven watchers and background processing. |
| Bridge | External agent-to-agent communication for inbound/outbound interoperability. |
| Protocol Lab | Playground for protocol, trust, identity, payment, transport, and resilience experiments. |
| Assistant | Personal assistant surface placeholder. |

## Repository Layout

```text
apps/
  auth/api              Standalone auth and RBAC API
  admin/api             Admin API
  admin/web             Admin web UI
  command/web           Navigation shell
  forge/api             Complex workflow API and LangGraph execution
  forge/web             Forge workflow UI
  compose/api           Simple agent runner API
  compose/web           Compose UI
  ambient/pulse         Internal automation product
  ambient/bridge        External A2A communication product
  protocol-lab          Protocol experimentation workspace

packages/
  transport-types       Shared ExecutionContext, invoke contract, and protocol types
  planes                Provider abstractions for infrastructure services
  auth-client           Shared remote auth guard/client helpers
  ui                    Shared Vue component library

docs/
  efforts/              Product planning, PRDs, and implementation notes
  RAG-filler/           Local sample documents used to seed RAG collections
```

## Architecture Notes

The platform uses a product-plus-shared-packages architecture:

- Products own business behavior and user workflows.
- Shared packages own cross-product contracts and infrastructure abstractions.
- APIs communicate through typed invoke contracts rather than ad hoc imports.
- Execution context is treated as a complete capsule for attribution, tracing, and model/provider selection.
- Provider-specific infrastructure is isolated behind the planes package so products do not import Supabase, LLM, storage, or observability implementations directly.

At the transport boundary, the canonical primitive is JSON-RPC 2.0:

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "invoke",
  "params": {
    "context": {
      "orgSlug": "example-org",
      "userId": "user-id",
      "conversationId": "conversation-id",
      "agentSlug": "agent-slug",
      "agentType": "agent-type",
      "provider": "provider",
      "model": "model"
    },
    "data": {
      "content": "business input",
      "contentType": "text"
    }
  }
}
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop or a compatible Docker runtime
- Supabase local stack or the provided Docker/Supabase configuration
- Optional: Ollama with `nomic-embed-text` for local RAG ingestion

### Install

```bash
npm install
```

### Configure Environment

Copy the example environment file and keep secrets out of version control:

```bash
cp .env.example .env
touch .env.secrets
```

The default local database settings in `.env.example` point at:

- Supabase REST/Kong: `http://127.0.0.1:6010`
- Postgres: `postgresql://postgres:postgres@127.0.0.1:6011/postgres`

### Run Services

Start the local product stack:

```bash
npm run dev:all
```

Start the gateway-oriented stack used for single-domain local demos:

```bash
npm run dev:all:gateway
```

Start individual products when working in a focused area:

```bash
npm run dev:auth
npm run dev:admin:api
npm run dev:admin:web
npm run dev:forge:api
npm run dev:forge:web
npm run dev:compose:api
npm run dev:compose:web
```

Ports are configured through `.env`; see `.env.example` and `scripts/dev-servers.sh` for the current local and gateway profiles.

## Common Commands

```bash
# Build all workspaces
npm run build

# Run all tests through Turbo
npm run test

# Run lint through Turbo
npm run lint

# Run integration suites
npm run test:integration

# Docker stack
npm run docker:up
npm run docker:logs
npm run docker:down
```

## Documentation

- [Architecture](docs/architecture.md)
- [Demo guide](docs/demo-guide.md)
- [Roadmap](ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## RAG Seed Data

Sample documents live under `docs/RAG-filler/`. The legal RAG ingestion script loads a curated set of legal documents into the `rag_data` schema and is idempotent by file hash:

```bash
set -a
source .env
source .env.secrets 2>/dev/null || true
set +a
npx ts-node scripts/ingest-law-documents.ts
```

This requires Postgres to be reachable through `DATABASE_URL` and Ollama to expose the `nomic-embed-text` model.

## Development Conventions

- Keep product code focused on product behavior.
- Put provider-specific infrastructure behind `packages/planes`.
- Use `@orchestrator-ai/transport-types` as the source of truth for invocation and execution context types.
- Avoid duplicating transport contracts inside product apps.
- Keep auth centralized through the Auth service or shared auth client helpers.
- Prefer explicit errors over silent fallback behavior when infrastructure or data contracts fail.

## Current Status

This is an active platform codebase, not a polished starter template. Some products are more mature than others, and several planning documents in `docs/efforts/` describe completed, active, and future work. The repository is most useful as a reviewable example of system design, product decomposition, agent workflow architecture, and full-stack TypeScript implementation.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
