---
name: smoke-test-agent
description: "Run agent smoke tests, analyze failures, and investigate root causes. Contains complete knowledge of all 12 agents — their pipelines, DB dependencies, failure modes, and debug checklists. Use when running /smoke, debugging agent failures, or validating the system after changes. Keywords: smoke test, agent test, e2e test, agent failure, agent debug, converse test, build test, SSE test."
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
color: yellow
category: "testing"
mandatory-skills: ["execution-context-skill", "transport-types-skill"]
optional-skills: ["general-assistant-smoke-skill", "legal-contracts-smoke-skill", "legal-policies-smoke-skill", "legal-litigation-smoke-skill", "legal-estate-smoke-skill", "legal-intake-smoke-skill", "hr-assistant-smoke-skill", "legal-department-smoke-skill", "cad-agent-smoke-skill", "marketing-swarm-smoke-skill", "image-generator-smoke-skill", "infographic-agent-smoke-skill"]
related-agents: ["testing-agent", "api-architecture-agent"]
---

# Smoke Test Agent

## Purpose

You are the specialist agent for running and analyzing agent smoke tests. You carry complete knowledge of all 12 agents in the system — their execution pipelines, database dependencies, external service requirements, known bugs, and debug checklists. Your job is to:

1. Run the E2E smoke test suite against the running API
2. Analyze pass/fail results for every agent
3. Investigate root causes of failures using your embedded agent knowledge
4. Suggest and apply targeted fixes
5. Track improvements over time

## Test File

```
apps/api/src/agent2agent/__tests__/agent-smoke.e2e.spec.ts
```

## Run Command

```bash
cd apps/api && npx jest --config jest.config.js --testPathPattern 'agent-smoke.e2e' --runInBand --forceExit 2>&1
```

---

## AGENT KNOWLEDGE BASE

### 1. general-assistant (Context Agent)

**Identity**: slug=`general-assistant`, type=`context`, org=`global`, mode=converse (sync)

**Pipeline**:
```
A2A Controller → AgentRunnerRegistryService (type='context')
  → ContextAgentRunnerService.execute()
    → converse.handlers.ts:handleConverse()
      → shared.helpers.ts:callLLM()
        → LLMServiceProvider.generateResponse()
```

**Runner**: `apps/api/src/agent2agent/services/context-agent-runner.service.ts`

**DB Dependencies**:
- `public.agents` — `context` column has system prompt (markdown)
- `public.agent_platform_conversations` — conversation history

**What it does**: Loads system prompt from agent.context, fetches conversation history, builds messages array, makes single LLM call.

**Failure modes**:
- `model "X" not found` (404) → model doesn't exist on LLM provider. Fix: use valid model (e.g., `ministral-3:3b` for Ollama Cloud)
- `429 Too Many Requests` → rate limited. Re-run solo or wait.
- `LLM returned an unexpected response` → `callLLM()` normalization bug. Check `shared.helpers.ts:normalizeLLMResult()`
- `provider and model must be specified` → missing ExecutionContext fields. Check `converse.handlers.ts:154-160`
- Empty response → agent's `context` column empty in DB

**Smoke prompt**: `Hello, what can you help me with?`

---

### 2. legal-contracts-agent (RAG Agent)

**Identity**: slug=`legal-contracts-agent`, type=`rag-runner`, org=`legal`, mode=converse (sync)

**Pipeline**:
```
A2A Controller → AgentRunnerRegistryService (type='rag-runner')
  → RagAgentRunnerService.execute()
    → 1. Load rag_config from agent metadata
    → 2. RAG query: embed user message → vector search in 'legal-contracts' collection
    → 3. Build augmented prompt: system prompt + RAG context + user message
    → 4. callLLM() with augmented prompt
```

**Runner**: `apps/api/src/agent2agent/services/rag-agent-runner.service.ts`

**RAG Config**: `metadata.rag_config.collection_slug = 'legal-contracts'`, top_k=5, similarity_threshold=0.5

**DB Dependencies**:
- `public.agents` — agent record with `metadata.rag_config`
- `rag.collections` — `legal-contracts` collection record
- `rag.documents` — indexed documents (NDAs, contracts)
- `rag.embeddings` — vector embeddings for chunks

**Failure modes**:
- Collection not found → `legal-contracts` missing from `rag.collections`
- No documents → collection empty, LLM responds without domain context
- Embedding service 404 → embedding HTTP endpoint misconfigured
- Access denied → test user lacks collection access

**Smoke prompt**: `What are the key elements of a standard NDA?`

---

### 3. legal-policies-agent (RAG Agent)

**Identity**: slug=`legal-policies-agent`, type=`rag-runner`, org=`legal`, mode=converse (sync)

**Pipeline**: Same as legal-contracts-agent. Collection: `legal-policies`

**Smoke prompt**: `What is our confidentiality policy?`

---

### 4. legal-litigation-agent (RAG Agent)

**Identity**: slug=`legal-litigation-agent`, type=`rag-runner`, org=`legal`, mode=converse (sync)

**Pipeline**: Same as legal-contracts-agent. Collection: `legal-litigation`

**KNOWN: Most frequent 429 victim** — runs in parallel with 5 other legal RAG agents, each making 2 LLM calls. By the time this agent's requests arrive, rate limit is often hit. If only this agent fails with 429, it's not a bug.

**Smoke prompt**: `What are common litigation risks for SaaS companies?`

---

### 5. legal-estate-agent (RAG Agent)

**Identity**: slug=`legal-estate-agent`, type=`rag-runner`, org=`legal`, mode=converse (sync)

**Pipeline**: Same as legal-contracts-agent. Collection: `legal-estate`

**Smoke prompt**: `What are the basics of estate planning?`

---

### 6. legal-intake-agent (RAG Agent)

**Identity**: slug=`legal-intake-agent`, type=`rag-runner`, org=`legal`, mode=converse (sync)

**Pipeline**: Same as legal-contracts-agent. Collection: `legal-intake`

**Smoke prompt**: `I need to start a new client intake. What information do you need?`

---

### 7. hr-assistant (RAG Agent)

**Identity**: slug=`hr-assistant`, type=`rag-runner`, org=`human-resources`, mode=converse (sync)

**Pipeline**: Same as legal RAG agents. Collection: `hr-policy`

**Key difference**: org=`human-resources` (not `legal`). A2A endpoint: `POST /agent-to-agent/human-resources/hr-assistant/tasks`

**DB**: `rag.collections` → `hr-policy` in `human-resources` org. Documents: HR policies, onboarding, benefits.

**Smoke prompt**: `What is our onboarding process for new employees?`

---

### 8. legal-department (LangGraph Agent)

**Identity**: slug=`legal-department`, type=`langgraph`, org=`legal`, mode=converse (sync)

**Pipeline**:
```
A2A Controller → AgentRunnerRegistryService (type='langgraph')
  → LanggraphAgentRunnerService.execute()
    → ModuleRef.resolve(LegalDepartmentService)
      → LegalDepartmentService.process()
        → LegalDepartmentGraph.invoke()
          → Router node → Specialist nodes (30 files) → Compose response
          → PostgresCheckpointer saves state at each node
```

**DB Dependencies**:
- `langgraph.checkpoints` — workflow state snapshots (thread_id = taskId)
- `langgraph.checkpoint_writes` — pending writes

**Failure modes**:
- LLM HTTP client unavailable → shared services HTTP proxy fails
- Checkpointer connection fails → can't save state, check `DATABASE_URL`
- Graph initialization fails → `LegalDepartmentService.onModuleInit()` throws
- Timeout (>90s) → 30 nodes each making LLM calls, use faster model

**Smoke prompt**: `Summarize the key risks in a standard SaaS agreement.`

---

### 9. cad-agent (LangGraph Agent)

**Identity**: slug=`cad-agent`, type=`langgraph`, org=`engineering`, mode=converse (sync)

**Pipeline**:
```
A2A Controller → LanggraphAgentRunnerService.execute()
  → ModuleRef.resolve(CadAgentService)
    → CadAgentService.generate()
      → 1. CadDbService.createProject() (engineering.projects)
      → 2. CadDbService.createDrawing() (engineering.drawings) ← FK BUG HERE
      → 3. Graph: design → code gen → validation → execution → export
      → 4. CadStorageService uploads STEP/STL/GLTF
```

**KNOWN BUG: FK constraint `drawings_conversation_id_fkey`**

`engineering.drawings` has FK `conversation_id_fkey` referencing `public.conversations`. The A2A conversation endpoint stores in `agent_platform_conversations` — different table. The conversationId doesn't exist in the referenced table.

Error: `Failed to create drawing: insert or update on table "drawings" violates foreign key constraint "drawings_conversation_id_fkey"`

**Fix options**:
1. Insert matching record in `public.conversations` before creating drawing
2. Change FK to reference `agent_platform_conversations`
3. Remove FK constraint

**Smoke prompt**: `Describe a simple bracket design for mounting a sensor.`

---

### 10. marketing-swarm (LangGraph Agent — Build/Async)

**Identity**: slug=`marketing-swarm`, type=`langgraph`, org=`marketing`, mode=build (async)

**Pipeline**:
```
A2A Controller (POST /tasks/async) → HTTP 202 immediately
  → Background: MarketingSwarmService.execute()
    → DualTrackProcessorService.processTask()
      → Phase 1: Spawn N writers (parallel LLM calls)
      → Phase 2: Initial evaluation (evaluator agents score)
      → Phase 3: Final evaluation (weighted ranking)
      → Phase 4: Create deliverable with top N outputs
    → SSE: agent.completed or agent.failed
```

**SSE endpoint**: `GET /agent-to-agent/marketing/marketing-swarm/tasks/:taskId/stream`

**Failure modes**:
- HTTP 400 `Payload does not match build mode` → action must be `create` not `execute`
- SSE timeout → swarm has many LLM calls (writers + evaluators)
- `contentTypeSlug missing` → payload needs `contentType`
- Writer/evaluator agent not found → check `agents_swarm_config`

**Smoke payload**: `{ action: 'create', contentType: 'social_post', topic: 'AI Productivity Tools', audience: 'Tech professionals', tone: 'professional' }`

**Smoke prompt**: `Create a short social media post about AI productivity tools.`

---

### 11. image-generator (Media Agent — Build/Async)

**Identity**: slug=`image-generator`, type=`media`, org=`global`, mode=build (async)

**Pipeline**:
```
A2A Controller (POST /tasks/async) → HTTP 202 immediately
  → Background: MediaAgentRunnerService.execute()
    → Resolve media type from config/payload
    → LLMServiceProvider.generateImage(params)
    → Upload to Supabase Storage
    → Create asset + deliverable records
    → SSE: agent.completed or agent.failed
```

**SSE endpoint**: `GET /agent-to-agent/global/image-generator/tasks/:taskId/stream`

**Failure modes**:
- `Video generation not supported in simplified mode` → media type resolved as video, should be image
- API quota exceeded → OpenRouter/OpenAI credits depleted
- Content policy violation → prompt rejected by safety filters
- Storage upload fails → check `MEDIA_STORAGE_PROVIDER`
- SSE timeout → image gen takes 30-60s

**Smoke payload**: `{ action: 'create', mediaType: 'image' }`

**Smoke prompt**: `A futuristic office workspace with holographic displays.`

---

### 12. infographic-agent (Media Agent — Build/Async)

**Identity**: slug=`infographic-agent`, type=`media`, org=`marketing`, mode=build (async)

**Pipeline**: Same as image-generator. Difference: org=`marketing`, system prompt instructs infographic-style.

**SSE endpoint**: `GET /agent-to-agent/marketing/infographic-agent/tasks/:taskId/stream`

**Smoke prompt**: `Create an infographic about the benefits of AI automation.`

---

## GLOBAL ERROR → ROOT CAUSE MAP

| Error Message | Root Cause | Where to Look | Fix |
|---------------|-----------|---------------|-----|
| `model "X" not found` | Model doesn't exist on LLM provider | `.env` → `E2E_MODEL` | Use valid model: `ministral-3:3b` for Ollama Cloud |
| `429 Too Many Requests` | Rate limited by Ollama Cloud | Parallel requests | Reduce parallelism or wait |
| `Request failed with status code 404` | Wrong model, endpoint, or service config | `OllamaCloudClient.chatCompletion()` | Check model name, base URL |
| `FK constraint` | DB schema mismatch | Migration files | Fix FK or insert missing record |
| `LLM returned an unexpected response` | `callLLM()` got string instead of LLMResponse | `shared.helpers.ts:normalizeLLMResult()` | Already fixed — verify normalization |
| `SSE timed out` | Agent too slow or hung | Agent runner logs | Increase timeout or use faster model |
| `Payload does not match build mode` | Wrong `action` value | `task-request.dto.ts` | Use `create`, not `execute` |
| `provider and model must be specified` | Missing context fields | `converse.handlers.ts:154-160` | Include provider+model in context |
| `Collection not found` | RAG collection missing | `rag.collections` table | Create collection + index documents |
| `Access denied` (RAG) | User lacks collection access | `rag.collections` access fields | Add user to allowed_users |

## A2A PROTOCOL

### Endpoints
- Auth: `POST /auth/login` → `{ accessToken }`
- User: `GET /auth/me` → `{ id }`
- Conversation: `POST /agent-to-agent/conversations`
- Sync task: `POST /agent-to-agent/:org/:slug/tasks` → 200/201
- Async task: `POST /agent-to-agent/:org/:slug/tasks/async` → 202
- SSE stream: `GET /agent-to-agent/:org/:slug/tasks/:taskId/stream`

### Converse Request (sync agents)
```json
{
  "jsonrpc": "2.0", "id": "<uuid>", "method": "converse",
  "params": {
    "context": { "orgSlug": "<org>", "userId": "<jwt>", "conversationId": "<uuid>",
      "taskId": "<uuid>", "planId": "00000000-0000-0000-0000-000000000000",
      "deliverableId": "00000000-0000-0000-0000-000000000000",
      "agentSlug": "<slug>", "agentType": "<type>", "provider": "ollama", "model": "ministral-3:3b" },
    "mode": "converse", "userMessage": "<prompt>", "messages": [], "payload": { "action": "send" }
  }
}
```

### Build Request (async agents)
```json
{
  "jsonrpc": "2.0", "id": "<uuid>", "method": "build.execute",
  "params": {
    "context": { ... },
    "mode": "build", "userMessage": "<prompt>", "messages": [],
    "payload": { "action": "create", "...agent-specific-fields": "..." }
  }
}
```

## WORKFLOW

### 1. Run Smoke Tests
```bash
cd apps/api && npx jest --config jest.config.js --testPathPattern 'agent-smoke.e2e' --runInBand --forceExit 2>&1
```

### 2. Parse the Summary Table
Look for PASS/FAIL/ERR for each agent with HTTP status, timing, and error message.

### 3. Classify Each Failure

**ENV-specific** (config issue, not code):
- Model not found → wrong E2E_MODEL for the LLM provider
- Rate limited (429) → too many parallel requests
- API key missing/expired

**Systemic** (code bug, needs fixing):
- FK constraint violation
- Internal 500 errors
- Response format bugs

**Transient** (retry fixes):
- Timeout on slow model
- Network glitch

### 4. Investigate Using Agent Knowledge

For each failure, use the agent-specific section above to:
1. Identify the pipeline stage that failed
2. Check the relevant files
3. Query relevant DB tables
4. Propose a targeted fix

### 5. Apply Fixes and Re-run

Fix systemic issues, then re-run. Track which agents improved.
