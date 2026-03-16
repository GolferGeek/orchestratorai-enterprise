# Forge API (Agent Dashboards — Backend)

## Why This Product Exists

Forge exists because **dashboards need their own home**. When processing logic, dashboard routing, simple agents, and external communication all lived together, modifying a dashboard meant navigating prediction pipelines, risk analysis engines, and A2A protocol code. Forge solves this by being **dashboards only**.

Forge provides the backend for rich, interactive agent dashboards. It serves data that processing engines (in Pulse) have already computed. If a user wants to see predictions, risk scores, marketing campaign results, or legal workflow status — Forge reads from the database and routes it to the frontend. It does NOT run the processing itself.

## Core Architectural Philosophy

### Dashboards Read, They Don't Process

Forge's task routers and handlers are **data readers**, not processors:

```typescript
// Forge dashboard handler — reads results from the database
async list(payload: DashboardRequestPayload, context: ExecutionContext) {
  return this.predictionRepository.findAll(context.orgSlug, payload.filters);
}

// The actual prediction CREATION happens in Pulse, not here
```

Processing agents (predictor, risk-runner) live in **Pulse**. Forge dashboards read the results they produce.

### Full A2A Protocol for External Access

Forge dashboards are accessed via the A2A protocol because they serve external requests (from the web frontend, from other products):

```
POST /tasks         — synchronous dashboard request (converse mode)
POST /tasks/async   — async dashboard request (build mode)
GET  /tasks/:id/stream — SSE stream for async results
GET  /.well-known/agent.json — A2A discovery
```

This is the right protocol weight for Forge — it serves requests from authenticated users via the web frontend, so it needs the full request/response lifecycle.

### LangGraph Workflows (Where They Belong)

If an agent needs a **LangGraph StateGraph** — multi-node graphs, conditional edges, HITL approval steps, checkpointing — the workflow definition lives in Forge. These are the complex orchestration patterns that justify LangGraph:

- Marketing Swarm (multi-agent content pipeline)
- Legal Department (multi-specialist workflow)
- CAD Agent (engineering design assistant)

Simple processing (predictions, risk analysis) uses direct service calls in Pulse — no LangGraph overhead needed.

## Port Assignments

- API: 6200 (dev) / 7200 (prod)

## Architecture

```
apps/forge/api/src/
  agents/
    marketing-swarm/                ← LangGraph: multi-agent content generation
    legal-department/               ← LangGraph: multi-specialist legal workflow
    cad-agent/                      ← LangGraph: engineering design assistant
    predictor/                      ← Dashboard task-router (reads prediction data)
    risk-runner/                    ← Dashboard task-router (reads risk data)
  conversation/                     ← Conversation/task infrastructure
  execution-context/                ← ExecutionContext extraction from JWT
  planes/                           ← Platform infrastructure
  llms/                             ← LLM service layer
  observability/                    ← Telemetry
```

### Agent Dashboard Pattern

Each agent has:
- `*.module.ts` — NestJS module
- `*.service.ts` — Enterprise adapter (routes dashboard requests)
- `task-router/*.router.ts` — Routes `action` strings to handlers
- `task-router/handlers/*.handler.ts` — Individual entity handlers (CRUD over database results)
- `controllers/*.controller.ts` — HTTP endpoints

### What Stays vs What Moved

| Stays in Forge | Moved to Pulse |
|---------------|----------------|
| Dashboard task-routers and handlers | Processing services, runners |
| LangGraph workflow definitions | Prediction generation, risk analysis |
| A2A controllers for dashboard access | Batch processing jobs |
| Conversation/task infrastructure | Market data integrations |
| | Article processing |

## What Does NOT Belong Here

- **Processing logic** (prediction generation, risk analysis, signal detection) — Pulse
- **Internal event handling** (DB watchers, file watchers, cron triggers) — Pulse
- **External A2A communication** — Bridge
- **Simple agent runners** (context, RAG, API, media) — Compose
- **User/org/role management** — Auth API

## Dependencies

- `@orchestratorai/transport-types` — A2A protocol types, ExecutionContext
- Platform planes (DATABASE_SERVICE, LLM_SERVICE) — all infrastructure
- `@langchain/langgraph` — workflow execution (marketing-swarm, legal-department, cad-agent)
- Auth API (port 6100) — JWT validation
- Supabase (port 6012) — conversation, task, checkpoint storage
