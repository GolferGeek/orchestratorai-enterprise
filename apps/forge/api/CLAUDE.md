# Forge API (Module-First Capability Host — Backend)

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

Forge exists because **complex agent capabilities need a structured host**. Capabilities like marketing swarms, legal workflows, CAD agents, and risk dashboards each have distinct data models, LLM patterns, and UI requirements. Forge provides a module-first architecture where each capability registers itself and exposes a standard interface.

Forge serves as the backend for rich, interactive agent dashboards and LangGraph workflows. For dashboard-only capabilities, it reads data that processing engines (in Pulse) have already computed. For LangGraph capabilities, it owns the workflow execution.

## Core Architectural Philosophy

### Capability Module Pattern

Each capability is a self-contained NestJS module that registers itself with the CapabilityRegistryService. Capabilities implement the **CapabilityHandler** interface:

```typescript
interface CapabilityHandler {
  invoke(params: InvokeParams): Promise<InvokeResult>;
  invokeStream?(params: InvokeParams): AsyncIterable<StreamChunk>;
  getCard(): CapabilityCard;
}
```

Capabilities register themselves — the registry does not hardcode them. Adding a new capability means creating a module that implements CapabilityHandler and registering it.

### Invoke Contract

All requests enter through the invoke endpoint:

```
POST /invoke        — synchronous capability execution
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

Response shape:
```json
{
  "success": true,
  "output": { "content": "...", "outputType": "text" },
  "metadata": { ... },
  "context": { ... }
}
```

OutputType is one of: `text`, `markdown`, `json`, `image`, `video`, `audio`, `artifact-ref`.

### Dashboards Read, They Don't Process

For dashboard capabilities (predictor, risk-runner), Forge's handlers are **data readers**, not processors:

```typescript
// Forge dashboard handler — reads results from the database
async list(payload: DashboardRequestPayload, context: ExecutionContext) {
  return this.predictionRepository.findAll(context.orgSlug, payload.filters);
}

// The actual prediction CREATION happens in Pulse, not here
```

Processing agents (predictor, risk-runner) live in **Pulse**. Forge dashboards read the results they produce.

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
  invoke/
    invoke.controller.ts            ← POST /invoke, POST /invoke/stream (ForgeInvokeController)
    capability-registry.service.ts  ← Discovers and dispatches to capability modules
    invoke.module.ts                ← NestJS module
  agents/
    marketing-swarm/                ← LangGraph: multi-agent content generation
    legal-department/               ← LangGraph: multi-specialist legal workflow
    cad-agent/                      ← LangGraph: engineering design assistant
    customer-service/               ← Customer service capability
    data-analyst/                   ← Data analysis capability
    hr-assistant/                   ← HR workflow capability
    predictor/                      ← Dashboard capability (reads prediction data)
    risk-runner/                    ← Dashboard capability (reads risk data)
  planes/                           ← Platform infrastructure
  llms/                             ← LLM service layer
  observability/                    ← Telemetry
  auth/                             ← JWT validation (calls Auth API)
  agent2agent/                      ← Legacy — invoke/ is the entry point
```

### Capability Registration Pattern

Each capability module:
- `*.module.ts` — NestJS module that registers with CapabilityRegistryService
- `*.service.ts` — Implements CapabilityHandler interface
- `task-router/*.router.ts` — Routes action strings to handlers (for dashboard capabilities)
- `task-router/handlers/*.handler.ts` — Individual entity handlers (CRUD over database results)
- `controllers/*.controller.ts` — Additional HTTP endpoints if needed

## What Does NOT Belong Here

- **Processing logic** (prediction generation, risk analysis, signal detection) — Pulse
- **Internal event handling** (DB watchers, file watchers, cron triggers) — Pulse
- **External A2A communication** — Bridge
- **Simple agent runners** (context, RAG, API, media) — Compose
- **User/org/role management** — Auth API

## Dependencies

- `@orchestratorai/transport-types` — invoke contract types, ExecutionContext
- Platform planes (DATABASE_SERVICE, LLM_SERVICE) — all infrastructure
- `@langchain/langgraph` — workflow execution (marketing-swarm, legal-department, cad-agent)
- Auth API (port 6100) — JWT validation
- Supabase (port 6012) — conversation, checkpoint storage
