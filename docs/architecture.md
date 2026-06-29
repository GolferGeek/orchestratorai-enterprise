# Architecture

OrchestratorAI Enterprise is organized as independent products plus shared packages. Products own user-facing behavior. Shared packages own contracts, provider abstractions, and reusable UI or auth helpers.

## System Shape

```text
Browser UIs
  Command, Admin, Forge, Compose, Pulse, Bridge, Protocol Lab
        |
        v
Product APIs
  Auth, Admin, Forge, Compose, Pulse, Bridge
        |
        v
Shared Packages
  transport-types, planes, auth-client, ui
        |
        v
Providers
  Supabase/Postgres, LLMs, storage, config, observability
```

## Product Boundaries

Products should contain product behavior, not infrastructure implementations.

- `apps/auth/api` owns login, token validation, organization access, and RBAC.
- `apps/admin/api` and `apps/admin/web` own administrative workflows.
- `apps/forge` owns complex workflow execution and LangGraph-backed agent dashboards.
- `apps/compose` owns simpler composable agent runners.
- `apps/ambient/pulse` owns internal event-driven automation.
- `apps/ambient/bridge` owns external agent-to-agent communication.
- `apps/protocol-lab` owns protocol experimentation and demo scenarios.

## Shared Contracts

`packages/transport-types` is the source of truth for invocation contracts. Product APIs should not define their own competing transport shapes.

The canonical invocation shape is JSON-RPC 2.0:

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

## Execution Context

Execution context is a complete capsule used for attribution, tracing, model/provider selection, and observability. It should flow through service and LLM calls as a whole object.

Core fields:

- `orgSlug`
- `userId`
- `conversationId`
- `agentSlug`
- `agentType`
- `provider`
- `model`
- `sovereignMode`

## Provider Planes

`packages/planes` isolates provider-specific infrastructure. Product code should depend on plane interfaces and injection tokens instead of importing provider implementations directly.

Examples:

- Database access through the database plane.
- LLM access through the LLM plane.
- Media and document storage through the storage plane.
- Observability through the observability plane.
- Auth and config through their dedicated plane abstractions.

## RAG

RAG data is stored in the `rag_data` schema. Admin manages collection metadata, access controls, documents, chunks, and counts. Seed documents for local demos live in `docs/RAG-filler/`.

The legal seed loader is idempotent by file hash:

```bash
set -a
source .env
source .env.secrets 2>/dev/null || true
set +a
npx ts-node scripts/ingest-law-documents.ts
```

## Gateway

The local gateway configuration in `scripts/nginx-prod.conf` routes a single public or local domain to the individual product dev servers. This makes demos feel like one integrated product while preserving independent app/API boundaries.
