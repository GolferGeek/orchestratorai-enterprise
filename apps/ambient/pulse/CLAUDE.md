# Pulse (Internal Ambient Automation)

## Why This Product Exists

Pulse exists because **internal processing should live where the work happens**. When the old monolith had everything in one place, a developer working on prediction logic had to navigate through A2A protocol code, external security layers, dashboard rendering, and simple agent runners — none of which were relevant to their task. Pulse solves this by owning all internal event-driven processing with a clean, focused codebase.

Pulse is the **inward-facing** ambient product. It watches internal systems (database changes, file events, cron schedules) and runs processing agents (predictor, risk analysis) when events occur. It does NOT talk to the outside world — that's Bridge's job. It does NOT render dashboards — that's Forge's job. It processes.

## Core Architectural Philosophy

### Still A2A — Just Lightweight

Pulse is A2A. It speaks the same protocol language as every other product. The difference is **how much infrastructure it needs to do so**.

Forge and Compose need the full A2A routing machinery — AgentExecutionGateway, service registries, mode detection (converse/build/dashboard), complex middleware chains — because they serve requests from web frontends and external systems with diverse routing needs.

Pulse doesn't need any of that. Its A2A endpoints are thin NestJS controllers that accept the standard request shape, call a service, and return the standard response shape. The type contracts come from `@orchestratorai/transport-types` (ExecutionContext, response envelope), but the implementation is direct:

```typescript
// Pulse A2A — thin controller, direct service call
@Post('tasks')
async handleTask(@Body() body: A2ARequest): Promise<A2AResponse> {
  const { context, payload } = body.params;
  const result = await this.predictorService.process(payload, context);
  return { jsonrpc: '2.0', id: body.id, result };
}
```

No gateway pattern. No service registry lookup. No mode detection. Pulse can change its protocols quickly because the implementation is simple — but the contract stays A2A.

For **internal processing** (trigger executor calling a service within the same NestJS process), it's even simpler — direct service injection, no HTTP round-trip:

```typescript
// Internal: trigger executor calls processing service directly
const result = await this.articleProcessorService.process(article, context);
```

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
  planes/                           ← Platform infrastructure (DATABASE_SERVICE, LLM_SERVICE)
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

- `@orchestratorai/transport-types` — ExecutionContext, shared types
- Platform planes (DATABASE_SERVICE, LLM_SERVICE) — all infrastructure
- Auth API (port 6100) — JWT validation
- Supabase (port 6012) — event storage, processing results
