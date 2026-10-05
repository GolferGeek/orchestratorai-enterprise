# OrchestratorAI Enterprise — Claude Code Instructions

## ABSOLUTE RULES — READ THESE FIRST

### 1. NO FALLBACKS. EVER.
**Do NOT write fallback code, graceful degradation, or alternative paths.** When something breaks, find and fix the ROOT CAUSE.

Do not:
- Add try/catch blocks that silently swallow errors and try a different approach
- Add "if this fails, try that" logic
- Add alternative data sources when the primary one isn't working
- Add `|| defaultValue` patterns to mask missing data
- Add backward-compatibility shims or "just in case" code paths

The correct response to "X isn't loading" is **never** "let me add a fallback to load from Y instead." It is **always** "let me find out why X isn't loading and fix it."

### 2. NO CHEATING
This is an AI-based product. **It is more important to find errors than to get it to run.** Silent failures are the worst possible outcome.

Do not:
- Suppress or swallow errors to make things "work"
- Return empty/default data instead of propagating errors
- Skip validation to avoid throwing
- Ignore type mismatches or cast to `any` to silence TypeScript
- Add `// @ts-ignore` or `eslint-disable` to hide problems
- Write tests that pass by not actually testing the thing

### 3. EXECUTIONCONTEXT IS SACRED
ExecutionContext V2 is the **capsule** that flows through our entire system. Defined in `packages/transport-types/invocation/execution-context.ts`:

```
orgSlug, userId, conversationId,
agentSlug, agentType, provider, model, sovereignMode?
```

Rules:
- **Pass it whole** — Never destructure into individual fields
- **Never construct it in the backend** — It originates from the frontend and flows through (exceptions: Ambient system-triggered automation, and work the Gatehouse's A2A agents start (an internal agent or a workflow run), both via `createSystemTriggeredContext()`, which runs as the system user NIL_UUID; who asked goes in metadata)
- **Never mutate it** — The capsule is immutable for the life of an invocation
- **Every LLM call needs it** — For observability, tracing, and cost attribution
- **Every service call needs it** — It's how we track what happened, who did it, and why

Note: `taskId`, `planId`, and `deliverableId` have been removed from the shared core. They may exist in product-local payloads where justified.

### 4. THE LLM CALL IS TRIVIAL — THE LAYER AROUND IT IS THE PRODUCT

Everything that matters happens **before and after** the provider call:

```
before:  pseudonymize -> pattern-redact -> (policy may refuse)
CALL:    openai | anthropic | google | grok | ollama | ollama-cloud | openrouter
after:   un-redact -> un-pseudonymize -> usage/cost/metadata recorded
```

A vendor is a **backend**: one class extending `BaseLLMService` (a single
abstract method), one line in `LLMServiceFactory.providerMap`, one entry in
`SupportedProvider`. That is the whole job.

- **Never** add a provider as an `LLM_PROVIDER` plane. `LLM_PROVIDER` selects
  the stack; the vendor is chosen per request via `ExecutionContext.provider`.
  A new plane sits beside the before/after layer instead of beneath it and
  silently removes every privacy and accounting guarantee.
- **Never** put PII or usage logic in a vendor file. If you are writing more
  than the call itself, you are at the wrong layer.
- Capability (image, video) is discovered from the backend, never from a
  hardcoded list of provider names.

This has been violated twice, both times silently — OpenRouter ran with no PII
protection and no usage rows for seven months. Read
`docs/architecture/llm-boundary.md` before touching any of it.

### 5. TRANSPORT TYPES ARE THE CONTRACT
`@orchestrator-ai/transport-types` is the **single source of truth** for all communication between products.

**The contract is JSON-RPC 2.0 with the v2 invoke model:**
```
Request:  { jsonrpc: "2.0", id, method: "invoke", params: { context, data: { content, contentType? }, metadata? } }
Response: { jsonrpc: "2.0", id, result: { success, output: { content, outputType, metadata? }, context? } }
```

- `data.content` = the business input
- `output.content` = the business result
- `output.outputType` = typed output (text, markdown, json, image, video, audio, artifact-ref)
- Never bypass transport types. Never duplicate type definitions across products.

---

## STRUCTURAL CONSTRAINTS — HARD RULES THAT PREVENT DRIFT

These are not guidelines. These are load-bearing walls. Violating them creates 500 mistakes across 7 products at AI speed.

### Rule 1: Products Contain ZERO Infrastructure Code

Products do NOT have these directories:
- **NO `llms/` directory** — LLM access is via `LLM_SERVICE` from `@orchestratorai/planes/llm`
- **NO `observability/` directory** — observability is via `OBSERVABILITY_SERVICE` from `@orchestratorai/planes/observability`
- **NO `planes/` directory** — all planes live in `packages/planes/`
- **NO `supabase-core/` directory** — Supabase is an internal detail of the database plane
- **NO `agent2agent/` directory** — `invoke/` is the entry point
- **NO `agent-platform/` directory** — agent definitions come from the database

If you find yourself creating any of these directories in a product, **STOP. You are wrong.**

### Rule 2: Infrastructure Lives in packages/planes/ ONLY

All infrastructure abstractions with multi-cloud implementations live here:
- `packages/planes/database/` — DATABASE_SERVICE (Supabase, PostgreSQL, SQL Server)
- `packages/planes/llm/` — LLM_SERVICE (fine-control, simplified, Azure Foundry, Vertex AI)
- `packages/planes/observability/` — OBSERVABILITY_SERVICE (Supabase, Console)
- `packages/planes/storage/` — MEDIA_STORAGE_PROVIDER (Supabase, Azure Blob, GCS)
- `packages/planes/config/` — CONFIG_PROVIDER_SERVICE (local, Azure KeyVault, GCP Secret Manager)
- `packages/planes/rag/` — RAG_STORAGE_SERVICE (Supabase, PostgreSQL, SQL Server)
- `packages/planes/auth/` — AUTH_SERVICE (Supabase, Azure OIDC, Google OIDC)

Products inject these via Symbol tokens. Products **never** import provider-specific code.

### Rule 3: The API Layout Is Fixed

One NestJS API (`apps/api`) and one Vue web app (`apps/web`). Business
modules sit side by side under `apps/api/src/`:
```
apps/api/src/
  agents/        agent invoke (five family runners) and agent admin
  workflows/     the workflow runtime and every workflow (see docs/architecture/workflows.md)
  ambient/       triggers, watch listeners, pushed events, event bus, automation context
  gatehouse/     the A2A v1.0 boundary: published A2A agents, callers, inbound and outbound calls
  messaging/     Telegram and WhatsApp webhooks (OpenClaw)
  admin/  auth/  rbac/  rag/  marketing/  health/  common/ (common/outbound: the outbound URL safety check)
  main.ts  app.module.ts  app-bootstrap.ts
```
A new capability is a module in one of these (or a new sibling). Never an
`llms/`, `observability/`, `planes/` or `supabase-core/` directory (Rule 1).

### Rule 4: ExecutionContext Shape is FROZEN

```typescript
interface ExecutionContext {
  orgSlug: string;
  userId: string;
  conversationId: string;
  agentSlug: string;
  agentType: string;
  provider: string;
  model: string;
  sovereignMode?: boolean;
}
```

NO other fields. If you find code accessing `context.taskId`, `context.planId`, or `context.deliverableId`, it is WRONG. Those are product-local concerns, not part of the shared context.

### Rule 5: Transport Contract Shape is FROZEN

- Method: `invoke`
- Params: `{ context: ExecutionContext, data: InvokeData, metadata? }`
- Result: `{ success: true, output: InvokeOutput, metadata?, context? }`

NO mode/action matrix. NO converse/plan/build. The single `invoke` method is the transport primitive.

---

## ARCHITECTURE

One deployable: the NestJS API and the Vue web app behind nginx.

| Piece | Where | Local | Deployed |
|-------|-------|-------|----------|
| API | `apps/api` | `npm run dev:api` (port 6700) | container `platform-api` |
| Web | `apps/web` | `npm run dev:web` (port 6701) | container `platform-web` |
| Gateway | nginx | — | `http://localhost:7777`, https://enterprise.orchestratorai.io |
| Supabase | `supabase/` | REST 6010, Postgres 6011, Studio 6012 | same (the Mac Studio) |

### Shared Packages

| Package | Import As | Purpose |
|---------|-----------|---------|
| `packages/transport-types/` | `@orchestrator-ai/transport-types` | Shared types, ExecutionContext, A2A contracts (consumed from `dist`: `npm run build:transport-types` after changing it) |
| `packages/planes/` | `@orchestratorai/planes` | Provider planes: database, LLM, observability, storage, config, checkpointer, work routing |
| `packages/ui/` | `@orchestratorai/ui` | Shared Vue component library |

### Key Boundaries
- **Agents vs workflows.** An agent is a database row run by one of five family runners. A workflow is a LangGraph graph in code on the workflow runtime (`apps/api/src/workflows/`).
- **Ambient** (`apps/api/src/ambient/`) watches for events and cron schedules; a trigger invokes an agent or starts a workflow run as the system user.
- **Every mutation** goes through a validated A2A `invoke` (agents: the invoke controller in `apps/api/src/agents/invoke/`; workflows: `POST /workflows/invoke`). Reads use JWT + the RBAC org, never an identity from the query or body.

### Database
- One Supabase instance: REST **6010**, Postgres **6011**
- Migrations in `supabase/migrations/`; apply to the Studio with `scripts/migrate-deployed.sh` (it runs as `supabase_admin`, so every new table, schema and sequence needs `OWNER TO postgres`)
- A new database starts from `supabase/baseline/` (`scripts/baseline/bootstrap.sh`); every deploy runs `scripts/baseline/check-drift.sh`, so never change the live schema by hand: a migration or nothing
- Connection for specs: `postgresql://postgres:postgres@127.0.0.1:6011/postgres`

---

## SKILLS AND COMMANDS

- Skills live in `.claude/skills/` (`.agents/skills` is a symlink to it): execution context, transport types, planes, agent invoke testing, ambient protocol, and `enterprise-workflow-skill` for building a workflow.
- `/update`: pull, install, migrate.

Scripts: `npm run dev:all` / `dev:stop`, `npm run build:transport-types`, `npm run test:all` (every suite with the database specs on; fails on any failure or skip), `npm run deploy:studio` (pull, migrate, `test:all`, build, health check, observability smoke), `npm run test:integration`.

---

## ENVIRONMENT

### Dev servers
```bash
npm run dev:all    # API on 6700 and web on 6701 (scripts/dev-servers.sh)
npm run dev:stop
```

### Required
- Supabase running (REST 6010, Postgres 6011)
- Root `.env` (see `.env.example`)
- Node.js v20+

### Deploy
`npm run deploy:studio` builds and restarts the containers on the Studio and runs the observability smoke. Commit and push to main first (see `CODING.md`).

## Matt's queue (asking Matt for anything)

Everything waiting on Matt lives in `docs/matt-queue.md`, most important first, each item with a Status: Waiting, then Asked (date), then Answered (date, with Matt's words), then Processed. Processed items move to `docs/matt-queue-archive.md`. When you need Matt to decide or do something, add it with Status: Waiting, in priority order, in the file's self-contained format (title with deadline, Status, What, Why it matters, Options, Recommendation, the exact Reply). Never leave an ask only in chat; Matt reads in bursts and doesn't carry context between messages.

When Matt says "give me your top issue", "the next one" or "what's waiting on me?", give the first item that isn't Answered yet, exactly as written, and mark it Asked. When he answers, mark it Answered with his words, act on it, record the decision, then mark it Processed and move it to the archive. grokbot reads the same file across Matt's projects.
