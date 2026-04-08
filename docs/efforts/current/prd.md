# Phase 4.5 — Reasoning Capture: Provider Expansion + Usage UI — PRD

## 1. Overview

Phase 4 shipped reasoning capture as a sibling method (`callLLMWithReasoning?`) on the fine-control LLM plane, with a typeof-gated helper (`callLLMMaybeWithReasoning`) and three new columns on `public.llm_usage` (`thinking_content`, `thinking_duration_ms`, `thinking_token_count`). It is wired end-to-end through the legal-department workflow — but **only Ollama implements it**. Every other provider falls through the helper to plain `callLLM` and the thinking columns stay NULL.

Phase 4.5 closes two gaps so Phase 5 Hardening has a uniform surface to harden:

1. **Provider coverage** — every fine-control provider implements `callLLMWithReasoning` with the same sibling-method contract, same frozen shape, and a byte-for-byte unchanged `callLLM`.
2. **Operator-facing UI** — the existing `LlmUsagePage.vue` / `admin/llm` controller surface gains reasoning visibility: a "has reasoning" filter, per-row expansion rendering `thinking_content`, and a lazy-load endpoint for reasoning payloads.

Phase 4.5 is additive only. No refactors, no new tables, no framework extraction, no streaming.

## 2. Goals & Success Criteria

### Goals

1. Every fine-control provider implements `callLLMWithReasoning` and populates `thinkingContent` / `thinkingDurationMs` / `thinkingTokenCount` when the underlying model emits reasoning.
2. Existing `callLLM` on every provider is byte-for-byte unchanged (verified per provider via `git diff main`).
3. `public.llm_usage` rows produced by reasoning-capable providers populate the three thinking columns end-to-end when invoked via `callLLMMaybeWithReasoning`.
4. Admin web surfaces captured reasoning via the existing LLM Usage page with filter, expansion, and lazy-load.
5. Caller-name format is confirmed (or normalized) to `{workflowSlug}:{nodeName}` across all LangGraph workflows.

### Success criteria

- `npm run lint`, typecheck, `jest`, and `vitest` are green across the repo.
- For each provider in scope, a live curl test against a real reasoning-capable model produces:
  - a `public.llm_usage` row with non-NULL `thinking_content`
  - `thinking_started` and `thinking_completed` observability events on `public.observability_events`
- The legal-department review modal reasoning accordion renders for jobs run against **at least one non-Ollama reasoning-capable provider**.
- The Admin web LLM Usage page:
  - supports a "has reasoning" boolean filter
  - shows a reasoning badge on rows with non-NULL `thinking_content`
  - expands a row to render `thinking_content` in a scrollable monospace panel
  - fetches `thinking_content` via a lazy-load endpoint (not included in the list response)
- `git diff main -- <provider-service>.ts` shows **zero** changes inside each provider's existing `callLLM` method.
- Chrome smoke: filter by "has reasoning", expand a row, see reasoning render.

## 3. User Stories / Use Cases

- **As a compliance operator**, I open Admin → LLM Usage, filter by org + "has reasoning", expand a row, and read the model's captured reasoning to audit a legal-department decision — without having to touch the database.
- **As a Phase 5 hardening engineer**, I can rely on every fine-control provider to either capture reasoning uniformly or return a normal response — no provider-specific branching in my retry/budget logic.
- **As an attorney using the legal-department review modal**, the reasoning accordion works regardless of which provider the operator configured — not just Ollama.
- **As a developer adding a new LangGraph workflow**, the caller-name convention is explicit and documented, and my rows show up correctly filtered in the Admin UI.

## 4. Technical Requirements

### 4.1 Architecture

Additive only. No file moves, no interface changes, no new services.

- Sibling-method pattern stays: `callLLM` (unchanged) + optional `callLLMWithReasoning` per provider.
- Shared helper `callLLMMaybeWithReasoning` already gates via `typeof provider.callLLMWithReasoning === 'function'` — no change.
- Thinking columns on `public.llm_usage` already exist (`apps/forge/api/supabase/migrations/20260408000001_llm_usage_thinking_columns.sql`) — no new migration.
- Observability events `thinking_started` / `thinking_completed` are already defined and emitted by Ollama's implementation — other providers emit the same two event names with the same payload shape.
- Admin API already has `apps/admin/api/src/llm-analytics/` with a `GET /admin/llm` controller and `LlmUsagePage.vue` in admin web. Phase 4.5 extends these rather than creating a parallel module.

### 4.2 Provider Scope — grounded in actual codebase

> **Note:** The intention file lists OpenAI, Grok, OpenRouter, local-llm, and ollama-cloud. The codebase in `packages/planes/llm/fine-control/services/` actually contains: `anthropic-llm.service.ts`, `google-llm.service.ts`, `grok-llm.service.ts`, `openai-llm.service.ts`, and `ollama-llm.service.ts` (already done). OpenRouter, local-llm, and ollama-cloud services do **not** currently exist. Phase 4.5's scope is therefore the providers that actually exist: **Anthropic, Google, Grok, OpenAI**. Adding new provider services (OpenRouter/local-llm/ollama-cloud) is out of scope and deferred; if stakeholders want them in 4.5, the intention must be updated first.

| Provider | File | Reasoning surface | `thinkingTokenCount` source |
|---|---|---|---|
| OpenAI | `openai-llm.service.ts` | Responses API `reasoning: { effort, summary }` parameter; `response.reasoning` / `output` items of type `reasoning`; `usage.output_tokens_details.reasoning_tokens` | `usage.output_tokens_details.reasoning_tokens` |
| Anthropic | `anthropic-llm.service.ts` | `thinking: { type: 'enabled', budget_tokens }` parameter; response `content` blocks of type `thinking` with `thinking` text field; `usage` does not split thinking tokens from output tokens | NULL (not exposed separately) |
| Google (Gemini) | `google-llm.service.ts` | `thinkingConfig: { includeThoughts: true, thinkingBudget }` parameter; response parts with `thought: true`; `usageMetadata.thoughtsTokenCount` | `usageMetadata.thoughtsTokenCount` |
| Grok (xAI) | `grok-llm.service.ts` | `reasoning_effort` parameter on chat completions; response `choices[0].message.reasoning_content`; `usage.completion_tokens_details.reasoning_tokens` | `usage.completion_tokens_details.reasoning_tokens` |
| Ollama | `ollama-llm.service.ts` | (already done — Phase 4) | NULL (documented in Phase 4) |

Each provider implementation MUST:

1. Leave `callLLM` untouched. Verified by `git diff main -- <file>` showing zero intra-method changes.
2. Add `async callLLMWithReasoning(params: GenerateResponseParams): Promise<LLMResponse>` that returns the same `LLMResponse` shape with `thinkingContent` / `thinkingDurationMs` / `thinkingTokenCount` populated when the upstream emits reasoning, and `undefined` on those fields when the configured model doesn't support reasoning (graceful passthrough is expected here — this is **not** a fallback; the contract explicitly documents `undefined` as "model didn't produce reasoning").
3. Emit `thinking_started` and `thinking_completed` observability events with the same payload shape Ollama emits, via `OBSERVABILITY_SERVICE`.
4. Never internally call `this.callLLM(...)` from inside `callLLMWithReasoning`. Enforced by test.
5. Pass the whole `ExecutionContext` through unchanged — no destructuring.
6. Honor the existing `LLMRequestOptions.executionContext` (already required per `llm-interfaces.ts`).

### 4.3 Data Model Changes

None. The three thinking columns on `public.llm_usage` already exist.

### 4.4 API Changes

Extend existing `apps/admin/api/src/llm-analytics/` (controller mounted at `admin/llm`):

- `GET /admin/llm/usage` — extend query params: `orgSlug?`, `agentName?`, `provider?`, `model?`, `from?`, `to?`, `hasReasoning?` (boolean), `limit?`, `offset?`. Response rows include an additional boolean `hasReasoning` (derived from `thinking_content IS NOT NULL`) and `thinkingDurationMs` / `thinkingTokenCount`, but **do not** return `thinkingContent` in the list payload.
- `GET /admin/llm/usage/:id/reasoning` — new endpoint. Returns `{ thinkingContent: string | null, thinkingDurationMs: number | null, thinkingTokenCount: number | null }` for a single `llm_usage` row. Lazy-load pattern matches legal-department's reasoning probe/fetch.
- All endpoints require existing admin JWT + role checks (already enforced at the module level). No new auth logic.

The existing `getUsage()` summary endpoint stays; the extended list view is a new method on `LlmAnalyticsService` (e.g. `listUsage(filters)`) feeding a new controller handler, so the existing summary surface is not disturbed.

### 4.5 Frontend Changes

Extend existing `apps/admin/web/src/views/admin/LlmUsagePage.vue`:

- Add filter controls: org, agent name, provider, model, date range, "has reasoning" toggle.
- Add columns: `thinking duration`, reasoning badge (when `hasReasoning`).
- Add row-expansion slot that, on open, calls `GET /admin/llm/usage/:id/reasoning` and renders `thinkingContent` in a scrollable monospace `<pre>` (same visual pattern as the legal-department review modal accordion — reuse component if one exists, otherwise keep a page-local presentational component).
- Wire through an admin service client function (existing `services/` directory).
- No new route. No new store. No new global state.

### 4.6 Caller-name audit

- Grep every file under `apps/forge/api/src/agents/` and `apps/compose/api/src/` for `callerName:` usage.
- Confirm every LangGraph node sets `callerName` to `{workflowSlug}:{nodeName}` (e.g. `legal-department:contracts-agent`, `marketing-swarm:copywriter`, `cad-agent:cad-node`).
- If the pattern is consistent, document it in a short code comment on `LlmRequestOptions.callerName` and add a single shared regex helper in the admin analytics service for parsing the format (workflowSlug, nodeName).
- If inconsistent, normalize inline — this is a small audit, not a refactor. If normalization turns out to be non-trivial, stop and escalate before touching it.
- Update the admin UI's display to show workflowSlug + nodeName as two columns (or primary + subtle secondary) so filters are usable.

### 4.7 Infrastructure Requirements

None. All existing planes (`LLM_SERVICE`, `OBSERVABILITY_SERVICE`, `DATABASE_SERVICE`) are reused. No new env vars beyond provider API keys which already exist.

## 5. Non-Functional Requirements

- **No fallbacks.** If a provider request fails, propagate. `undefined` thinking fields on a model that doesn't support reasoning is **not** a failure — it's the contract.
- **`callLLM` byte-for-byte unchanged** per provider, verified in phase review.
- **Observability parity**: identical event names and payload shape across providers so Phase 5 can alert uniformly.
- **Performance**: list endpoint MUST NOT return `thinkingContent` (can be large). Lazy-load only.
- **Security**: reasoning content may contain PII echoed from prompts. The existing PII plane already sanitizes inputs to providers; Phase 4.5 does not add redaction. Surface visibility is gated behind the same admin role required by existing `admin/llm` endpoints. Document this explicitly in the endpoint's description.
- **ExecutionContext**: capsule passed whole through every new code path. Tests assert this.
- **Transport types**: no new public types in `@orchestratorai/transport-types`; all additions are internal to `packages/planes/llm` and to admin app boundaries.

## 6. Out of Scope

- Adding new provider services that don't exist today (OpenRouter, local-llm, ollama-cloud).
- Retry logic, failure modes, cost attribution dashboards, reasoning-token budgets.
- Extracting legal-department reasoning patterns into a shared framework (Phase 6).
- Cross-workflow reasoning comparison or analytics beyond a boolean "has reasoning" filter.
- Redaction / PII handling of reasoning content beyond what the existing PII plane already does.
- Streaming reasoning over SSE.
- Any change to `callLLM` method bodies.
- New database tables or migrations.
- Full LLM observability dashboard.

## 7. Dependencies & Risks

| Risk | Impact | Mitigation |
|---|---|---|
| OpenAI Responses API reasoning shape differs from documentation | Provider implementation stalls | Spike first: run a single live curl with a real reasoning model, parse the actual response shape, then implement. |
| Anthropic extended-thinking requires specific `budget_tokens` and model versions | Silently returns no thinking content | Test with `claude-opus-4-*` or `claude-sonnet-4-*` and explicit `thinking: { type: 'enabled' }`. Document required model family in the provider service. |
| Gemini `includeThoughts` only available on specific models and via specific endpoints | Gaps in coverage | Gate reasoning attempt on model name pattern. Return undefined thinking fields on unsupported models — this is the documented contract. |
| Grok reasoning field name drift (`reasoning` vs `reasoning_content`) | Parsing breaks | Unit test with captured fixtures from real responses. |
| Provider SDK differences make "emit identical observability events" hard | Phase 5 alert fragmentation | Centralize the two event emissions in a small shared helper inside `packages/planes/llm/fine-control/` that each provider calls. This helper is a thin wrapper, not a framework extraction. |
| Developer accidentally edits `callLLM` while adding `callLLMWithReasoning` | Violates frozen contract | Phase review gate: `git diff` check per provider file is a required step in the phase completion checklist. |
| List endpoint returning `thinking_content` bloats payload | Admin UI slowness | Explicit SELECT list in the list query excludes `thinking_content`; lazy-load only. |
| PII in reasoning content leaks to admin UI viewers | Compliance risk | Role-gated via existing admin JWT/role checks; document in endpoint description; no broader change — deferred to Phase 5. |
| Caller-name audit finds deep inconsistency | Scope creep | Hard stop + escalate. Do not normalize inline if non-trivial. |
| Intention references providers that don't exist (OpenRouter/local-llm/ollama-cloud) | Scope mismatch | Phase 4.5 explicitly scopes to providers present in the repo; documented in §4.2. |

## 8. Phasing

Each sub-phase ends with the quality gate (lint + typecheck + jest + vitest + per-provider `git diff` check) plus a live curl smoke for providers in that sub-phase.

### Phase 4.5.1 — OpenAI provider reasoning
- Spike: live curl against `gpt-5` (or currently-available reasoning model) to capture actual Responses API reasoning shape.
- Implement `callLLMWithReasoning` on `openai-llm.service.ts`.
- Emit `thinking_started` / `thinking_completed` via shared helper.
- Populate `thinkingTokenCount` from `usage.output_tokens_details.reasoning_tokens`.
- Unit tests: happy path, empty thinking, non-reasoning model passthrough, "does not call callLLM" assertion.
- Live curl smoke → DB row inspection → observability events present.
- Phase review: `git diff main -- packages/planes/llm/fine-control/services/openai-llm.service.ts` shows zero changes inside `callLLM`.

### Phase 4.5.2 — Anthropic provider reasoning
Same pattern. `thinking: { type: 'enabled', budget_tokens }`, parse `content` blocks of type `thinking`, `thinkingTokenCount` = NULL.

### Phase 4.5.3 — Google (Gemini) provider reasoning
Same pattern. `thinkingConfig.includeThoughts`, parse `parts[*].thought`, `thinkingTokenCount` = `usageMetadata.thoughtsTokenCount`.

### Phase 4.5.4 — Grok (xAI) provider reasoning
Same pattern. `reasoning_effort` parameter, parse `reasoning_content`, `thinkingTokenCount` from `completion_tokens_details.reasoning_tokens`.

### Phase 4.5.5 — Shared observability helper consolidation
- Extract the `thinking_started` / `thinking_completed` emission into a small shared helper inside `packages/planes/llm/fine-control/` (co-located with the reasoning services).
- Refactor each provider (including Ollama) to call the helper. This is the only place `callLLM` adjacent code on Ollama may be touched — and only around the helper call, not inside `callLLM` itself.
- Unit tests for the helper in isolation.
- Per-provider `git diff` on `callLLM` still shows zero changes.

### Phase 4.5.6 — Admin API: reasoning-aware list endpoint + lazy-load
- Extend `LlmAnalyticsService` with `listUsage(filters)` returning paginated rows including `hasReasoning`, `thinkingDurationMs`, `thinkingTokenCount` — never `thinkingContent`.
- Add `GET /admin/llm/usage/:id/reasoning` endpoint + service method.
- Unit tests (jest) for service + controller.

### Phase 4.5.7 — Admin Web: LlmUsagePage filter + row expansion + lazy-load client
- Extend `LlmUsagePage.vue` with filter controls and row expansion.
- Add admin services client call for the lazy-load endpoint.
- Vitest component tests: filter state, row expansion triggers lazy-load, reasoning renders.
- Chrome smoke: filter by "has reasoning", expand a row, reasoning renders.

### Phase 4.5.8 — Caller-name audit + UI parsing
- Grep audit across Forge + Compose LangGraph workflows.
- Document convention (or normalize if trivial; escalate if not).
- Add a shared regex helper in the admin analytics service for parsing `workflowSlug:nodeName`.
- Update `LlmUsagePage.vue` display to use parsed workflow + node columns.

### Phase 4.5.9 — Phase review + end-to-end validation
- Run `git diff main` for each provider service and verify zero changes inside `callLLM`.
- End-to-end test: invoke legal-department review using each non-Ollama reasoning-capable provider; confirm the legal review modal reasoning accordion renders; confirm `llm_usage` row has `thinking_content`.
- Full test suites green.
- Write completion report.
