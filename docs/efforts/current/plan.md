# Legal Department Phase 4 — Streaming Support — Plan

**Effort**: Streaming for the legal-department capability foreground path
**PRD**: `docs/efforts/current/prd.md`
**Intention**: `docs/efforts/current/intention.md`
**Branch (when started)**: `effort/legal-department-phase4`
**Prior phases**: archived under `docs/efforts/archive/legal-department-upgrades-phases-1-3/`

## Progress Tracker

- [ ] Phase 4: Streaming Support

---

## Phase 4: Streaming Support
**Status**: Not Started
**Objective**: Stream specialist/synthesis/report LLM tokens through Forge `/invoke/stream` into the conversation window without changing the queued-job worker path or the non-streaming `/invoke` response shape.

### Steps
- [ ] 4.1 Add `LegalDepartmentService.invokeStream(params): AsyncIterable<StreamChunk>` that runs the same compiled graph as `process()` but with streaming-enabled LLM calls. Listens to `observability.streamChunks$` (or equivalent) filtered by `conversationId` and yields `{ specialistKey, chunkIndex, text }` chunks in order. Final state still flows through the same return path so HITL interrupts and the buffered final result still work.
- [ ] 4.2 Register the streaming path in the Forge capability registry entry for `legal-department` so `POST /invoke/stream` dispatches to `invokeStream`. The non-streaming entry is unchanged.
- [ ] 4.3 Extend `SpecialistRunDocumentsOptions` in `nodes/specialist-utils.ts` with an optional `onToken(chunk: { specialistKey, chunkIndex, text }): void` field. When provided, `runSpecialistOverDocuments` (and the underlying `runSpecialistOverDocument` single-doc path) switches every `llmClient.callLLM(...)` call to `llmClient.callLLMStream(...)` and forwards each yielded chunk through `onToken`. The accumulated full text is parsed the same way; merge / fan-out / chunked logic is unchanged.
- [ ] 4.4 Add `emitStreamChunk(ctx, conversationId, payload)` to the **shared `ObservabilityService` interface** in `packages/planes/observability/src/` (NOT a product-local extension). Implement it in every existing provider:
  - **Supabase provider**: write to the in-process bus (so `/observability/stream` consumers see chunks live), do **not** insert into `public.observability_events` — chunks are bus-only by contract.
  - **Console provider**: log to console, no persistence.
  - Document the bus-only / no-persistence contract on the interface JSDoc so future provider implementations (Azure App Insights, GCP Cloud Logging) honor it.
  - Event payload: `{ type: 'stream_chunk', specialistKey, chunkIndex, text, conversationId, orgSlug, userId }`.
- [ ] 4.5 Wire each specialist node to pass an `onToken` to `runSpecialistOverDocuments` that calls `observability.emitStreamChunk(ctx, ctx.conversationId, { specialistKey: '<contract|compliance|...>', chunkIndex, text })`. The synthesis and report nodes get the same treatment via a sibling `runStreamingLLM` helper (or equivalent) so all three node families emit chunks.
- [ ] 4.6 Forge web `useOutputRenderer` composable: register a handler for `stream_chunk` events that maintains an in-memory `Map<specialistKey, string>` and re-renders the corresponding panel on each append. Existing event types are unaffected.
- [ ] 4.7 Legal conversation view: subscribe to the conversation's SSE stream as today; consume `stream_chunk` events through `useOutputRenderer`. Stage ladder tickers for each specialist row show running token counts derived from the streamed chunks.
- [ ] 4.8 Confirm `LegalJobsWorkerService` continues to call `LegalDepartmentService.process()` only — never `invokeStream`. Add a regression spec asserting this.
- [ ] 4.9 Tests:
  - `legal-department.service.spec.ts` — `invokeStream` yields chunks in order and reaches the same final state as `process()` for an equivalent input
  - `nodes/specialist-utils.spec.ts` — `runSpecialistOverDocuments` `onToken` callback fires for each chunk; multi-document fan-out still merges; non-streaming path (no `onToken`) is unchanged
  - `apps/forge/web/.../useOutputRenderer.spec.ts` — merges `stream_chunk` events keyed by `specialistKey` into the conversation window
  - `jobs/legal-jobs-worker.service.spec.ts` — worker still calls `process()`, never `invokeStream`
  - All existing forge-api jest specs still pass unchanged
  - All existing forge-web vitest specs still pass unchanged

### Quality Gate
- [ ] **Lint**: `cd apps/forge/api && npm run lint` and `cd apps/forge/web && npm run lint` clean
- [ ] **Build**: `cd apps/forge/api && npm run build` and `cd apps/forge/web && npm run build` clean
- [ ] **Typecheck**: `cd apps/forge/api && npx tsc --noEmit` and `cd apps/forge/web && npx vue-tsc --noEmit` clean
- [ ] **Unit Tests**: `cd apps/forge/api && npm test -- --testPathPattern=legal-department` all green; `cd apps/forge/web && npm test` all green
- [ ] **Curl Tests**:
  - `curl -N -X POST http://localhost:5200/invoke/stream -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":"1","method":"invoke","params":{"context":{"orgSlug":"engineering","userId":"<uuid>","conversationId":"<uuid>","agentSlug":"legal-department","agentType":"langgraph","provider":"ollama","model":"gemma2:2b"},"data":{"content":"Analyze this NDA: ..."}}}'` → SSE stream containing multiple `stream_chunk` events arriving within ~3s of the first specialist LLM call
  - `POST /invoke` (non-streaming) with the same payload → buffered response identical in content to today's behavior
- [ ] **Chrome Tests**:
  - Open the Legal conversation view, run a foreground analysis; specialist text appears token-by-token in the conversation window
  - Stage ladder tickers update with running token counts per specialist
  - Queued-job path (Document Onboarding upload + background worker) still works the same — no streaming, no behavior change
- [ ] **Phase Review**:
  - [ ] Streaming path demonstrably emits tokens progressively (verified in Chrome and via curl SSE)
  - [ ] Non-streaming `/invoke` callers unaffected (curl regression)
  - [ ] Worker path unchanged (regression spec + Chrome upload run)
  - [ ] ExecutionContext still passed whole through the streaming path — no destructuring
  - [ ] No fallbacks, no swallowed errors, no `@ts-ignore` introduced
  - [ ] `emitStreamChunk` lives in the shared observability plane interface, not in a product-local wrapper
  - [ ] Supabase provider does NOT persist `stream_chunk` events to `public.observability_events`
  - [ ] Document any deviations from PRD §4

---

## Out of Scope

- Phase 5 (Hardening & Verification) — promoted into `current/` after Phase 4 lands
- Streaming for queued background jobs
- Frontend UX polish beyond the conversation-renderer merge
