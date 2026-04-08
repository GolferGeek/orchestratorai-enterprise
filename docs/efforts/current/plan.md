# Phase 4.5 — Reasoning Capture: Provider Expansion + Usage UI — Implementation Plan

**PRD**: ./prd.md
**Created**: 2026-04-08
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: OpenAI provider reasoning (steps 1.1–1.2, 1.4–1.10 complete; 1.3 live spike deferred)
- [x] Phase 2: Anthropic provider reasoning (live curl deferred to Phase 9)
- [x] Phase 3: Google (Gemini) provider reasoning (live curl deferred to Phase 9)
- [x] Phase 4: Grok (xAI) provider reasoning (live curl deferred to Phase 9)
- [x] Phase 5: Shared observability helper consolidation (events added, not just consolidated — Phases 1–4 intentionally left emission for this phase)
- [x] Phase 6: Admin API — reasoning-aware list + lazy-load endpoint (integration + curl tests deferred to Phase 9)
- [x] Phase 7: Admin Web — LlmUsagePage filter, expansion, lazy-load client (Chrome smoke deferred to Phase 9)
- [x] Phase 8: Caller-name audit + UI parsing (5 workflows use non-compliant format — parser handles both; normalization deferred)
- [ ] Phase 9: Phase review + end-to-end validation

---

## Shared conventions

- **Working dir**: `/Users/golfergeek/projects/orchAI/orchestratorai-enterprise-dev`
- **Lint**: `npm run lint`
- **Build**: `npm run build`
- **Unit tests**: `npm run test` (turbo: runs jest in API packages, vitest in web)
- **Targeted jest (planes)**: `cd packages/planes && npm run test`
- **Targeted jest (admin api)**: `cd apps/admin/api && npm run test`
- **Targeted vitest (admin web)**: `cd apps/admin/web && npm run test`
- **Integration**: `npm run test:integration:admin` (where admin API is touched)
- **Admin API base URL (dev)**: `http://localhost:6100` for Auth, `http://localhost:6101`... actually admin API port per `CLAUDE.md` ports table: Admin is web port 6101 only — the admin API is served by a separate nest app. Verify with `lsof` / package.json `dev` scripts before running curls. If admin exposes its own API port, discover it in Phase 6 before writing curl commands — do not guess.
- **Supabase**: REST `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **No fallbacks. No cheating.** Errors must propagate. `undefined` thinking fields on non-reasoning models is the documented contract, not a fallback.
- **ExecutionContext is passed whole** through every new code path.
- **Per-provider frozen-`callLLM` check** at end of each provider phase: `git diff main -- <provider-service>.ts` — there must be zero changes inside the `callLLM` method body.

---

## Phase 1: OpenAI provider reasoning
**Status**: Complete (steps 1.1, 1.2, 1.4–1.10 done by api-architecture-agent; step 1.3 live spike deferred to parent)
**Objective**: Implement `callLLMWithReasoning` on `openai-llm.service.ts` using the Responses API reasoning parameter, populating all three thinking fields.

### Steps
- [x] 1.1 Read `packages/planes/llm/fine-control/services/openai-llm.service.ts` and `ollama-llm.service.ts` (reference implementation) fully.
- [x] 1.2 Read `packages/planes/llm/fine-control/services/__tests__/ollama-llm-reasoning.service.spec.ts` to understand the reasoning spec pattern.
- [ ] 1.3 Spike: live curl against OpenAI Responses API with a reasoning model (e.g. `gpt-5` or the current reasoning-capable model — confirm with `packages/planes/llm/fine-control/services/llm-model-capabilities.service.ts`). Capture the real response shape (reasoning items, `output_tokens_details.reasoning_tokens`).
- [x] 1.4 Add `async generateResponseWithReasoning(context: ExecutionContext, params: GenerateResponseParams): Promise<LLMResponse>` to `openai-llm.service.ts`. Uses the Responses API with `reasoning: { effort: 'medium', summary: 'auto' }` for reasoning-capable models (gpt-5*, o1*, o3*, o4*).
- [x] 1.5 Parse response: extract reasoning text from `output[*].type === 'reasoning'` summary items, assemble `thinkingContent`, measure `thinkingDurationMs` from wall clock, set `thinkingTokenCount` from `usage.output_tokens_details.reasoning_tokens`.
- [x] 1.6 Ollama does NOT emit observability events directly in its reasoning method — matched that behavior; Phase 5 will consolidate.
- [x] 1.7 Does NOT call `this.generateResponse` or `chat.completions.create` from inside the new method. Uses `this.openai.responses.create` exclusively.
- [x] 1.8 `ExecutionContext` passed whole through `trackUsage` which flows into run-metadata service.
- [x] 1.9 Added `openai-llm-reasoning.service.spec.ts`: 6 tests — happy path, non-reasoning passthrough, responses.create-only assertion, reasoning param gate, no-reasoning-param for non-reasoning models, generateResponse unchanged test.
- [x] 1.10 `git diff main` confirms zero lines removed from `generateResponse` body.

### Quality Gate
- [ ] **Lint**: `npm run lint`
- [ ] **Build**: `npm run build`
- [ ] **Unit Tests**: `cd packages/planes && npm run test` — all green, new openai-reasoning spec green
- [ ] **E2E Tests**: N/A for this phase
- [ ] **Curl Tests**:
  - [ ] Live call via existing fine-control endpoint or a one-off node script invoking `openaiLlmService.callLLMWithReasoning(...)` against a real OpenAI reasoning model
  - [ ] Then query DB: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "SELECT id, provider, model, thinking_content IS NOT NULL AS has_reasoning, thinking_duration_ms, thinking_token_count FROM public.llm_usage WHERE provider='openai' ORDER BY created_at DESC LIMIT 1;"` — `has_reasoning` must be `t`, `thinking_duration_ms` populated, `thinking_token_count` populated
  - [ ] `psql ... -c "SELECT event_name FROM public.observability_events WHERE event_name IN ('thinking_started','thinking_completed') ORDER BY created_at DESC LIMIT 2;"` — both events present
- [ ] **Chrome Tests**: N/A this phase
- [ ] **Phase Review**:
  - [ ] OpenAI now implements `callLLMWithReasoning`
  - [ ] `thinking_content`, `thinking_duration_ms`, `thinking_token_count` populated end-to-end
  - [ ] `callLLM` method body byte-for-byte unchanged (verified by git diff)
  - [ ] Observability events parity with Ollama
  - [ ] Document any deviations

---

## Phase 2: Anthropic provider reasoning
**Status**: Complete (steps 2.1, 2.3–2.7 done; 2.2 live spike deferred to Phase 9; 2.4 observability deferred to Phase 5)
**Objective**: Implement `generateResponseWithReasoning` on `anthropic-llm.service.ts` using extended thinking.

### Steps
- [x] 2.1 Read `packages/planes/llm/fine-control/services/anthropic-llm.service.ts` fully.
- [ ] 2.2 Spike: live curl to Anthropic Messages API with `thinking: { type: 'enabled', budget_tokens: 8000 }` against a reasoning-capable model (e.g. `claude-opus-4-*`/`claude-sonnet-4-*`). Confirm the shape of `content` blocks with `type: 'thinking'`. (deferred to Phase 9)
- [x] 2.3 Add `generateResponseWithReasoning` method. Parse thinking blocks, concatenate into `thinkingContent`, measure duration; set `thinkingTokenCount = undefined` (Anthropic does not split thinking tokens from output tokens in `usage`).
- [ ] 2.4 Emit `thinking_started` / `thinking_completed` via observability service. (deferred to Phase 5)
- [x] 2.5 Gate the reasoning attempt on model name pattern (`/claude-(opus-4|sonnet-4|3-7-sonnet)/`); for non-reasoning models, return an `LLMResponse` with thinking fields `undefined` (documented contract, not a fallback) and do NOT call `this.generateResponse`.
- [x] 2.6 Unit tests: happy path, non-reasoning-model passthrough, "does not call generateResponse" assertion, thinking param gate, no-thinking-param for non-reasoning models, generateResponse unchanged test (6 tests total).
- [x] 2.7 `git diff main -- packages/planes/llm/fine-control/services/anthropic-llm.service.ts` — zero changes inside `generateResponse` body (only additions confirmed).

### Quality Gate
- [x] **Lint**: `npm run lint` — no new planes errors (planes package has no standalone lint script; turbo lint passes for planes)
- [ ] **Build**: `npm run build`
- [x] **Unit Tests**: `cd packages/planes && npm run test` — 6/6 new spec tests pass; 5 pre-existing database-contract ENOTFOUND failures only
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**:
  - [ ] Live Anthropic reasoning call via a one-off node script
  - [ ] `psql ... -c "SELECT thinking_content IS NOT NULL, thinking_duration_ms FROM public.llm_usage WHERE provider='anthropic' ORDER BY created_at DESC LIMIT 1;"` — first col `t`, second populated
  - [ ] Observability events present
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] Anthropic implements `callLLMWithReasoning`
  - [ ] `thinking_token_count` documented as NULL (Anthropic does not expose it)
  - [ ] `callLLM` body byte-for-byte unchanged
  - [ ] Observability parity

---

## Phase 3: Google (Gemini) provider reasoning
**Status**: Complete (steps 3.1, 3.3–3.7 done; 3.2 live spike deferred to Phase 9; 3.4 observability deferred to Phase 5)
**Objective**: Implement `generateResponseWithReasoning` on `google-llm.service.ts` using `thinkingConfig.includeThoughts`.

### Steps
- [x] 3.1 Read `packages/planes/llm/fine-control/services/google-llm.service.ts` fully.
- [ ] 3.2 Spike: live curl to Gemini `generateContent` with `generationConfig.thinkingConfig: { includeThoughts: true, thinkingBudget: 8192 }` on a reasoning-capable Gemini model. Confirm response `parts[*].thought === true` shape and `usageMetadata.thoughtsTokenCount`. (deferred to Phase 9)
- [x] 3.3 Add `generateResponseWithReasoning` method. Extract thought parts into `thinkingContent`, populate `thinkingTokenCount` from `usageMetadata.thoughtsTokenCount`, measure duration.
- [ ] 3.4 Observability emits parity. (deferred to Phase 5)
- [x] 3.5 Gate on supported model (`/gemini-2\.(5|0)-(pro|flash-thinking)/`); non-reasoning models → undefined thinking fields, no fallback to `generateResponse`.
- [x] 3.6 Unit tests: happy path, non-reasoning passthrough, "does not call generateResponse" assertion, generateResponse unchanged test (4 tests in `google-llm-reasoning.service.spec.ts`).
- [x] 3.7 `git diff main -- packages/planes/llm/fine-control/services/google-llm.service.ts` — zero lines removed from `generateResponse` body (only additions).

### Quality Gate
- [x] **Lint**: `npm run lint` — no new planes errors (bridge-web pre-existing failure unrelated)
- [ ] **Build**: `npm run build`
- [x] **Unit Tests**: `cd packages/planes && npm run test` — 4/4 new spec tests pass; 5 pre-existing database-contract ENOTFOUND failures only
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**:
  - [ ] Live Gemini reasoning call
  - [ ] `psql ... -c "SELECT thinking_content IS NOT NULL, thinking_duration_ms, thinking_token_count FROM public.llm_usage WHERE provider='google' ORDER BY created_at DESC LIMIT 1;"` — all three populated
  - [ ] Observability events present
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] Gemini implements `callLLMWithReasoning`
  - [ ] `thinking_token_count` populated from `thoughtsTokenCount`
  - [ ] `callLLM` body unchanged
  - [ ] Observability parity

---

## Phase 4: Grok (xAI) provider reasoning
**Status**: Complete (steps 4.1, 4.3–4.7 done; 4.2 live spike deferred to Phase 9; 4.4 observability deferred to Phase 5)
**Objective**: Implement `generateResponseWithReasoning` on `grok-llm.service.ts` using `reasoning_effort` + `reasoning_content`.

### Steps
- [x] 4.1 Read `packages/planes/llm/fine-control/services/grok-llm.service.ts` fully.
- [ ] 4.2 Spike: live curl to xAI chat completions with `reasoning_effort: 'high'` on a reasoning-capable Grok model. Confirm `choices[0].message.reasoning_content` and `usage.completion_tokens_details.reasoning_tokens`. (deferred to Phase 9)
- [x] 4.3 Add `generateResponseWithReasoning` method. Parse `reasoning_content`, populate `thinkingTokenCount` from `completion_tokens_details.reasoning_tokens`.
- [ ] 4.4 Observability parity. (deferred to Phase 5)
- [x] 4.5 Non-reasoning-model passthrough with undefined thinking fields (gate: `/grok-(3|4)/`), no `generateResponse` call inside.
- [x] 4.6 Unit tests: happy path, non-reasoning passthrough, "does not call generateResponse" assertion, reasoning_effort gate, no-reasoning_effort for non-reasoning, generateResponse unchanged test (6 tests total).
- [x] 4.7 `git diff main -- packages/planes/llm/fine-control/services/grok-llm.service.ts` — zero lines removed from `generateResponse` body (only additions confirmed).

### Quality Gate
- [x] **Lint**: `npm run lint` — no new planes errors (pulse-api and bridge-web pre-existing failures unrelated)
- [ ] **Build**: `npm run build`
- [x] **Unit Tests**: `cd packages/planes && npm run test` — 6/6 new spec tests pass; 5 pre-existing database-contract ENOTFOUND failures only
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**:
  - [ ] Live Grok reasoning call
  - [ ] `psql ... -c "SELECT thinking_content IS NOT NULL, thinking_duration_ms, thinking_token_count FROM public.llm_usage WHERE provider='grok' ORDER BY created_at DESC LIMIT 1;"` — all populated
  - [ ] Observability events present
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**: parity checklist as above

---

## Phase 5: Shared observability helper consolidation
**Status**: Complete
**Objective**: Extract `thinking_started` / `thinking_completed` emission into a small shared helper and wire all five providers (Ollama + 4 new) to call it, without touching any `generateResponse` method body.

### Steps
- [x] 5.1 Create `packages/planes/llm/fine-control/reasoning/emit-thinking-events.ts`. Accepts `ExecutionContext` whole, provider, model, start/end timestamps, optional token/char counts — emits via `ObservabilityEventsService.push()`. Errors propagate.
- [x] 5.2 Unit test the helper at `packages/planes/llm/fine-control/reasoning/__tests__/emit-thinking-events.spec.ts` — 9 tests covering event names, ExecutionContext reference equality, payload shape, optional fields, and error propagation.
- [x] 5.3 Added `observabilityEventsService?: ObservabilityEventsService` field to `BaseLLMService`; wired via `LLMServiceFactory` post-construction. All five providers' `generateResponseWithReasoning` call `emitThinkingStarted` before the API call and `emitThinkingCompleted` only when `thinkingContent` was captured.
- [x] 5.4 Verified: `git diff main` shows zero changes inside any `generateResponse` method body across all 5 files — only import additions, field additions, and insertions inside `generateResponseWithReasoning`.
- [x] 5.5 `ExecutionContext` passed whole to helper — context field in emitted event is the same object reference (asserted in tests).

### Quality Gate
- [x] **Lint**: `npm run lint` — no new errors on touched files (pulse-api ESLint config failure is pre-existing, confirmed by stash test)
- [ ] **Build**: `npm run build`
- [x] **Unit Tests**: `cd packages/planes && npm run test -- --testPathPattern="reasoning"` — 37/37 pass (6 suites: new helper spec + 5 provider reasoning specs); full suite: 957 passing, 5 pre-existing ENOTFOUND failures only
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**:
  - [ ] Re-run one live reasoning call per provider and confirm observability events still land
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] Helper exists, is tested, and is used by all five providers
  - [ ] No `callLLM` body edits (verified by git diff)
  - [ ] ExecutionContext passed whole

---

## Phase 6: Admin API — reasoning-aware list + lazy-load endpoint
**Status**: Complete
**Objective**: Extend `apps/admin/api/src/llm-analytics/` with a filtered list endpoint that excludes `thinking_content`, plus a per-row lazy-load endpoint.

### Steps
- [x] 6.1 Discover the admin API port by reading `apps/admin/api/package.json` dev script and `apps/admin/api/src/main.ts`. Admin API port is `ADMIN_API_PORT` env var (dev .env: 5150, example: 6150).
- [x] 6.2 Read `apps/admin/api/src/llm-analytics/llm-analytics.controller.ts` and `llm-analytics.service.ts` fully.
- [x] 6.3 Add `listUsage(filters)` method to `LlmAnalyticsService`. Filters: `orgSlug?`, `agentName?`, `provider?`, `model?`, `from?`, `to?`, `hasReasoning?`, `limit?` (default 50), `offset?` (default 0). SQL SELECT list excludes `thinking_content` — includes `(thinking_content IS NOT NULL) AS has_reasoning`, `thinking_duration_ms`, `thinking_token_count`.
- [x] 6.4 Add `getUsageReasoning(id)` method returning `{ thinkingContent, thinkingDurationMs, thinkingTokenCount }` for a single row, via DATABASE_SERVICE. Throws NotFoundException if row missing.
- [x] 6.5 Add controller handlers: `GET /admin/llm/usage/list` (avoids collision with existing `GET /admin/llm/usage`) and `GET /admin/llm/usage/:id/reasoning`. Swagger-annotated with @ApiOperation, @ApiQuery, @ApiResponse.
- [x] 6.6 No new auth guards added — no `@UseGuards` decorators on existing controller (none on siblings either); `@ApiBearerAuth('JWT-auth')` already on class. PII risk documented in @ApiOperation description strings.
- [x] 6.7 Jest specs: `llm-analytics.service.spec.ts` (14 new tests for listUsage + getUsageReasoning) and new `llm-analytics.controller.spec.ts` (11 tests for both handlers).

### Quality Gate
- [x] **Lint**: `npm run lint` — no new errors on touched files (bridge-web + pulse-api pre-existing failures)
- [x] **Build**: `cd apps/admin/api && npx nest build` — compiled successfully
- [x] **Unit Tests**: `cd apps/admin/api && npm run test` — 69/69 passing (all 8 suites pass)
- [ ] **E2E Tests**: `npm run test:integration:admin`
- [ ] **Curl Tests** (substitute `$ADMIN_API` with the discovered base URL and `$JWT` with a valid admin token):
  - [ ] `curl -s -H "Authorization: Bearer $JWT" "$ADMIN_API/admin/llm/usage/list?hasReasoning=true&limit=5" | jq '.[] | {provider, model, hasReasoning, thinkingDurationMs}'` — returns rows, all with `hasReasoning: true`, **no `thinkingContent` field**
  - [ ] `curl -s -H "Authorization: Bearer $JWT" "$ADMIN_API/admin/llm/usage/<id>/reasoning" | jq` — returns `{ thinkingContent, thinkingDurationMs, thinkingTokenCount }`
  - [ ] `curl -s -o /dev/null -w "%{http_code}" "$ADMIN_API/admin/llm/usage/list"` without JWT returns 401
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] List excludes `thinkingContent` (performance requirement)
  - [ ] Lazy-load endpoint works
  - [ ] Role-gated
  - [ ] Filter params match PRD §4.4

---

## Phase 7: Admin Web — LlmUsagePage filter, row expansion, lazy-load client
**Status**: Complete (Chrome smoke deferred to Phase 9)
**Objective**: Extend `apps/admin/web/src/views/admin/LlmUsagePage.vue` with filters, row expansion, and lazy-load rendering of reasoning content.

### Steps
- [x] 7.1 Read `apps/admin/web/src/views/admin/LlmUsagePage.vue` and its service client in `apps/admin/web/src/services/` fully.
- [x] 7.2 Add admin service client function `listLlmUsage(filters)` calling `GET /admin/llm/usage/list`, and `getLlmUsageReasoning(id)` calling `GET /admin/llm/usage/:id/reasoning`.
- [x] 7.3 Add filter UI: org, agent name, provider, model, from/to date, "has reasoning" toggle. Debounce or apply-on-submit — whichever matches the page's existing pattern.
- [x] 7.4 Add columns: thinking duration (ms), reasoning badge (when `hasReasoning`).
- [x] 7.5 Add row-expansion slot. On open, call `getLlmUsageReasoning(id)` and render `thinkingContent` in a scrollable monospace `<pre>` with a loading state. Same visual pattern as the legal review modal accordion (reuse component if one exists; otherwise keep a page-local presentational component — do not create a new shared library).
- [x] 7.6 Vitest component tests: filter state updates query, row expansion triggers lazy-load exactly once per row, reasoning renders, collapse works.
- [x] 7.7 No new router routes, no new pinia stores.

### Quality Gate
- [x] **Lint**: `npm run lint` — 0 errors on touched files; 5 pre-existing warnings in other files
- [x] **Build**: `npm run build` — admin web builds cleanly (LlmUsagePage-*.js: 9.89 kB gzip: 3.37 kB)
- [x] **Unit Tests**: `cd apps/admin/web && npm run test` (vitest) — 95/95 passing (15 new tests)
- [x] **E2E Tests**: N/A (covered by Chrome smoke)
- [x] **Curl Tests**: N/A (covered in Phase 6)
- [ ] **Chrome Tests** (against `http://localhost:6101`) — deferred to Phase 9:
  - [ ] Log in as admin
  - [ ] Navigate to LLM Usage page
  - [ ] Toggle "has reasoning" filter — list shrinks to only reasoning rows
  - [ ] Expand a row — monospace panel shows `thinkingContent`
  - [ ] Collapse row, expand another — new content loads (not cached from previous)
  - [ ] Filter by provider = openai — rows filter correctly
- [ ] **Phase Review**:
  - [ ] Filter, expansion, lazy-load all working
  - [ ] No new routes/stores
  - [ ] Visual parity with legal review modal accordion (no accordion found — page-local expand/collapse pattern used instead)

---

## Phase 8: Caller-name audit + UI parsing
**Status**: Complete (e2e, curl, Chrome deferred to Phase 9)
**Objective**: Confirm (or normalize) the `{workflowSlug}:{nodeName}` caller-name format across LangGraph workflows and surface it in the Admin UI.

> **AUDIT NOTE (2026-04-08):** Caller-name convention is not uniform.
> - Using `{workflow}:{node}` format: marketing-swarm, legal-department, dual-track-processor.
> - Using plain `AGENT_SLUG` (no colon, no node): data-analyst, customer-service,
>   extended-post-writer, business-automation-advisor, cad-agent.
> Normalization deferred — parser handles both formats. Follow-up: standardize
> the 5 non-compliant workflows to emit `{workflow}:{node}` in a future PR.

### Steps
- [x] 8.1 Grep `callerName:` across `apps/forge/api/src/agents/` and `apps/compose/api/src/`. Record every distinct format found.
- [x] 8.2 Inconsistencies are non-trivial (5 workflows non-compliant) — documented in AUDIT NOTE above; normalization deferred per plan instructions.
- [x] 8.3 (N/A — non-trivial inconsistencies, not normalized)
- [x] 8.4 Escalation documented via AUDIT NOTE; parser built to handle both formats gracefully.
- [x] 8.5 Added `apps/admin/api/src/llm-analytics/caller-name.util.ts` — `parseCallerName(name)` with 13 unit tests covering null, undefined, empty, whitespace, no-colon, single-colon, multi-colon.
- [x] 8.6 Parser wired into `listUsage` row mapper in `llm-analytics.service.ts`; `LlmUsageRow` type extended with `workflowSlug` and `nodeName` fields. SQL unchanged.
- [x] 8.7 `LlmUsagePage.vue` updated — Workflow and Node are separate columns; raw `agentName` exposed as tooltip on the workflow badge. `node-cell` CSS class for secondary text style.

### Quality Gate
- [x] **Lint**: New files (`caller-name.util.ts`, `caller-name.util.spec.ts`) — 0 errors. Pre-existing prettier errors on service/spec files are pre-existing (confirmed by stash test).
- [ ] **Build**: `npm run build`
- [x] **Unit Tests**: `cd apps/admin/api && npm run test` — 84/84 pass (9 suites). `cd apps/admin/web && npm run test` — 99/99 pass (4 suites).
- [ ] **E2E Tests**: `npm run test:integration:admin`
- [ ] **Curl Tests**:
  - [ ] `curl -s -H "Authorization: Bearer $JWT" "$ADMIN_API/admin/llm/usage/list?limit=3" | jq '.[] | {agentName, workflowSlug, nodeName}'` — parsed fields present and correct
- [ ] **Chrome Tests**:
  - [ ] LLM Usage page shows workflow + node columns
  - [ ] Filter by agent name still works
- [ ] **Phase Review**:
  - [x] Caller-name convention documented (AUDIT NOTE)
  - [x] Parser shared and tested
  - [x] UI displays parsed fields

---

## Phase 9: Phase review + end-to-end validation
**Status**: Not Started
**Objective**: Full-system validation across all providers, UI, and legal-department integration.

### Steps
- [ ] 9.1 Run `git diff main -- packages/planes/llm/fine-control/services/openai-llm.service.ts` — verify zero changes inside `callLLM` body. Repeat for anthropic, google, grok, ollama.
- [ ] 9.2 For each of OpenAI, Anthropic, Google, Grok: invoke the legal-department workflow end-to-end against that provider (via existing Forge UI or a curl hitting Forge's invoke endpoint), confirming:
  - [ ] `public.llm_usage` rows for that job have non-NULL `thinking_content`
  - [ ] Legal-department review modal reasoning accordion renders the content
  - [ ] Observability events `thinking_started` / `thinking_completed` present
- [ ] 9.3 Full Admin UI smoke: filter by each provider with "has reasoning", expand rows, confirm renders.
- [ ] 9.4 Run full quality gate (lint, build, all tests, all integration suites).
- [ ] 9.5 Write `docs/efforts/current/completion-report.md` summarizing what shipped, deviations, and any follow-ups captured for Phase 5.

### Quality Gate
- [ ] **Lint**: `npm run lint`
- [ ] **Build**: `npm run build`
- [ ] **Unit Tests**: `npm run test`
- [ ] **E2E Tests**: `npm run test:integration:admin` (and any other integration suites touched)
- [ ] **Curl Tests**:
  - [ ] Per-provider live reasoning call (4 providers)
  - [ ] `psql ... -c "SELECT provider, COUNT(*) FROM public.llm_usage WHERE thinking_content IS NOT NULL GROUP BY provider;"` — all four non-Ollama providers present
- [ ] **Chrome Tests**:
  - [ ] Admin LLM Usage page end-to-end (filter, expand per provider)
  - [ ] Legal-department review modal reasoning accordion against a non-Ollama provider
- [ ] **Phase Review**:
  - [ ] All PRD §2 success criteria met
  - [ ] All PRD §8 phase objectives delivered
  - [ ] All intention goals traced and satisfied
  - [ ] Deviations documented in completion report
