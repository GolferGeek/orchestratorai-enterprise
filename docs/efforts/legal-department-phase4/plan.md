# Legal Department Phase 4 — Reasoning Capture — Plan

**Effort**: Capture reasoning (thinking) tokens from Ollama reasoning models and expose them through coarse live observability events and a durable post-hoc review-modal accordion.
**PRD**: `docs/efforts/current/prd.md`
**Intention**: `docs/efforts/current/intention.md`
**Branch**: `effort/legal-department-phase4` (already checked out)
**Prior phases**: archived under `docs/efforts/archive/legal-department-upgrades-phases-1-3/`

## Progress Tracker

- [ ] Phase 4: Reasoning Capture (Ollama only)

---

## Phase 4: Reasoning Capture
**Status**: Not Started
**Objective**: Add a sibling `callLLMWithReasoning?` method to the LLM plane (Ollama-only implementation in this phase), persist captured reasoning into `public.llm_usage`, surface two coarse observability events for "thinking started" / "thinking completed", render "reasoning" / "writing" states in the legal-department stage ladder, and expose a per-specialist collapsible "Reasoning" accordion in the review modal. Every existing call site in the system continues to use `callLLM` and is unaffected. Non-Ollama providers are untouched and will be wired in Phase 4.5 before Phase 5 Hardening.

### Steps

#### LLM plane — shared primitive changes
- [ ] 4.1 Extend the shared `LLMResponse` type (likely in `packages/planes/llm/fine-control/services/llm-interfaces.ts` — confirm at implementation time) with three new optional fields: `thinkingContent?: string`, `thinkingDurationMs?: number`, `thinkingTokenCount?: number`. Add JSDoc making clear these are populated only by `callLLMWithReasoning`, never by `callLLM`. Existing consumers are unaffected because the fields are optional.
- [ ] 4.2 Add `callLLMWithReasoning?(params: LLMCallParams): Promise<LLMResponse>` as an **optional** method on the shared `LlmService` interface. Use JSDoc matching the `CapabilityHandler.invokeStream?` convention: "Optional — providers implement this when they support capturing reasoning/thinking tokens from the upstream model. Callers check `typeof` before calling or route through a helper that does."
- [ ] 4.3 Add two event-type string constants next to the existing `agent.llm.started` / `agent.llm.completed` constants (find their location during implementation):
  - `AGENT_LLM_THINKING_STARTED = 'agent.llm.thinking_started'`
  - `AGENT_LLM_THINKING_COMPLETED = 'agent.llm.thinking_completed'`
  Both travel through the existing `emitProgress` path. No new method on `ObservabilityService`. No persistence-contract change. Events are written to `public.observability_events` the same way every other progress event is.
- [ ] 4.4 Implement `callLLMWithReasoning` on `OllamaLlmService` (`packages/planes/llm/fine-control/services/ollama-llm.service.ts`):
  - Build the same request body as `callLLM` but set `stream: true` on the Ollama chat endpoint.
  - Consume NDJSON response line-by-line. Each line matches `{ message: { role, content, thinking }, done, ... }`.
  - Maintain `outputBuffer`, `thinkingBuffer`, timestamps for first-thinking-chunk and first-output-chunk.
  - On the first non-empty `message.thinking`: call `observability.emitProgress(ctx, conversationId, AGENT_LLM_THINKING_STARTED, { callerName, step: '${callerName}_thinking_started' })`. Emit exactly once per call.
  - On the first non-empty `message.content` (or on `done: true` with no output ever arriving): call `observability.emitProgress(ctx, conversationId, AGENT_LLM_THINKING_COMPLETED, { callerName, step: '${callerName}_thinking_completed', durationMs })`. Emit exactly once per call.
  - On `done: true`, return an `LLMResponse` with `text = outputBuffer`, `thinkingContent = thinkingBuffer || undefined`, `thinkingDurationMs`, `thinkingTokenCount` from done-chunk metadata if available, and existing fields (`usage`, `model`, etc.) populated the same way `callLLM` populates them.
  - **Do not modify `OllamaLlmService.callLLM`** — leave it byte-for-byte unchanged. The two methods are parallel and independent; they share only private helper functions (request-shaping, auth headers, usage accounting).
  - Non-reasoning Ollama models (e.g., llama3) called via this method return normally with `thinkingContent: undefined`, no events fire, zero-cost passthrough.
- [ ] 4.5 Add the same optional `callLLMWithReasoning?` method to the forge-api `LLMHttpClientService` shim (`apps/forge/api/src/agents/shared/services/llm-http-client.service.ts`). Implementation: delegate to the underlying plane provider's method if the provider implements it; otherwise undefined (so `typeof` checks work at the capability level).

#### Database + usage persistence
- [ ] 4.6 Create a new migration file `supabase/migrations/2026xxxxxxx_llm_usage_thinking_columns.sql`:
  ```sql
  ALTER TABLE public.llm_usage
    ADD COLUMN IF NOT EXISTS thinking_content TEXT,
    ADD COLUMN IF NOT EXISTS thinking_duration_ms INTEGER,
    ADD COLUMN IF NOT EXISTS thinking_token_count INTEGER;
  ```
  Apply it to the local Supabase via `docker exec supabase_db_... psql` the same way Phase 3's migration was applied.
- [ ] 4.7 Update the existing `LLMUsageReporterService` (or wherever `llm_usage` is written today — find via grep for `llm_usage` during implementation) to persist `thinking_content`, `thinking_duration_ms`, `thinking_token_count` from `LLMResponse` when they're populated. When `undefined`, the columns stay `NULL`. This change works for **every** LLM call in the system, not just reasoning ones, because every call produces an `LLMResponse` and non-reasoning responses just have `undefined` in the new fields.

#### Shared helper
- [ ] 4.8 Add `callLLMMaybeWithReasoning(llmClient, params)` to a shared location under `apps/forge/api/src/agents/shared/services/` (alongside `LLMHttpClientService`). Signature:
  ```ts
  export async function callLLMMaybeWithReasoning(
    llmClient: LLMHttpClientService,
    params: LLMCallParams,
  ): Promise<LLMResponse> {
    if (typeof llmClient.callLLMWithReasoning === 'function') {
      return llmClient.callLLMWithReasoning(params);
    }
    return llmClient.callLLM(params);
  }
  ```
  JSDoc explains the opt-in fallthrough pattern. Any forge-api workflow (not just legal-department) can import and use this helper.

#### Legal-department wiring
- [ ] 4.9 Update each specialist node in `apps/forge/api/src/agents/legal-department/nodes/`:
  - `contract-agent.node.ts`, `compliance-agent.node.ts`, `ip-agent.node.ts`, `privacy-agent.node.ts`, `employment-agent.node.ts`, `corporate-agent.node.ts`, `litigation-agent.node.ts`, `real-estate-agent.node.ts`
  - The specialists currently call `runSpecialistOverDocuments({ ..., llmClient, ... })`. The helper internally calls `llmClient.callLLM(...)`. Update `runSpecialistOverDocument` and `runSpecialistOverDocuments` in `specialist-utils.ts` to use `callLLMMaybeWithReasoning(llmClient, ...)` instead of `llmClient.callLLM(...)` — one change in the shared runner propagates to all 8 specialists automatically.
- [ ] 4.10 Update `synthesis.node.ts` and `report-generation.node.ts` to call `callLLMMaybeWithReasoning(llmClient, ...)` instead of `llmClient.callLLM(...)` directly (these nodes don't go through the specialist runner, so they need independent one-line changes).
- [ ] 4.11 Add a `findReasoningForSpecialist(orgSlug, conversationId, callerNamePattern)` method to `LegalJobsRepository`. Uses `rawQuery` (same pattern as `recordReviewAndRequeue` and `updateDocumentPaths`) to query `public.llm_usage` where `conversation_id = $1` and `caller_name LIKE $2`, ordered by `created_at DESC` (most recent call wins), returning `{ thinking_content, thinking_duration_ms, thinking_token_count }` or `null` if no row matches. Org scoping goes through a join with `legal.agent_jobs` on `conversation_id = conversation_id AND org_slug = $3` so the query can never return reasoning from a job outside the caller's org.
- [ ] 4.12 Add a new `GET /legal-department/jobs/:id/reasoning?orgSlug=…&specialistKey=…` endpoint on `LegalJobsController`. Validates `orgSlug`, loads the job via `findByIdForOrg` (existing pattern), calls `findReasoningForSpecialist` with a caller-name pattern built from the `specialistKey` parameter (e.g., `specialistKey=contract` → pattern `legal-department:contract-agent`), returns `{ jobId, specialistKey, thinkingContent, thinkingDurationMs, thinkingTokenCount }`. If the repository returns null, respond with `404 Not Found` and a typed body so the frontend can hide the accordion. Define a shared constant for the caller-name format so specialists and this endpoint reference the same source of truth.
- [ ] 4.13 Add a lightweight `GET /legal-department/jobs/:id/reasoning?orgSlug=…` (no `specialistKey`) variant that returns `{ jobId, specialistKeys: string[] }` — a list of specialist keys that have captured reasoning for this job. The review modal calls this once on open to decide which accordions to render. Returns 200 with an empty array if nothing was captured (e.g., non-reasoning model).

#### Forge web — stage ladder reasoning/writing states
- [ ] 4.14 Find the stage ladder composable that renders ticker rows for each specialist in the Document Onboarding view (likely `useStageLadder.ts` or similar under `apps/forge/web/src/views/agents/legal-department/`). Add handlers for the two new event types (`agent.llm.thinking_started`, `agent.llm.thinking_completed`). Each event's metadata carries `callerName` / `step`; use it to route the state change to the correct row.
- [ ] 4.15 Update the stage ladder row rendering: on `thinking_started`, row enters "🧠 reasoning" state (dim text, thinking icon). On `thinking_completed`, row transitions to "✍️ writing" state (bright text, pen icon). On the existing `agent.llm.completed` event (unchanged), both states clear and the row shows "complete" the same way it does today. Non-reasoning specialists never receive either event and continue to render the existing "running" state — no fallback to a fake "reasoning" state, no uniform facelift.
- [ ] 4.16 Update the stage ladder component styles so the two new states are visually distinct from "running" and "complete" but consistent with the existing Phase 2 "chunked: N segments" ticker styling.

#### Forge web — review modal Reasoning accordion
- [ ] 4.17 Add `getReasoningForJob(jobId, orgSlug)` and `getReasoningForSpecialist(jobId, orgSlug, specialistKey)` methods to `legalJobsService.ts`. First method calls the probe endpoint; second fetches content on demand.
- [ ] 4.18 Update `LegalJobReviewModal.vue`:
  - On modal open (when `jobId` becomes defined), call `getReasoningForJob` once, store the returned `specialistKeys` array as a ref.
  - For each existing specialist card in the modal, render a collapsible `<ion-accordion>` labeled "🧠 Reasoning" **only when the specialist's key is in the `specialistKeys` array**. Hidden entirely otherwise (no empty state).
  - On accordion expand, call `getReasoningForSpecialist` for that specific specialist, show a spinner until the response arrives, then render the `thinking_content` in a scrollable `<pre>` block with a reasonable max-height (e.g., 400px) and monospace styling.
  - Expanded accordions cache their content for the life of the modal session — reopening an expanded accordion should not re-fetch.
- [ ] 4.19 Add styling for the accordion: default-collapsed appearance blends with existing specialist card styling; expanded state has a subtle background tint to distinguish reasoning from normal specialist output; max-height with vertical scroll; monospace font matching the existing JSON dumps in the modal.

#### Tests
- [ ] 4.20 **Ollama provider spec** (`packages/planes/llm/.../ollama-llm.service.spec.ts` or new file): mock the NDJSON stream with a sequence of thinking chunks followed by output chunks, assert `callLLMWithReasoning` returns the accumulated thinking + output separately, verify `observability.emitProgress` is called exactly once with each of the two event types. Include a test case with no thinking chunks (non-reasoning model) asserting `thinkingContent` is `undefined` and no events fire. Include a test case asserting the existing `callLLM` method is **byte-for-byte unchanged** by Phase 4 — it still uses `stream: false` and still returns the same shape.
- [ ] 4.21 **Helper spec** (`apps/forge/api/src/agents/shared/services/llm-http-client.service.spec.ts` or new file): assert `callLLMMaybeWithReasoning` calls `callLLMWithReasoning` when it exists on the client, and falls back to `callLLM` when it doesn't. Two tests.
- [ ] 4.22 **Specialist runner spec** (`apps/forge/api/src/agents/legal-department/nodes/specialist-utils.spec.ts`): extend to verify `runSpecialistOverDocument` and `runSpecialistOverDocuments` route through `callLLMMaybeWithReasoning`. Existing Phase 2 + Phase 3 tests still pass unchanged.
- [ ] 4.23 **Repository spec** (`apps/forge/api/src/agents/legal-department/jobs/legal-jobs.repository.spec.ts`): add tests for `findReasoningForSpecialist` — org-scoped, null when no match, returns expected shape when a match exists.
- [ ] 4.24 **Controller spec** (`apps/forge/api/src/agents/legal-department/jobs/legal-jobs.controller.spec.ts`): add tests for both new endpoints — 200 with `specialistKeys` array when probe succeeds, 200 with content when specialist key matches, 404 when specialist key doesn't match, org-scoped rejection when `orgSlug` doesn't match the job.
- [ ] 4.25 **Usage reporter spec**: if the usage reporter has an existing spec, extend to cover the new columns. If not, add minimal coverage showing the reporter correctly persists `thinking_content` when present and leaves it `NULL` when not.
- [ ] 4.26 **Forge web stage ladder spec** (composable): given a sequence of events ending in `agent.llm.thinking_started`, then `agent.llm.thinking_completed`, then `agent.llm.completed`, assert the row state transitions through reasoning → writing → complete. Given a sequence without thinking events, assert the row stays in "running" until "complete".
- [ ] 4.27 **Forge web review modal spec** (`LegalJobReviewModal.vue.spec.ts`): mock `legalJobsService.getReasoningForJob` to return 2 specialist keys; assert only those two accordions render. Mock the per-specialist fetch; assert expanding fetches on demand and renders in a `<pre>` block. Assert re-opening an already-expanded accordion does not re-fetch.
- [ ] 4.28 All existing forge-api jest (217 tests) and forge-web vitest (599 tests) must pass unchanged. No pre-existing spec should need modification beyond what these steps explicitly enumerate.

### Quality Gate

- [ ] **Lint**: `cd apps/forge/api && npm run lint` and `cd apps/forge/web && npm run lint` clean
- [ ] **Build**: `cd apps/forge/api && npm run build` and `cd apps/forge/web && npm run build` clean
- [ ] **Typecheck**: `cd apps/forge/api && npx tsc --noEmit` and `cd apps/forge/web && npx vue-tsc --noEmit` clean
- [ ] **Unit Tests**: `cd apps/forge/api && npm test` all green including new Ollama provider + helper + repository + controller + usage reporter specs; `cd apps/forge/web && npm test` all green including new stage ladder + review modal specs
- [ ] **Migration applied**: the new `llm_usage` columns exist in the local Supabase (`docker exec supabase_db_... psql -U postgres -c "\\d public.llm_usage"` shows the three new columns)
- [ ] **Curl Tests**:
  - Enqueue a single-document job with an Ollama reasoning model (Gemma 4 e4b is fine). Poll until `awaiting_review`. Query `public.llm_usage` for the job's `conversation_id` and confirm at least one row has `thinking_content` populated. Confirm `thinking_duration_ms` is a reasonable positive integer. Confirm the observability events `agent.llm.thinking_started` and `agent.llm.thinking_completed` exist in `public.observability_events` for that conversation.
  - Call `GET /legal-department/jobs/{id}/reasoning?orgSlug=…` — returns 200 with a non-empty `specialistKeys` array.
  - Call `GET /legal-department/jobs/{id}/reasoning?orgSlug=…&specialistKey=contract` — returns 200 with `thinkingContent` populated.
  - Enqueue a second job with a **non-reasoning** model (any model that doesn't produce thinking tokens — e.g., `llama3:8b` if available, otherwise a plain prompt to Gemma that wouldn't trigger reasoning). Query `public.llm_usage` and confirm `thinking_content` is NULL for that job's rows. Call the probe endpoint — expect `specialistKeys: []`.
- [ ] **Chrome Tests**:
  - Run an async job through the Document Onboarding queue with an Ollama reasoning model. Watch the stage ladder: for at least one specialist, verify the row visibly transitions through "reasoning" → "writing" → "complete" (the transitions will be ~5–20 seconds apart per specialist, depending on doc size and model speed).
  - Wait for `awaiting_review`. Open the review modal. Verify each specialist card has a collapsed "🧠 Reasoning" accordion. Expand one — verify a spinner shows briefly, then the reasoning content renders in a scrollable monospace block.
  - Collapse the accordion and reopen it — verify it does not re-fetch (no network request).
  - Run a second job where the model is non-reasoning (or the content doesn't trigger reasoning) — verify no accordion appears on any specialist card.
- [ ] **Phase Review**:
  - [ ] Existing `OllamaLlmService.callLLM` is byte-for-byte unchanged (verified by diffing against `main`)
  - [ ] No other LLM provider file (OpenAI, Grok, OpenRouter, local-llm) has been modified
  - [ ] `public.llm_usage` migration is nullable and doesn't break any existing non-legal LLM caller (verified by running a non-legal capability end-to-end — e.g., an existing marketing-swarm test)
  - [ ] ExecutionContext passed whole through every new code path — no destructuring
  - [ ] No fallbacks, no swallowed errors, no `@ts-ignore` introduced
  - [ ] Phase 4.5 commitment (wire all other providers before Phase 5) is clearly documented in the completion report and in `docs/efforts/current/intention.md`
  - [ ] Document any deviations from PRD §4

---

## Out of Scope

- Token-level live streaming
- Non-Ollama providers (Phase 4.5 commitment — must land before Phase 5 Hardening)
- Worker path changes
- HITL interrupt payload changes
- Phase 5 Hardening & Verification
- Phase 6 Forge Async Workflow Skills extraction — parked in `docs/efforts/future/forge-async-workflow-skills.md`, not started until Phase 5 lands
