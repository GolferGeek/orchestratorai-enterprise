# Compose Web (Simple Composable Agents — Frontend)

## Why This Product Exists

Compose Web provides a clean, straightforward conversation interface for simple agents. No multi-step pipeline visualizations, no LangGraph node progress, no HITL approval dialogs — just chat with an agent and get a response. Complex dashboards belong in Forge Web.

## Core Architectural Philosophy

### Simplicity Is the Point

Compose Web is intentionally simple. The UI should make it easy to:
1. Browse available agents
2. Pick one and start chatting
3. Optionally compose a custom pipeline from runner building blocks

If a view starts needing step-by-step progress visualization or human approval dialogs, it belongs in Forge Web.

## Port Assignments

- Web: 6301 (dev) / 7301 (prod)
- Connects to Compose API at port 6300

## Architecture

```
apps/compose/web/src/
  views/
    AgentListView.vue               ← Browse available agents
    AgentConversationView.vue       ← Chat with an agent
    RunnerComposeView.vue           ← Build custom pipelines from runners
  components/
    conversation/                   ← Chat UI (thread, input, response)
    runner-selector/                ← Pick and chain runner types
    agent-list/                     ← Browse agent cards
  stores/
    conversation.store.ts           ← Messages, task status
    agents.store.ts                 ← Available agents list
  services/
    compose-api.service.ts          ← HTTP client for Compose API (port 6300)
```

### Three-Layer Architecture

```
Component (view) → Store (Pinia) → Service (HTTP) → Compose API
```

## What Does NOT Belong Here

- **Complex agent dashboards** with multi-step visualization — Forge Web
- **HITL approval dialogs** — Forge Web
- **Admin views** — Admin Web
- **Productivity views** — Flow Web

## Dependencies

- `@orchestratorai/transport-types` — shared types
- `@orchestratorai/ui` — shared UI component library
- Compose API (HTTP calls to port 6300)
