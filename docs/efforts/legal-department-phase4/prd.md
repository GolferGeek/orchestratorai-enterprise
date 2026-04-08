# Legal Department Phase 4 — Reasoning Capture — PRD

## 1. Overview

This PRD covers **Phase 4 only** of the Legal Department Upgrades effort. Phases 1–3 have shipped on `main` and are archived under `docs/efforts/archive/legal-department-upgrades-phases-1-3/`. An earlier Phase 4 draft targeted token-level streaming into a live conversation window and was discarded because it solved the wrong metaphor — see `intention.md` for the reasoning.

Phase 4 captures the *thinking channel* that reasoning models (Gemma 4 today; Claude extended thinking, OpenAI o-series, and others later) produce alongside their output. The capture happens inside the LLM plane as an implementation detail of the existing buffered `callLLM` method — not as a new streaming public API — and the captured reasoning lands in three places:

1. **`public.llm_usage`** for durable, queryable audit
2. **Two coarse observability events** (`agent.llm.thinking_started` / `thinking_completed`) on the existing progress bus for live UI state transitions
3. **A collapsible "Reasoning" accordion** in the legal department review modal for post-hoc inspection

The legal department is an async job queue after Phase 3, so live token streaming into a chat window has no user value. Reviewers fire jobs off and come back; the valuable signal is "is it reasoning or writing right now" (coarse, glanceable) and "what did it reason about" (durable, inspectable on demand).

Phase 4 is **Ollama-only** by deliberate scope. A Phase 4.5 follow-up — committed in the intention doc — wires every remaining provider before Phase 5 Hardening begins.

## 2. Goals & Success Criteria

### Goals
- Reasoning tokens from Ollama reasoning models (Gemma 4 family) are captured during every `callLLM` invocation and persisted alongside the existing LLM usage telemetry.
- Reviewers see coarse "reasoning" / "writing" state transitions in the Document Onboarding stage ladder during job processing.
- Reviewers can expand a per-specialist "Reasoning" accordion in the review modal to inspect the full captured thinking content, loaded on demand from `public.llm_usage`.
- Non-reasoning models, non-Ollama providers, and the background worker path continue to behave identically to today — no new states, no new accordion, no code changes they can observe.

### Success Criteria
- `OllamaLlmService.callLLM` (the concrete implementation, not the interface — see §4.1) internally requests Ollama's streaming thinking channel via `stream: true`, accumulates thinking and output separately across the NDJSON stream, and returns a buffered `LLMResponse` containing three new optional fields: `thinkingContent?: string`, `thinkingDurationMs?: number`, `thinkingTokenCount?: number`.
- The shared `LLMResponse` type (wherever it's currently defined in `packages/planes/llm/`) gains the three optional fields. Existing consumers that don't read them are unaffected.
- `public.llm_usage` gains three nullable columns: `thinking_content TEXT`, `thinking_duration_ms INT`, `thinking_token_count INT`. The existing usage reporter persists them when present.
- `OllamaLlmService.callLLM` emits `agent.llm.thinking_started` via the observability plane's existing `emitProgress` path when the first thinking chunk arrives, and `agent.llm.thinking_completed` when the first output chunk arrives (or when the stream ends without producing output). Both events include `specialistKey` / `callerName` in their metadata so the frontend can route them to the right stage ladder row.
- Two new event type constants (`AGENT_LLM_THINKING_STARTED`, `AGENT_LLM_THINKING_COMPLETED`) are added to the shared event-type enum that `emitProgress` accepts, so existing consumers can filter on them.
- A new read endpoint `GET /legal-department/jobs/:id/reasoning?orgSlug=…&specialistKey=…` returns the thinking content for a specific specialist on a specific job, looked up by joining `legal.agent_jobs` to `public.llm_usage` on `conversation_id` filtered by `caller_name LIKE '%:{specialistKey}-agent'` (exact matching pattern TBD during implementation). Org-scoped through the existing `findByIdForOrg` pattern.
- The Forge web stage ladder composable renders `reasoning` and `writing` visual states for each specialist row when the new events arrive. Rows that never receive the events continue to show the existing "running" state.
- The Forge web `LegalJobReviewModal.vue` renders a per-specialist `<ion-accordion>` labeled "🧠 Reasoning", default-collapsed. On expand, it calls the new read endpoint and displays the returned thinking content in a scrollable pre-formatted block. If the endpoint returns empty/null for a given specialist, the accordion is hidden entirely — no empty state.
- All existing forge-api jest (217 tests) and forge-web vitest (599 tests) suites still pass.
- `npm run lint`, `npm run build`, `tsc --noEmit`, `vue-tsc --noEmit` all clean across forge api and forge web.
- ExecutionContext passed whole through every new code path.
- No fallbacks, no swallowed errors, no `@ts-ignore`.

## 3. User Stories

- **Async reviewer glance**: A reviewer has 6 document-analysis jobs in flight. They glance at the Document Onboarding queue. Four rows show "contract_agent: writing", one shows "synthesis: reasoning", one shows "awaiting_review". The reviewer opens the `awaiting_review` one first. No job is ever watched live — the stage ladder states are snapshot signals, not live streams. Non-reasoning models in one of the rows simply show "contract_agent: running", the same as today.
- **Post-hoc reasoning audit**: A reviewer opens a job in the review modal. The contract specialist has flagged a "perpetual confidentiality" clause as high-severity. The reviewer wants to understand *why*. They click the "🧠 Reasoning" accordion under the contract specialist's output. It expands, fetches the thinking content, and shows the model's step-by-step reasoning. The reviewer reads it, agrees, and approves. The reasoning content was fetched on demand from `public.llm_usage`, not shipped over the wire for every modal open.
- **Non-reasoning regression safety**: A reviewer runs a job with the capability's workhorse model configured to a non-reasoning provider (or a non-reasoning Ollama model). The job runs identically to today. No reasoning events fire. The stage ladder shows "running" → "complete" with no intermediate states. The review modal has no Reasoning accordion for any specialist. Nothing looks different.
- **Background worker unchanged**: The queued-job worker picks up an upload, runs `LegalDepartmentService.process()`, hits HITL, resumes, completes. Zero code changes in the worker. If the capability happens to be configured with an Ollama reasoning model, reasoning is captured automatically for every LLM call because capture is inside `callLLM` itself — the worker doesn't have to opt in.

## 4. Architecture

### 4.1 New sibling method: `callLLMWithReasoning`

The existing `callLLM` method on every provider — including Ollama — is **byte-for-byte unchanged**. Every existing caller in the system (marketing-swarm, cad-agent, the legal-department worker path, every other capability and every non-Ollama use) keeps running the same code path it runs today with zero visible change.

Phase 4 adds a **new sibling method** on the LLM plane's provider interface:

```ts
interface LlmService {
  callLLM(params: LLMCallParams): Promise<LLMResponse>;  // existing, unchanged
  callLLMWithReasoning?(params: LLMCallParams): Promise<LLMResponse>;  // new, optional
}
```

This matches the existing codebase convention established by `CapabilityHandler.invokeStream?(...)` — an optional sibling method that callers opt into and providers implement only when they support it. Providers that don't implement `callLLMWithReasoning` in Phase 4 (every non-Ollama provider) simply omit it; callers check `typeof llmClient.callLLMWithReasoning === 'function'` before calling it.

The forge-api `LLMHttpClientService` shim (wherever `LLMHttpClientService` lives in `apps/forge/api/src/agents/shared/services/`) gains the same optional method and delegates to the underlying plane provider. Consumers in the forge api never see the plane directly — they only see the shim, so both layers need the new method.

**Ollama provider implementation of `callLLMWithReasoning`**:

1. Build the same request body as `callLLM` but set `stream: true`.
2. POST to the Ollama `/api/chat` endpoint and consume the NDJSON response line-by-line. Each line is `{ message: { role, content, thinking }, done: boolean, ... }`.
3. Maintain three local accumulators:
   - `outputBuffer: string` — concatenation of every non-empty `message.content`
   - `thinkingBuffer: string` — concatenation of every non-empty `message.thinking`
   - `thinkingDurationMs: number` — delta between the first thinking chunk's timestamp and the first output chunk's timestamp (or the `done: true` timestamp if no output ever appears)
4. On the first thinking chunk: call `observability.emitProgress(ctx, conversationId, AGENT_LLM_THINKING_STARTED, { callerName, step: '<callerName>_thinking_started' })`. Emit exactly once per call.
5. On the first output chunk (or `done: true` with no output): call `observability.emitProgress(ctx, conversationId, AGENT_LLM_THINKING_COMPLETED, { callerName, step: '<callerName>_thinking_completed', durationMs: thinkingDurationMs })`. Emit exactly once per call.
6. When `done: true`, return a `LLMResponse` with:
   - `text: outputBuffer`
   - `thinkingContent: thinkingBuffer || undefined` (undefined if the model produced no thinking — e.g., a non-reasoning Ollama model like llama3 running through the new method)
   - `thinkingDurationMs: thinkingDurationMs || undefined`
   - `thinkingTokenCount: <from done-chunk metadata if available, else undefined>`
   - Existing fields (`usage`, `model`, etc.) populated the same way `callLLM` populates them today

**Critically**: the Ollama provider's existing `callLLM` method still uses `stream: false` and still has zero reasoning capture. The two methods are parallel and independent. A caller that uses `callLLM` against an Ollama reasoning model still discards the thinking tokens — because it explicitly chose the buffered method. Only callers that explicitly opt into `callLLMWithReasoning` get reasoning.

**Helper in `specialist-utils.ts`** to keep the opt-in clean at every call site:

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

Legal-department specialist nodes, the synthesis node, and the report-generation node all switch from `llmClient.callLLM(params)` to `callLLMMaybeWithReasoning(llmClient, params)`. That's ~10 one-line changes across the 10 LLM call sites in the legal-department code (8 specialists + synthesis + report). When the current provider is Ollama (reasoning capture supported), they get reasoning; when it's anything else (Phase 4), they fall through to the existing buffered `callLLM` path and the new columns in `llm_usage` stay NULL. Phase 4.5 turns every other provider's fall-through into a real `callLLMWithReasoning` implementation without touching any specialist code.

**Important properties**:
- Non-reasoning models that happen to be called via `callLLMWithReasoning` (e.g., someone configures `llama3` as the workhorse) return normally with `thinkingContent: undefined`. No events fire. No `llm_usage` thinking columns written. Zero-cost passthrough for the non-reasoning case.
- The existing Ollama `callLLM` code path is completely untouched. Every existing test against `callLLM` still passes without modification. Every existing caller gets the exact same behavior it got yesterday.
- The two methods share zero runtime code. They share only the request-shaping helper functions (model config, auth headers, etc.) — those are extracted to private helpers and used by both if not already.

### 4.2 `LLMResponse` type extension

Find the current `LLMResponse` type definition (probably in `packages/planes/llm/fine-control/services/llm-interfaces.ts` or similar — confirm at implementation time) and add three new optional fields:

```ts
export interface LLMResponse {
  text: string;
  // ... existing fields ...
  /** Reasoning/thinking content captured by `callLLMWithReasoning`. Always undefined for `callLLM` callers — the old method does not populate these fields. */
  thinkingContent?: string;
  /** Wall-clock duration of the thinking phase in milliseconds. Populated only by `callLLMWithReasoning`. */
  thinkingDurationMs?: number;
  /** Token count of the thinking phase, if the upstream API exposes it. Populated only by `callLLMWithReasoning`. */
  thinkingTokenCount?: number;
}
```

Every existing consumer of `LLMResponse` continues to work because the new fields are optional. No other provider file is touched in Phase 4. Only the Ollama provider's new `callLLMWithReasoning` method ever populates them.

### 4.3 `public.llm_usage` migration

A new migration adds three nullable columns to `public.llm_usage`:

```sql
ALTER TABLE public.llm_usage
  ADD COLUMN IF NOT EXISTS thinking_content TEXT,
  ADD COLUMN IF NOT EXISTS thinking_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS thinking_token_count INTEGER;
```

The existing `LLMUsageReporterService` (or wherever the `llm-usage-debug` log in the Phase 3 forge log came from) writes to this table after every LLM call. Phase 4 extends that write to persist the three new fields when the `LLMResponse` has them populated. When they're `undefined`, the columns stay `NULL`.

Per the project's migration convention (see Phase 3's completion report), migration files live outside git in `supabase/migrations/`. Phase 4's completion report will document the migration file name and SQL for operator application.

### 4.4 Observability events (two new type constants)

The existing `ObservabilityService.emitProgress(ctx, conversationId, message, metadata)` is reused — no new method on the plane interface, no persistence-contract change. Phase 4 adds two new constants to the shared event-type enum:

```ts
export const AGENT_LLM_THINKING_STARTED = 'agent.llm.thinking_started';
export const AGENT_LLM_THINKING_COMPLETED = 'agent.llm.thinking_completed';
```

The constants live wherever the existing `agent.llm.started` / `agent.llm.completed` constants live (find at implementation time). The Ollama provider passes the appropriate constant as the `message` / `step` in its `emitProgress` calls. Existing consumers that don't know about the new types simply receive them as ordinary progress events and filter them out by type; new consumers (the stage ladder composable) subscribe to them specifically.

Persistence is handled by the existing Supabase provider's `emitProgress` path — the new events are written to `public.observability_events` the same way every other progress event is. Volume is negligible: two events per LLM call, same order of magnitude as existing `agent.llm.started` / `agent.llm.completed` pairs.

### 4.5 New read endpoint

A new `GET /legal-department/jobs/:id/reasoning?orgSlug=…&specialistKey=…` endpoint on `LegalJobsController` returns the captured thinking content for a specific specialist on a specific job. Shape:

```json
{
  "jobId": "...",
  "specialistKey": "contract",
  "thinkingContent": "...",
  "thinkingDurationMs": 15320,
  "thinkingTokenCount": 847
}
```

If no reasoning was captured (specialist ran on a non-reasoning model, or the specialist never ran for this job), return `404 Not Found` with a typed body so the frontend can hide the accordion cleanly.

The implementation joins `legal.agent_jobs` to `public.llm_usage` on `conversation_id` and filters by a `caller_name` pattern matching the specialist's canonical caller string (e.g., `legal-department:contract-agent`). Exact pattern is confirmed at implementation time by reading how the existing LLM callers set `callerName` in their `callLLM` invocations. Org-scoping goes through the existing `LegalJobsRepository.findByIdForOrg` pattern so we never return reasoning for a job outside the caller's org.

### 4.6 Stage ladder reasoning/writing states

The Forge web composable that renders stage ladder rows (find at implementation time — probably `useStageLadder` or similar under `apps/forge/web/src/views/agents/legal-department/`) gains two new visual states per row:

- `reasoning` — dim text + a thinking icon (🧠) next to the specialist name, triggered by an `agent.llm.thinking_started` event for that specialist
- `writing` — bright text + a pen icon (✍️), triggered by an `agent.llm.thinking_completed` event

The composable keys events to rows by the `callerName` or `step` metadata on the event. Non-reasoning specialists never receive either event and continue to render the existing "running" state — no fallback to a fake "reasoning" state, no uniform facelift.

When a specialist completes (existing `agent.llm.completed` event), both states clear and the row shows "complete" the same way it does today.

### 4.7 Review modal Reasoning accordion

`LegalJobReviewModal.vue` gains a per-specialist collapsible section inside each existing specialist card:

```vue
<ion-accordion-group>
  <ion-accordion v-if="hasReasoning[specialistKey]">
    <ion-item slot="header">
      <ion-icon name="sparkles-outline" /> Reasoning
    </ion-item>
    <div slot="content" class="reasoning-content">
      <pre v-if="reasoning[specialistKey]">{{ reasoning[specialistKey] }}</pre>
      <ion-spinner v-else-if="loadingReasoning[specialistKey]" />
    </div>
  </ion-accordion>
</ion-accordion-group>
```

`hasReasoning[specialistKey]` is probed once per specialist when the modal opens — a lightweight `HEAD`-style check against the new read endpoint (or a single bulk endpoint that returns a list of specialist keys that have reasoning). If the endpoint returns 404 for that specialist, the accordion is hidden entirely. No empty state, no "no reasoning captured" placeholder.

On accordion expand, the component calls the read endpoint, shows a spinner until the response arrives, then renders the content in a monospace `<pre>` block. Content can be large (multiple KB of reasoning text is common for Gemma 4 on a 15-second analysis); the block is scrollable and capped at a reasonable max-height.

### 4.8 What does NOT change

- **`LlmService.callLLM` on every provider, including Ollama — byte-for-byte unchanged.** Every existing test against `callLLM` continues to pass unmodified. Every existing caller in the system (marketing-swarm, cad-agent, legal-department worker, every other capability) runs the exact same code it runs today.
- `LegalJobsWorkerService` — not touched (it calls `process()`, which calls `callLLM` under the hood, same as today)
- `LegalDepartmentService.process()` / `resumeWithDecision()` — not touched
- `runSpecialistOverDocuments` / `runSpecialistOverDocument` — not touched. The helper receives the same `llmClient` it does today; specialists pass calls through the new `callLLMMaybeWithReasoning` helper inside their own node files, not inside the shared runner.
- The HITL interrupt payload — not touched
- ExecutionContext, transport types, `/invoke` response shape — not touched
- Any non-Ollama provider service file — not touched in Phase 4. Phase 4.5 adds `callLLMWithReasoning` to each remaining provider.
- `useOutputRenderer` — not touched
- The capability handler `invokeStream` optional method — not touched

## 5. Security

No new security surface. The new read endpoint is org-scoped through the existing `findByIdForOrg` pattern — a caller cannot fetch reasoning for a job outside their own org. The reasoning content itself is model output, not user-supplied data, and is stored in the same table (`public.llm_usage`) that already holds per-call prompts and responses for existing calls, so it inherits the existing access controls.

The reasoning content can contain sensitive content (contract clauses, party names, etc.) if the model decided to include verbatim quotes in its reasoning. This is no different from the existing `agent.llm.completed` events that already carry the model's full output. No new classification is introduced.

## 6. Risks

- **Risk**: `public.llm_usage` is a shared table used by every LLM call in the system, not just legal-department. Adding three columns is a schema change that affects every writer. **Mitigation**: the columns are nullable with no default constraints, so every existing writer continues to work without modification. Only the code path that specifically reads `LLMResponse.thinkingContent` (one place: `LLMUsageReporterService.record()` after the change) knows about the new columns. Every other writer leaves them NULL.
- **Risk**: The `caller_name`-based join between `legal.agent_jobs.conversation_id` and `public.llm_usage` depends on the exact format of the caller name strings (e.g., `legal-department:contract-agent`). If those strings change, the read endpoint returns empty results. **Mitigation**: define a shared constant for the caller-name format in the legal-department service so specialists and the read endpoint both reference the same source of truth. Add a test that exercises the join.
- **Risk**: Gemma 4's reasoning can be extremely long (multiple KB per specialist per run), and persisting it in every LLM usage row could grow `public.llm_usage` storage significantly over time. **Mitigation**: accept this for Phase 4 — storage is cheap, reasoning is high-value for audit, and the rate-limiting factor is how often reviewers actually run reasoning jobs (tens to low hundreds per day, not thousands per second). If volume becomes a concern later, Phase 4.5 or a future effort can add a retention policy.
- **Risk**: Ollama reasoning model hot-swap — if a reviewer changes the capability's workhorse model from a reasoning model to a non-reasoning one mid-session, cached assumptions in the frontend might get stale. **Mitigation**: the `hasReasoning[specialistKey]` probe happens every time the modal opens, not once per session. Fresh lookup per modal = no stale cache.

## 7. Out of Scope (see intention.md for the full list)

- Token-level live streaming
- Non-Ollama providers (Phase 4.5 commitment — must land before Phase 5 Hardening)
- Worker path changes
- HITL interrupt payload changes
- Phase 5 Hardening & Verification

## 8. Phase Plan (Single Phase)

This effort is a single phase. See `plan.md` for the step-by-step.
