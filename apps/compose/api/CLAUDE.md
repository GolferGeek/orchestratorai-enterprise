# Compose API (Simple Composable Agents — Backend)

## Why This Product Exists

Compose exists because **simple agents shouldn't carry the weight of complex infrastructure**. A chatbot with a system prompt doesn't need LangGraph state machines, multi-node graphs, or HITL approval workflows. When simple and complex agents lived together, adding a basic FAQ agent meant navigating StateGraphs, checkpoint storage, and conditional edge definitions. Compose solves this by providing lightweight runner building blocks.

## Core Architectural Philosophy

### Runners Are Building Blocks

Compose provides 5 runner types that can be chained into lightweight pipelines:

1. **Context runner** — LLM call with system prompt (the simplest possible agent)
2. **RAG runner** — vector search + LLM (retrieval-augmented generation)
3. **API runner** — calls external API + formats the response
4. **External runner** — integrates external tools/services
5. **Image/media runner** — image generation and media processing

### Orchestration, Not Orchestration Engines

Compose chains runners sequentially — output of one becomes input of the next. This is simple function composition, not a state machine:

```typescript
// Compose orchestration — simple pipeline
const result = await pipeline([
  contextRunner,      // Step 1: system prompt + user message
  ragRunner,          // Step 2: enrich with retrieved documents
  contextRunner,      // Step 3: final response with enriched context
]);
```

If you need conditional branching, parallel execution, HITL approval, or checkpointing — that's a LangGraph workflow and belongs in Forge.

### Full A2A Protocol

Compose uses the A2A protocol because it serves external requests from the web frontend:

```
POST /tasks          — run an agent pipeline (converse mode)
POST /tasks/async    — run async + stream results (build mode)
GET  /.well-known/agent.json — A2A discovery
```

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
  runners/
    context-runner/         ← LLM call with system prompt
    rag-runner/             ← Vector search → LLM
    api-runner/             ← External API call → format
    external-runner/        ← External tool/service integration
    media-runner/           ← Image generation
  orchestration/
    orchestration.service.ts    ← Chains runners into pipelines
    orchestration.controller.ts ← POST /tasks
  agents/
    *.agent.ts              ← Named configurations (slug → runner + config)
  conversation/             ← Conversation/task infrastructure
  execution-context/        ← ExecutionContext from JWT
```

## What Does NOT Belong Here

- **LangGraph workflows** — Forge
- **Processing logic** (predictions, risk analysis) — Pulse
- **Internal event handling** (DB watchers, file watchers) — Pulse
- **External A2A communication** — Bridge
- **User/org management** — Auth API

## Dependencies

- `@orchestratorai/transport-types` — A2A protocol types, ExecutionContext
- Platform planes (LLM, observability) — all LLM calls
- Auth API (port 6100) — JWT validation
- Supabase (port 6012) — conversation, task, RAG data
