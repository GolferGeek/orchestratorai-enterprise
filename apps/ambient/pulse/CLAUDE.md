# Pulse (Internal Ambient Automation)

## FORBIDDEN — Do Not Create These Directories

- **NO `llms/` directory** — use `LLM_SERVICE` from `@orchestratorai/planes/llm`
- **NO `observability/` directory** — use `OBSERVABILITY_SERVICE` from `@orchestratorai/planes/observability`
- **NO `planes/` directory** — all planes live in `packages/planes/`
- **NO `supabase-core/` directory** — Supabase is an internal detail of the database plane
- **NO `agent2agent/` directory** — `invoke/` is the entry point
- **NO `agent-platform/` directory** — removed, agent definitions come from the database

If any of these directories currently exist, they are legacy and must NOT be extended. New code must use the shared planes from `packages/planes/`.

---

## Why This Product Exists

Pulse exists because **internal processing should live where the work happens**. When the old monolith had everything in one place, a developer working on prediction logic had to navigate through A2A protocol code, external security layers, dashboard rendering, and simple agent runners — none of which were relevant to their task. Pulse solves this by owning all internal event-driven processing with a clean, focused codebase.

Pulse is the **inward-facing** ambient product. It watches internal systems (database changes, file events, cron schedules) and runs processing agents (predictor, risk analysis) when events occur. It does NOT talk to the outside world — that's Bridge's job. It does NOT render dashboards — that's Forge's job. It processes.

## Core Architectural Philosophy

### Invoke Contract

Pulse exposes the standard invoke endpoints for external callers (Forge, Bridge, other products):

```
POST /invoke        — synchronous execution
POST /invoke/stream — SSE streaming execution
```

Request shape (JSON-RPC 2.0):
```json
{
  "jsonrpc": "2.0",
  "id": "...",
  "method": "invoke",
  "params": { "context": { ... }, "data": { ... }, "metadata": { ... } }
}
```

The `invoke/` directory handles this:
- **PulseInvokeController** — accepts invoke requests
- **PulseDispatchService** — routes to the appropriate processing service

Most of Pulse's work is trigger-driven internal processing, not invoke-based. The invoke endpoint is a thin A2A edge for when other products need to call Pulse directly.

### Backend-Originated ExecutionContext

Pulse is the one product that **creates ExecutionContext in the backend**. When a cron job fires or a database change triggers processing, there is no frontend user — Pulse must construct the context itself.

The `automation-context/` directory provides `createSystemTriggeredContext()` for this purpose. This is the only sanctioned way to create an ExecutionContext without a JWT.

### Event-Driven Pipeline

Everything in Pulse flows through an event pipeline:

```
Event Source → Trigger Match → Trigger Executor → Processing Agent → Result
```

1. **Listeners** detect events (DB changes, file changes, cron ticks)
2. **Event Bus** normalizes events into `AmbientEvent` envelopes
3. **Trigger Evaluator** checks conditions against `ambient.triggers`
4. **Trigger Executor** calls the appropriate processing service directly
5. **Results** are written to the database — dashboards in Forge read them

For **internal processing** (trigger executor calling a service within the same NestJS process), it's direct service injection — no HTTP round-trip:

```typescript
// Internal: trigger executor calls processing service directly
const result = await this.articleProcessorService.process(article, context);
```

### Platform Planes — Not Custom Clients

All infrastructure goes through platform planes. No custom database clients, no direct LLM API calls:

```typescript
// CORRECT — use the platform plane
@Inject(DATABASE_SERVICE) private readonly db: DatabaseService;
this.db.from('prediction', 'predictors').select('*')...

// WRONG — custom Supabase client
const supabase = createClient(url, key);
supabase.from('predictors')...
```

## Port Assignments

- API: 6500 (dev) / 7500 (prod)
- Web: 6501 (dev) / 7501 (prod)

## Architecture

```
apps/ambient/pulse/api/src/
  invoke/
    invoke.controller.ts            ← POST /invoke, POST /invoke/stream (PulseInvokeController)
    pulse-dispatch.service.ts       ← Routes invoke requests to processing services
  automation-context/
    automation-context.ts           ← createSystemTriggeredContext() for backend-originated EC

  planes/                           ← Platform infrastructure (DATABASE_SERVICE, LLM_SERVICE)
  database-plane/                   ← Database plane configuration
  llms/                             ← LLM service layer (observability-aware)
  observability/                    ← Telemetry, event logging
  crawler/                          ← Article ingestion infrastructure
  auth/                             ← JWT validation (calls Auth API)

  ambient-database/                 ← Data access for ambient.triggers/executions
  event-bus/                        ← Internal event normalization
  listeners/
    db-watcher.service.ts           ← Supabase Realtime (postgres_changes)
    file-watcher.service.ts         ← File system events (chokidar)
    cron-adapter.service.ts         ← Cron schedule triggers
  services/
    trigger-evaluator.service.ts    ← Condition matching
    trigger-executor.service.ts     ← Dispatches to processing agents

  processing/                       ← THE WORK HAPPENS HERE
    predictor/                      ← Prediction engine (175+ files)
      services/                     ← Business logic (analysts, ensembles, market data)
      repositories/                 ← Database access (prediction schema)
      runners/                      ← Batch jobs (signal generation, evaluation, EOD)
      task-router/                  ← Dashboard data routing
    risk-runner/                    ← Risk analysis engine (70+ files)
      services/                     ← Risk dimensions, scoring, debate, Monte Carlo
      repositories/                 ← Database access (risk schema)
      runners/                      ← Batch jobs (analysis, evaluation, alerting)
      task-router/                  ← Dashboard data routing

  workflows/                        ← Workflow definitions and execution
  scenarios/                        ← Guided scenario walkthroughs
  streaming/                        ← SSE streaming (platform-standard format)
  triggers/                         ← Trigger CRUD controller
  executions/                       ← Execution history controller
  health/                           ← Health check
  well-known/                       ← Agent discovery endpoint
```

## Security Posture

Pulse's security concerns are **internal trust boundary** focused:
- JWT validation on API endpoints (calls Auth API)
- Org-scoped data access (ExecutionContext.orgSlug gates all queries)
- Service-to-service trust within the same process (no request signing needed)

This is different from Bridge, which must handle request signing, origin validation, rate limiting for external parties. Pulse trusts its own event sources.

## Database Schemas

Pulse reads/writes these schemas:
- `ambient` — triggers, trigger_executions, adapter_state
- `prediction` — predictors, predictions, analysts, universes, targets, learnings
- `risk` — scopes, subjects, dimensions, assessments, composite scores, debates
- `crawler` — articles, sources (read-only for articles, writes source subscriptions)

## What Does NOT Belong Here

- **External A2A endpoints** — Bridge handles all external communication
- **Dashboard rendering** — Forge Web renders dashboards; Pulse just provides data
- **Simple agent runners** (context, RAG, API, media) — those belong in Compose
- **LangGraph state machines** — those belong in Forge (if an agent needs a graph)
- **User/org/role management** — Auth API only

## Dependencies

- `@orchestratorai/transport-types` — ExecutionContext, invoke contract types
- Platform planes (DATABASE_SERVICE, LLM_SERVICE) — all infrastructure
- Auth API (port 6100) — JWT validation
- Supabase (REST 54321, Postgres 54322) — event storage, processing results
