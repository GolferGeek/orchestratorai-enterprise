# Compose Web (Simple Composable Agents — Frontend)

## Why This Product Exists

Compose Web provides a clean, straightforward conversation interface for simple agents. No multi-step pipeline visualizations, no LangGraph node progress, no HITL approval dialogs — just chat with an agent and get a response. Complex dashboards belong in Forge Web.

## Core Architectural Philosophy

### Simplicity Is the Point

Compose Web is intentionally simple. The UI should make it easy to:
1. Browse available agents
2. Pick one and start chatting
3. View typed outputs rendered appropriately for their outputType

If a view starts needing step-by-step progress visualization or human approval dialogs, it belongs in Forge Web.

### Invoke Client

The `invoke-client.ts` service is the HTTP client for the invoke contract. It sends JSON-RPC 2.0 requests to Compose API's `/invoke` and `/invoke/stream` endpoints and returns typed responses.

### Typed Output Rendering

The `useOutputRenderer` composable handles rendering agent responses based on their `outputType` field (text, markdown, json, image, video, audio, artifact-ref). This ensures each output type gets appropriate presentation without custom per-agent rendering logic.

## Port Assignments

- Web: 6301 (dev) / 7301 (prod)
- Connects to Compose API at port 6300

## Architecture

```
apps/compose/web/src/
  views/                            ← Route-level page components
  components/
    conversation/                   ← Chat UI (thread, input, response)
  composables/
    useOutputRenderer.ts            ← Renders typed outputs (text, markdown, json, image, etc.)
    useConversationDetail.ts        ← Conversation state management
    useDeliverables.ts              ← Deliverable tracking
  stores/                           ← Pinia state stores
  services/
    invoke-client.ts                ← HTTP client for invoke contract (POST /invoke, /invoke/stream)
    compose-api.service.ts          ← General Compose API HTTP client
    conversationsService.ts         ← Conversation CRUD
    agentsService.ts                ← Agent listing and metadata
```

### Three-Layer Architecture

```
Component (view) → Store (Pinia) → Service (HTTP) → Compose API
```

## What Does NOT Belong Here

- **Complex agent dashboards** with multi-step visualization — Forge Web
- **HITL approval dialogs** — Forge Web
- **Admin views** — Admin Web
## Dependencies

- `@orchestratorai/transport-types` — shared types
- `@orchestratorai/ui` — shared UI component library
- Compose API (HTTP calls to port 6300)
