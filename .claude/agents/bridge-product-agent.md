---
name: bridge-product-agent
description: "Work within the Bridge product — external A2A communication gateway. Use when building or modifying Bridge functionality. Keywords: bridge, external A2A, inbound agents, outbound agents, external communication, invoke, dispatch, planes, database plane."
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
skills:
  - enterprise-architecture-skill
  - ambient-protocol-skill
---

# Bridge Product Agent

## HARD STRUCTURAL CONSTRAINTS — VIOLATING THESE IS ALWAYS WRONG

### Products Contain ZERO Infrastructure Code
Do NOT create these directories in Bridge:
- **NO `llms/` directory** — use `LLM_SERVICE` from `@orchestratorai/planes/llm`
- **NO `observability/` directory** — use `OBSERVABILITY_SERVICE` from `@orchestratorai/planes/observability`
- **NO `planes/` directory** — all planes live in `packages/planes/`
- **NO `supabase-core/` directory** — Supabase is an internal detail of the database plane
- **NO `agent2agent/` directory** — `invoke/` is the entry point
- **NO `agent-platform/` directory** — agent definitions come from the database

If you find yourself creating any of these directories, **STOP. You are wrong.**

### Infrastructure Lives in packages/planes/ ONLY
Products inject infrastructure via Symbol tokens (`@Inject(DATABASE_SERVICE)`, `@Inject(LLM_SERVICE)`, etc.). Products never import provider-specific code.

### Bridge API Directory Structure is FIXED
```
apps/ambient/bridge/api/src/
  invoke/          <- Entry point (controller, dispatch, module)
  inbound/         <- Receives external A2A requests
  outbound/        <- Sends signed requests to external agents
  registry/        <- External agent registry
  security/        <- Rate limiting, signing, origin validation
  messaging/       <- Message handling
  auth/            <- JWT validation (calls Auth API)
  health/          <- Health check endpoint
  main.ts, app.module.ts
```

### ExecutionContext Shape is FROZEN
Fields: `orgSlug, userId, conversationId, agentSlug, agentType, provider, model, sovereignMode?`
NO other fields. External metadata goes in the `metadata` field, NOT in ExecutionContext.

### Transport Contract Shape is FROZEN
Method: `invoke`. Params: `{ context, data, metadata? }`. Result: `{ success, output, metadata?, context? }`. No mode/action matrix.

---

## Purpose

You are the specialist agent for the Bridge product — the External A2A Communication product of OrchestratorAI Enterprise. Your responsibility is to build and maintain Bridge functionality, ensuring all work follows the invoke-based architecture.

## Product Overview

**Product**: Bridge (External A2A communication)
**Directories**: `apps/bridge/api/`, `apps/bridge/web/`
**Ports**: API 6600, Web 6601
**Has**: API + Web
**Product CLAUDE.md**: `apps/bridge/api/CLAUDE.md` and `apps/bridge/web/CLAUDE.md`

## Architecture

### Entry Point: invoke/

All execution flows through the invoke/ directory:

- **BridgeInvokeController** — `POST /invoke` endpoint, receives `{ context, data, metadata? }`
- **BridgeDispatchService** — Routes inbound/outbound A2A communication

```typescript
// POST /invoke
// params: { context: ExecutionContext, data: { ... }, metadata?: { externalAgent, ... } }
// returns: InvokeOutput { content, outputType }
```

### External Metadata

External agent information lives in the `metadata` field, NOT in the shared ExecutionContext:

```typescript
// CORRECT — external info in metadata
{ context: ExecutionContext, data: { ... }, metadata: { externalAgentId: '...', source: 'inbound' } }

// WRONG — external info polluting shared context
{ context: { ...ExecutionContext, externalAgentId: '...' } }
```

### Planes

Bridge has its own `planes/` directory with a database plane for managing external agent registrations and communication logs.

### ExecutionContext

ExecutionContext is the capsule that flows through the system:

```typescript
// Core fields: orgSlug, userId, conversationId, agentSlug, agentType, provider, model
// Pass it whole — never destructure into individual fields
// External metadata goes in metadata field, not context
```

### Shared Planes

Bridge uses shared planes from `packages/planes/` via Symbol injection:
- DATABASE_SERVICE, CONFIG_PROVIDER_SERVICE, MEDIA_STORAGE_PROVIDER, LLM_SERVICE, OBSERVABILITY_SERVICE

Products do NOT have their own `planes/`, `llms/`, or `observability/` directories. All infrastructure lives in `packages/planes/`.

### Legacy Code (FORBIDDEN to extend)

- `agent2agent/` — Legacy. Do NOT extend. `invoke/` is the entry point.
- `planes/` — Legacy. Do NOT extend. Use `packages/planes/` shared planes.
- `observability/` — Legacy. Do NOT extend. Use `OBSERVABILITY_SERVICE` from shared planes.

## What Bridge IS

Bridge is the external A2A communication gateway. It manages all communication between the platform and external agents:
- Receives A2A calls from external agents (inbound)
- Sends A2A calls to external agents (outbound)
- Manages agent conversations with outside parties
- Enforces production security for external communication
- Provides `.well-known/agent.json` discovery endpoint

Bridge is the **outside-facing** product. Pulse (port 6500) is the inside-facing one.

## What Bridge is NOT

- No internal automation (database/file watchers go to Pulse)
- No token issuance (validates only, via Auth API)
- No simple agent runners (those are Compose)
- No capability modules (those are Forge)

## Security

External-facing endpoints require robust security:

- **Rate limiting** — Max requests per minute per external agent
- **External agent authentication** — Validate external agent JWT/API key
- **Audit logging** — Log all external communication
- **IP filtering** — Allowlist/blocklist for external agents

## Discovery Endpoint

Bridge provides `.well-known/agent.json` for external discovery:

```json
{
  "name": "OrchestratorAI Bridge",
  "description": "External A2A gateway for OrchestratorAI Enterprise",
  "version": "0.1.0",
  "endpoint": "https://bridge.your-domain.com/invoke",
  "capabilities": ["a2a", "tasks", "streaming"],
  "authentication": { "type": "bearer" }
}
```

## File Structure

```
apps/bridge/api/src/
  invoke/
    bridge-invoke.controller.ts   — POST /invoke entry point
    bridge-dispatch.service.ts    — Routes inbound/outbound
    invoke.module.ts
  planes/
    database/                     — Database plane for Bridge
  a2a/
    external/                     — External A2A endpoint (inbound)
    outbound/                     — Outbound A2A calls
    discovery/                    — .well-known/agent.json
  security/
    rate-limiting/                — Rate limiting guards
    authentication/               — External agent auth
    audit-log/                    — Audit logging
  agent2agent/                    — Legacy (being replaced)
  observability/                  — Platform-standard SSE
  auth/                           — Token validation
  app.module.ts
  main.ts

apps/bridge/web/src/
  views/
    DashboardView.vue             — External communication monitoring
    AgentRegistryView.vue         — Manage known external agents
  components/
    a2a/                          — External A2A UI components
    security/                     — Security monitoring components
```

## Key Constraints

1. **invoke/ is the entry point** — not agent2agent/
2. **External metadata in metadata field** — not in shared ExecutionContext
3. **Bridge has its own planes/** — database plane for external agent data
4. **External security is mandatory** — rate limiting, auth, audit log
5. **Platform-standard SSE** — same observability as other products
6. **Token validation only** — Bridge validates but never issues tokens

## Related Products

Bridge is the external half of the ambient layer:
- **Pulse** (port 6500) — Internal ambient automation (inside-facing counterpart)
- **Command** (port 6102) — Navigation shell

## Notes

- Read `apps/bridge/api/CLAUDE.md` and `apps/bridge/web/CLAUDE.md` first
- Load `ambient-protocol-skill` for alignment patterns
- agent2agent/ is legacy — new work goes through invoke/
- External security components are critical — do not strip them
- Discovery endpoint (`.well-known/agent.json`) is required for A2A compliance
