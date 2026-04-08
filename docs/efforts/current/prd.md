# Legal Department Phase 4 — Streaming Support — PRD

## 1. Overview

This PRD covers **Phase 4 only** of the Legal Department Upgrades effort. Phases 1–3 (HITL, Input Size Limits, Multi-Document Support) have shipped on `main` and are archived under `docs/efforts/archive/legal-department-upgrades-phases-1-3/`.

The legal department workflow currently has no token-level streaming. A foreground `POST /invoke` request against the `legal-department` capability is a buffered RPC: the user waits 60+ seconds and then sees the entire response at once, even though the underlying LLM calls support token-by-token streaming and Forge already exposes `/invoke/stream` for streaming capabilities like marketing-swarm.

Phase 4 wires the existing streaming infrastructure through the legal department's specialist, synthesis, and report nodes so the Forge web conversation window can render progressive output during a foreground analysis. The background worker path (`LegalJobsWorkerService`) is intentionally **not** changed — queued jobs are an asynchronous concern that already surfaces progress via node-level SSE events; token streaming is a foreground conversation feature.

## 2. Goals & Success Criteria

### Goals
- A foreground legal-department analysis streams specialist, synthesis, and report tokens to the Forge web conversation window as they are produced by the LLM.
- The non-streaming `/invoke` path is unchanged in behavior (still returns the same fully-buffered response).
- The background worker path is unchanged (queued jobs still run through `process()`).

### Success Criteria
- `LegalDepartmentService.invokeStream(params): AsyncIterable<StreamChunk>` exists and routes through the same compiled graph as `process()`, but with streaming enabled on every LLM call.
- The Forge capability registry entry for `legal-department` dispatches `POST /invoke/stream` to `invokeStream`.
- `runSpecialistOverDocuments` accepts an optional `onToken(chunk)` callback; when provided, it switches to `LLMHttpClientService.callLLMStream` and emits each token chunk via observability as `{ type: 'stream_chunk', specialistKey, chunkIndex, text }`.
- The Forge web `useOutputRenderer` composable merges `stream_chunk` events keyed by `specialistKey` into the conversation window progressively.
- The legal conversation view's stage ladder shows running token counts per specialist.
- All existing forge-api jest + forge-web vitest tests still pass.
- ExecutionContext is passed whole through the streaming path (no destructuring).
- No fallbacks, no swallowed errors, no `@ts-ignore`.

## 3. User Stories

- **Foreground analysis with progressive output**: A user opens the Legal conversation, drops a contract in, and within a few seconds sees the contract specialist's analysis appearing token-by-token. The synthesis and report follow in the same conversation thread, also progressively. The total wall-clock time is the same as before, but perceived latency is dramatically lower because output starts arriving almost immediately.
- **Queued-job upload (unchanged)**: A user uploads documents through the Document Onboarding modal (Phase 3 path). The job goes into the worker queue, runs through `process()` non-streaming, hits HITL, and surfaces in the review modal exactly as it does today. No streaming behavior here — it's a background job.
- **Legacy `/invoke` callers (unchanged)**: Any caller hitting the non-streaming `POST /invoke` endpoint for the `legal-department` capability still gets a single buffered JSON response. They should see no behavior change.

## 4. Architecture

### 4.1 LegalDepartmentService.invokeStream

`invokeStream(params): AsyncIterable<StreamChunk>` builds the same initial state as `process()`, invokes the same compiled graph, and returns an async iterable of stream chunks. Internally:

1. Sets a per-invocation flag (or passes a streaming-enabled `LLMHttpClientService` shim) so specialist/synthesis/report nodes know to call `callLLMStream` instead of `callLLM`.
2. The chunks come out of `observability.emitStreamChunk` calls inside the nodes; `invokeStream` listens to that bus filtered by `conversationId` and yields them in order.
3. Final state still flows through the existing return path so HITL interrupts and final report still work; the difference is purely that intermediate LLM tokens are now visible during execution.

### 4.2 runSpecialistOverDocuments onToken

The Phase 3 helper is extended with one optional field on `SpecialistRunDocumentsOptions`:

```ts
onToken?: (chunk: { specialistKey: string; chunkIndex: number; text: string }) => void;
```

When `onToken` is provided, the helper:
- Switches every `llmClient.callLLM(...)` call to `llmClient.callLLMStream(...)`
- For each token chunk yielded by the stream, calls `onToken({ specialistKey, chunkIndex, text })`
- Accumulates the full text across chunks and parses the result the same way as the buffered path
- Returns the same `SpecialistRunResult<T>` shape — the only difference is the side-effect of having streamed chunks during execution

The merge logic, chunking, and per-document fan-out from Phase 3 are unchanged.

### 4.3 ObservabilityService.emitStreamChunk

A new method on the legal-department's local observability wrapper (or on the shared plane if it already exists) that writes `{ type: 'stream_chunk', specialistKey, chunkIndex, text, conversationId, orgSlug, userId }` onto the SSE bus. The existing `/observability/stream` endpoint is the consumer; clients filtering on `conversationId` will pick the chunks up automatically.

### 4.4 Forge web conversation renderer

`useOutputRenderer` (forge-web composable) gains a handler for `stream_chunk` events:
- Maintains an in-memory map of `specialistKey → accumulated text`
- On each chunk, appends `text` to the corresponding entry and re-renders that specialist's panel
- The legal conversation view subscribes to the conversation's SSE stream as it does today; it just gets new event types it didn't see before

The stage ladder ticker rows (already rendered for Phase 2 chunked progress) gain a token count derived from the streamed chunks.

### 4.5 What does NOT change

- `LegalJobsWorkerService` — still calls `process()` (non-streaming). Queued jobs are not foreground conversations.
- The HITL interrupt payload — still `{ specialistOutputs, synthesis, documentsSummary }` from Phase 3.
- ExecutionContext shape, transport types, the `/invoke` response shape.
- Any specialist's parsing or merge logic.

## 5. Security

No new security surface. The streaming path uses the same `ExecutionContext` capsule, the same SSE filtering by `conversationId`, and the same JWT validation flow as the non-streaming `/invoke` endpoint.

## 6. Risks

- **Risk**: Specialist outputs are JSON, and JSON is hard to render progressively. **Mitigation**: stream the *raw text* of the LLM response into the renderer, not the parsed JSON. The conversation window renders the raw stream as it arrives; the parsed structured output is the final result on completion. The reviewer/user sees both progressively.
- **Risk**: Multi-document fan-out (Phase 3) means a single specialist can issue 3+ LLM calls per run. **Mitigation**: tag every chunk with `specialistKey` plus a `chunkIndex` so the renderer can group them. The renderer concatenates by `specialistKey`; the per-document boundaries are visible to the reviewer through Phase 3's per-doc tabs in the review modal, not in the live stream.
- **Risk**: Background worker accidentally picks up the streaming path and tries to write to a non-existent SSE consumer. **Mitigation**: `invokeStream` and `process()` are explicitly different methods; the worker only calls `process()`. The Phase 4 plan includes a regression spec for this.

## 7. Out of Scope

- Background worker streaming
- Streaming the queued-job upload path
- Any UI polish beyond the conversation-renderer merge
- Phase 5 (Hardening & Verification) — that's the next effort after Phase 4 lands

## 8. Phase Plan (Single Phase)

This effort is a single phase. See `plan.md` for the step-by-step.
