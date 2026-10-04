# Architecture

OrchestratorAI Enterprise is one deployable: a NestJS API (`apps/api`) and a
Vue 3 + Ionic web app (`apps/web`) behind nginx, on one Supabase instance.
Business modules sit side by side in the API. Shared packages own the
contracts and the provider abstractions.

## System Shape

```text
Browser (apps/web): agents, workflows, admin
        |
        v   /api  (JWT + RBAC org; mutations are A2A "invoke")
NestJS API (apps/api)
  agents/      agent invoke: five family runners over public.agents rows
  workflows/   the workflow runtime and every workflow (LangGraph graphs in code)
  ambient/     triggers: cron, database changes, files; start agents or workflows
  decisions/   rubric checks (Jev) for workflows and agent guards, on a decision model (Clef on Ollama)
  gatehouse/   the A2A v1.0 boundary: inbound A2A, outbound A2A client, callers
  messaging/  rag/  admin/  auth/  rbac/  marketing/  health/  common/
        |
        v
Shared packages
  transport-types, planes, ui
        |
        v
Providers
  Supabase/Postgres, LLMs, storage, config, observability, work tracker
```

## Module Boundaries

A new capability is a module in `apps/api/src/` (or a new sibling), never an
infrastructure directory: LLM, database, storage, observability, config and
auth come from `packages/planes` through injection tokens.

- `agents/` runs agents: a database row (`public.agents`) run by one of five
  family runners. Agents can carry Jev guards (`metadata.jev_guards`) whose
  verdicts come back with the answer.
- `decisions/` runs Jev rubric checks in process: the rubrics are YAML in
  `apps/api/src/decisions/rubrics/<group>/`, and each check is one
  `POST ${DECISION_BASE_URL}/v1/systemone` (Clef on the Studio's Ollama today;
  hosted Jev later, by configuration). `npm run decisions:cases` in `apps/api`
  scores the labelled cases in `decisions/cases/` against the live model.
- `workflows/` holds the runtime (`workflows.runs`, a worker, human gates,
  work units, the issue ledger, export, restart, trace review) and each
  workflow in its own folder. `docs/architecture/workflows.md` is the guide.
- `ambient/` watches cron schedules, database changes (the database plane's
  change stream) and files, and starts an agent or a workflow run as the
  system user.
- `gatehouse/` handles external agent-to-agent communication (A2A v1.0):
  published agents, registered callers, inbound tasks and outbound calls.
  The old `secure-conversations/` A2A endpoints were retired on 2026-10-01
  and replaced by the Gatehouse.
- `messaging/` receives Telegram and WhatsApp webhooks
  (`/messaging/webhooks/telegram|whatsapp`).
- `common/outbound/` holds the outbound URL validator every module that
  calls an external URL goes through (`OUTBOUND_ALLOW_PRIVATE_NETWORKS`).
- `rbac/` and `auth/` own identity, organizations and permissions.

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
- Document text extraction through the extractors plane.
- LangGraph checkpoints through the checkpointer plane.
- Work tasks (human reviews, created action items) through the work-routing plane.
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

nginx serves the web app and proxies `/api` to the API container
(`http://localhost:7777` on the Studio, https://enterprise.orchestratorai.io
publicly). `npm run deploy:studio` builds, boot-probes and swaps the
containers.
