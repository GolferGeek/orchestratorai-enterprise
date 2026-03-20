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
- **Never construct it in the backend** — It originates from the frontend and flows through (exception: Pulse system-triggered automation via `createSystemTriggeredContext()`)
- **Never mutate it** — The capsule is immutable for the life of an invocation
- **Every LLM call needs it** — For observability, tracing, and cost attribution
- **Every service call needs it** — It's how we track what happened, who did it, and why

Note: `taskId`, `planId`, and `deliverableId` have been removed from the shared core. They may exist in product-local payloads where justified.

### 4. TRANSPORT TYPES ARE THE CONTRACT
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

### Rule 3: Product API Directory Structure is FIXED

Each API product has this structure and ONLY this structure:
```
apps/{product}/api/src/
  invoke/          <- Entry point (controller, dispatch, module)
  auth/            <- JWT validation (calls Auth API)
  health/          <- Health check endpoint
  {product-specific-modules}/  <- Business logic ONLY
  main.ts
  app.module.ts
  app.service.ts
  app.controller.ts
```

Compose-specific: `invoke/runners/` (5 family runners), `rag/`, `crawler/`, `speech/`
Forge-specific: `invoke/capabilities/` (capability adapters), `agents/` (capability modules)
Pulse-specific: `invoke/`, `automation-context/`, `processing/`, `listeners/`, `event-bus/`, `triggers/`
Bridge-specific: `invoke/`, `inbound/`, `outbound/`, `registry/`, `security/`, `messaging/`

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

### Products

| Product | Purpose | API Port | Web Port |
|---------|---------|----------|----------|
| **Command** | Navigation shell, routing based on entitlements | — | 6102 |
| **Auth** | Standalone auth service — login, logout, tokens, permissions | 6100 | — |
| **Admin** | Web UI for managing orgs, users, roles, entitlements | — | 6101 |
| **Forge** | Complex agent dashboards (LangGraph workflows) | 6200 | 6201 |
| **Compose** | Simple composable agents (context, RAG, API, external, media) | 6300 | 6301 |
| **Pulse** | Internal ambient automation — event-driven watchers | 6500 | 6501 |
| **Bridge** | External A2A communication — inbound/outbound | 6600 | 6601 |
| **Protocol Lab** | 12-layer agent communication playground (7 microservices on 6402-6408) | 6402 | 6400 |
| **Assistant** | Personal AI assistant (placeholder) | 6800 | 6801 |
| **Flow** | Productivity — SyncFocus, team tasks/notes/sprints | 6900 | 6901 |

Production ports mirror at 7xxx. Supabase on port 54321 (API) / 54322 (DB).

### Shared Packages

| Package | Import As | Purpose |
|---------|-----------|---------|
| `packages/transport-types/` | `@orchestratorai/transport-types` | Shared types, ExecutionContext, A2A contracts |
| `packages/planes/` | `@orchestratorai/planes` | Provider planes — LLM, storage, multi-cloud |
| `packages/ui/` | `@orchestratorai/ui` | Shared Vue component library |

### Key Boundaries
- **Auth is standalone** — every product calls Auth API for token validation, never local auth logic
- **Forge vs Compose** — if it needs LangGraph, it's Forge. Simple runners + composition = Compose
- **Pulse vs Bridge** — Pulse watches internal systems. Bridge handles external A2A
- **Products are independent** — they communicate via A2A protocol, not direct imports

### Database
- Single Supabase instance on port 6012
- Schemas: public, prediction, crawler, risk, marketing, orch_flow
- Connection: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`

---

## AGENTS

### Shared Architecture
| Agent | When to use |
|-------|-------------|
| `web-architecture-agent` | Vue.js frontend work in any product's `web/` |
| `api-architecture-agent` | NestJS backend work in any product's `api/` |
| `langgraph-architecture-agent` | LangGraph workflow work (primarily Forge) |

### Product Specialization (Phase 4)
| Agent | Product |
|-------|---------|
| `command-product-agent` | Command shell |
| `auth-product-agent` | Auth service |
| `admin-product-agent` | Admin UI |
| `forge-product-agent` | Forge (complex agents) |
| `compose-product-agent` | Compose (simple agents) |
| `pulse-product-agent` | Pulse (internal automation) |
| `bridge-product-agent` | Bridge (external A2A) |
| `flow-product-agent` | Flow (productivity) |

### Quality & Operations
| Agent | Purpose |
|-------|---------|
| `testing-agent` | Run/generate/fix tests |
| `error-scanner-agent` | Scan for build/lint/test errors |
| `quality-fixer-agent` | Coordinate parallel fixing |
| `pr-review-agent` | Systematic PR review |
| `codebase-monitoring-agent` | Health analysis |
| `codebase-hardening-agent` | Auto-fix from monitoring reports |

---

## COMMANDS

| Command | Purpose |
|---------|---------|
| `/commit` | Commit with quality checks |
| `/create-pr` | Create PR with validation |
| `/review-pr` | Systematic PR review |
| `/test` | Run/generate/fix tests for a product |
| `/scan-errors` | Scan a product for errors |
| `/fix-errors` | Parallel fix quality issues |
| `/monitor` | Codebase health analysis |
| `/harden` | Auto-fix issues from monitoring report |
| `/build-plan` | Create execution plan from PRD |
| `/execute-prd` | Execute PRD with agent teams |
| `/specialize` | Run Phase 4 product specialization |
| `/smoke` | Run smoke tests |
| `/update` | Pull, install, migrate |
| `/backup-db` | Supabase backup |
| `/restore-db` | Supabase restore |

---

## ENVIRONMENT

### Dev servers
Each product runs independently:
```bash
npm run dev:forge:api    # starts Forge API on port 6200
npm run dev:forge:web    # starts Forge web on port 6201
```

### Required
- Supabase running locally (port 6012)
- `DATABASE_URL` in root `.env`
- Node.js v20+

### Docker
```bash
docker compose --env-file .env --env-file .env.secrets up
```
