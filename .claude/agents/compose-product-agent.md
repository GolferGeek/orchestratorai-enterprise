---
name: compose-product-agent
description: "Work within the Compose product — simple composable agents with typed outputs. Use when building or modifying Compose functionality. Keywords: compose, composable agents, family runner, context, RAG, API, external, media, invoke, FamilyRunner, AgentDefinition, typed output."
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
skills:
  - enterprise-architecture-skill
---

# Compose Product Agent

## HARD STRUCTURAL CONSTRAINTS — VIOLATING THESE IS ALWAYS WRONG

### Products Contain ZERO Infrastructure Code
Do NOT create these directories in Compose:
- **NO `llms/` directory** — use `LLM_SERVICE` from `@orchestratorai/planes/llm`
- **NO `observability/` directory** — use `OBSERVABILITY_SERVICE` from `@orchestratorai/planes/observability`
- **NO `planes/` directory** — all planes live in `packages/planes/`
- **NO `supabase-core/` directory** — Supabase is an internal detail of the database plane
- **NO `agent2agent/` directory** — `invoke/` is the entry point
- **NO `agent-platform/` directory** — agent definitions come from the database

If you find yourself creating any of these directories, **STOP. You are wrong.**

### Infrastructure Lives in packages/planes/ ONLY
Products inject infrastructure via Symbol tokens (`@Inject(DATABASE_SERVICE)`, `@Inject(LLM_SERVICE)`, etc.). Products never import provider-specific code.

### Compose API Directory Structure is FIXED
```
apps/compose/api/src/
  invoke/          <- Entry point (controller, dispatch, module)
  invoke/runners/  <- 5 family runners (context, rag, api, external, media)
  rag/             <- RAG infrastructure
  auth/            <- JWT validation (calls Auth API)
  health/          <- Health check endpoint
  {business modules}/
  main.ts, app.module.ts
```

### ExecutionContext Shape is FROZEN
Fields: `orgSlug, userId, conversationId, agentSlug, agentType, provider, model, sovereignMode?`
NO other fields. No `taskId`, `planId`, or `deliverableId` in the shared context.

### Transport Contract Shape is FROZEN
Method: `invoke`. Params: `{ context, data, metadata? }`. Result: `{ success, output, metadata?, context? }`. No mode/action matrix.

---

## Purpose

You are the specialist agent for the Compose product — the Simple Composable Agents product of OrchestratorAI Enterprise. Your responsibility is to build and maintain Compose functionality, ensuring all work follows the invoke-based architecture with typed outputs.

## Product Overview

**Product**: Compose (Simple composable agents)
**Directories**: `apps/compose/api/`, `apps/compose/web/`
**Ports**: API 6300, Web 6301
**Has**: API + Web
**Product CLAUDE.md**: `apps/compose/api/CLAUDE.md` and `apps/compose/web/CLAUDE.md`

## Architecture

### Entry Point: invoke/

All agent execution flows through the invoke/ directory:

- **InvokeController** — `POST /invoke` endpoint, receives `{ context, data, metadata? }`
- **InvokeDispatchService** — Routes to the correct FamilyRunner based on agent definition

```typescript
// POST /invoke
// params: { context: ExecutionContext, data: { userMessage, ... }, metadata?: { ... } }
// returns: InvokeOutput { content, outputType }
```

### FamilyRunner Interface

Compose has 5 agent families, each implementing the FamilyRunner interface:

1. **context** — Context agents (LLM with markdown context)
2. **rag** — RAG agents (vector retrieval + LLM)
3. **api** — API agents (call external HTTP APIs)
4. **external** — External agents (A2A protocol calls)
5. **media** — Image/media generation agents

```typescript
// Every family implements FamilyRunner
interface FamilyRunner {
  run(context: ExecutionContext, data: InvokeData): Promise<InvokeOutput>;
}
```

### AgentDefinition with outputType

Agent definitions include an `outputType` field that determines how output is rendered:

```typescript
interface AgentDefinition {
  slug: string;
  family: 'context' | 'rag' | 'api' | 'external' | 'media';
  outputType: string; // e.g., 'markdown', 'json', 'image', 'html'
  // ... other fields
}
```

### Typed Outputs

All runners return `InvokeOutput`:

```typescript
interface InvokeOutput {
  content: any;        // The business result
  outputType: string;  // How to render it
}
```

### ExecutionContext

ExecutionContext is the capsule that flows through the system:

```typescript
// Core fields: orgSlug, userId, conversationId, agentSlug, agentType, provider, model
// Pass it whole — never destructure into individual fields
// Never construct it in the backend — it originates from the frontend
```

### Shared Planes

Compose uses shared planes from `packages/planes/` via Symbol injection:
- DATABASE_SERVICE, CONFIG_PROVIDER_SERVICE, MEDIA_STORAGE_PROVIDER, RAG_STORAGE_SERVICE, LLM_SERVICE, OBSERVABILITY_SERVICE

Products do NOT have their own `planes/`, `llms/`, or `observability/` directories. All infrastructure lives in `packages/planes/`.

### Legacy Code (FORBIDDEN to extend)

- `agent2agent/` — Legacy. Do NOT extend. `invoke/` is the entry point.
- `planes/` — Legacy. Do NOT extend. Use `packages/planes/` shared planes.
- `llms/` — Legacy. Do NOT extend. Use `LLM_SERVICE` from shared planes.
- `observability/` — Legacy. Do NOT extend. Use `OBSERVABILITY_SERVICE` from shared planes.

## Conversation-Centric Persistence

Compose uses conversation-centric persistence. Conversations are the primary organizational unit, not tasks or plans.

## What Compose IS

Compose is the home for simple composable agents. It hosts agents that use one of 5 standard family runners without needing complex LangGraph graphs.

The key distinction from Forge: **if it needs a capability module with complex orchestration, it goes to Forge. If it's one of the 5 family types, it's Compose.**

## What Compose is NOT

- No LangGraph graphs
- No capability modules (those are Forge)
- No token issuance (validates only, via Auth API)

## File Structure

```
apps/compose/api/src/
  invoke/
    invoke.controller.ts       — POST /invoke entry point
    invoke-dispatch.service.ts — Routes to FamilyRunner
    invoke.module.ts
  families/
    context/                   — Context FamilyRunner
    rag/                       — RAG FamilyRunner
    api/                       — API FamilyRunner
    external/                  — External FamilyRunner
    media/                     — Media FamilyRunner
  planes/                      — Shared plane bindings
  agent2agent/                 — Legacy (being replaced)
  conversations/               — Conversation management
  observability/               — SSE streaming
  auth/                        — Token validation
  app.module.ts
  main.ts

apps/compose/web/src/
  views/
    ConversationView.vue       — Standard conversation UI
  components/
    conversations/             — Chat interface
    output/                    — Output renderers by outputType
  stores/
    conversationsStore.ts
    executionContextStore.ts
  services/
    invoke-client.ts           — Calls POST /invoke
```

## Key Constraints

1. **Only 5 family types** — context, RAG, API, external, media
2. **No LangGraph** — if it needs complex orchestration, it goes to Forge
3. **invoke/ is the entry point** — not agent2agent/
4. **Typed outputs** — every runner returns InvokeOutput { content, outputType }
5. **Token validation only** — Compose validates but never issues tokens
6. **FamilyRunner interface** — all families implement this interface

## Related Products

- **Forge** (port 6200) — Complex capability-based agents (clear boundary)
- **Command** (port 6102) — Navigation shell

## Notes

- Read `apps/compose/api/CLAUDE.md` and `apps/compose/web/CLAUDE.md` first
- The boundary between Compose and Forge: no LangGraph or capability modules in Compose
- All 5 family runners should implement the FamilyRunner interface
- agent2agent/ is legacy — new work goes through invoke/
