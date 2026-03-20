# Compose API (Simple Composable Agents — Backend)

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

Compose exists because **simple agents shouldn't carry the weight of complex infrastructure**. A chatbot with a system prompt doesn't need LangGraph state machines, multi-node graphs, or HITL approval workflows. When simple and complex agents lived together, adding a basic FAQ agent meant navigating StateGraphs, checkpoint storage, and conditional edge definitions. Compose solves this by providing lightweight agent families with typed outputs.

## Core Architectural Philosophy

### Five Agent Families

Compose provides 5 agent families, each producing typed outputs:

1. **Context** — LLM call with system prompt (the simplest possible agent)
2. **RAG** — vector search + LLM (retrieval-augmented generation)
3. **API** — calls external API + formats the response
4. **External** — integrates external tools/services
5. **Media** — image generation and media processing

Each family implements the **FamilyRunner** interface, which standardizes how agents are dispatched and how their outputs are typed.

### Invoke Contract

All requests enter through the invoke endpoint:

```
POST /invoke        — synchronous agent execution
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

### Conversation-Centric Persistence

The conversation is the primary data unit. Agent interactions are stored as conversation turns, not as standalone tasks. This keeps the data model simple and aligned with the chat-first UX.

### Dispatch Architecture

The `invoke/` directory is the entry point for all agent execution:

- **InvokeController** — handles POST /invoke and POST /invoke/stream
- **InvokeDispatchService** — resolves the agent slug to a family runner and dispatches
- **AgentDefinitionService** — loads agent configurations (slug, family, system prompt, model)

The legacy `agent2agent/` directory exists but `invoke/` is the canonical entry point.

## Port Assignments

- API: 6300 (dev) / 7300 (prod)

## Clean Boundary: Compose vs Forge

| Belongs in Compose | Belongs in Forge |
|--------------------|-----------------|
| Single LLM call with system prompt | Multi-node LangGraph graph |
| Vector search + LLM | HITL (human approval steps) |
| Call external API + format result | Complex state machines |
| Chain 2-3 runners sequentially | Conditional edges in graph |
| Simple question-answer agents | Multi-agent swarms |

**Rule:** If you're writing a `StateGraph` or using `addNode`/`addEdge`, it goes to Forge.

## Architecture

```
apps/compose/api/src/
  invoke/
    invoke.controller.ts          ← POST /invoke, POST /invoke/stream
    invoke-dispatch.service.ts    ← Routes agentSlug → FamilyRunner
    agent-definition.service.ts   ← Loads agent configs (slug → family + config)
    agent-definition.types.ts     ← Agent definition type contracts
    invoke.module.ts              ← NestJS module
  runners/
    runners.controller.ts         ← Runner metadata endpoints
    runners.module.ts             ← NestJS module
  rag/                            ← RAG infrastructure (vector search, embeddings)
  rag-storage/                    ← RAG storage management
  planes/                         ← Platform infrastructure (DATABASE_SERVICE, LLM_SERVICE)
  llms/                           ← LLM service layer (observability-aware)
  observability/                  ← Telemetry
  auth/                           ← JWT validation (calls Auth API)
  agent2agent/                    ← Legacy — invoke/ is the entry point
```

## What Does NOT Belong Here

- **LangGraph workflows** — Forge
- **Processing logic** (predictions, risk analysis) — Pulse
- **Internal event handling** (DB watchers, file watchers) — Pulse
- **External A2A communication** — Bridge
- **User/org management** — Auth API

## Dependencies

- `@orchestratorai/transport-types` — invoke contract types, ExecutionContext
- Platform planes (LLM, observability) — all LLM calls
- Auth API (port 6100) — JWT validation
- Supabase (port 6012) — conversation, RAG data
