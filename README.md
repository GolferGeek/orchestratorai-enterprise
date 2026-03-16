# OrchestratorAI Enterprise

Multi-product AI platform built on NestJS, Vue 3, LangGraph, and Supabase.

## Products

| Product | Purpose | API Port | Web Port |
|---------|---------|----------|----------|
| **Command** | Navigation shell, routing based on entitlements | — | 6000 |
| **Auth** | Standalone auth service — login, logout, tokens, permissions | 6100 | — |
| **Admin** | Web UI for managing orgs, users, roles, entitlements | — | 6101 |
| **Forge** | Complex agent dashboards (marketing swarm, legal dept, CAD, risk, predictor) | 6200 | 6201 |
| **Compose** | Simple composable agents (context, RAG, orchestrator composition) | 6300 | 6301 |
| **Pulse** | Internal ambient automation — event-driven watchers | 6500 | 6501 |
| **Bridge** | External A2A communication — inbound/outbound agent conversations | 6600 | 6601 |
| **Assistant** | Personal AI assistant per employee (placeholder) | 6800 | 6801 |
| **Flow** | Productivity — SyncFocus, team tasks/notes/sprints | 6900 | 6901 |

## Shared Packages

| Package | Purpose |
|---------|---------|
| `transport-types` | Shared types, ExecutionContext, A2A contracts, JSON-RPC 2.0 |
| `planes` | Provider planes — LLM, storage, multi-cloud abstraction |
| `ui` | Shared Vue component library |

## Development

```bash
# Start a specific product
npm run dev:forge:api
npm run dev:forge:web

# Build all products
npm run build

# Docker (local)
docker compose --env-file .env --env-file .env.secrets up
```

Supabase runs locally on port 6012.
