# Forge Web (Agent Dashboards — Frontend)

## Why This Product Exists

Forge Web exists because **dashboard UIs are a distinct concern from processing engines**. Forge Web renders rich, interactive dashboards that visualize data produced by processing engines in Pulse. It shows predictions, risk scores, marketing campaign progress, and legal workflow status — but it never processes anything itself.

## Core Architectural Philosophy

### Dashboards Visualize Results

Forge Web reads from Forge API, which reads from the database. The data was created by Pulse processing agents. The frontend's job is to present it clearly:

```
Pulse creates data → Database → Forge API reads it → Forge Web renders it
```

### LangGraph Workflow Visualization

For LangGraph agents (marketing-swarm, legal-department, cad-agent), Forge Web shows:
- Multi-step pipeline progress (node execution visualization)
- SSE streaming for real-time updates during async workflows
- HITL approval dialogs (human-in-the-loop approval steps)

### Simple Dashboard Visualization

For predictor and risk-runner dashboards, Forge Web shows:
- Data tables (predictions, risk scores, analysts, universes)
- Charts and analytics
- Manual runner trigger buttons (which call Pulse via Forge API)

## Port Assignments

- Web: 6201 (dev) / 7201 (prod)
- Connects to Forge API at port 6200

## Architecture

```
apps/forge/web/src/
  views/
    marketing-swarm/          ← LangGraph workflow dashboard
    legal-department/         ← LangGraph workflow dashboard
    cad-agent/                ← LangGraph workflow dashboard
    risk-runner/              ← Data dashboard (reads risk schema)
    predictor/                ← Data dashboard (reads prediction schema)
  components/
    agent-dashboard/          ← Shared dashboard layout components
    sse-stream/               ← SSE streaming viewer (async agent progress)
    hitl/                     ← Human-in-the-loop approval dialogs
  stores/
    forge-agents.store.ts     ← Agent task state, SSE connections
  services/
    forge-api.service.ts      ← HTTP client for Forge API (port 6200)
```

### Three-Layer Architecture

```
Component (view) → Store (Pinia) → Service (HTTP) → Forge API
```

## What Does NOT Belong Here

- **Processing logic** — no business logic runs in the frontend
- **Simple agent conversation UI** — that's Compose Web
- **Admin views** — Admin Web
- **Productivity views** (tasks, sprints) — Flow Web
- **External A2A management** — Bridge Web

## Dependencies

- `@orchestratorai/transport-types` — shared types
- `@orchestratorai/ui` — shared UI component library
- Forge API (HTTP/SSE calls to port 6200)
