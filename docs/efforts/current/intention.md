# Effort: Legal Department Phase 4 — Streaming Support

Phases 1–3 of the Legal Department Upgrades effort have shipped (PRs #2, #4, #5 on `main`):
- Phase 1: production HITL via `interrupt()`/`resume()`
- Phase 2: input size limits + chunked specialists
- Phase 3: multi-document support (parallel metadata extraction, multi-doc fan-out, per-document review tabs)

Full archive of phases 1–3 lives at `docs/efforts/archive/legal-department-upgrades-phases-1-3/`.

This effort scopes down to **Phase 4: Streaming Support** only. Phase 5 (Hardening & Verification) will be promoted into `current/` when Phase 4 lands.

---

## Current State

The legal department workflow makes 10+ LLM calls sequentially per job — metadata extraction, CLO routing, 3–8 specialists (each potentially fanning out across multiple documents now that Phase 3 is in), synthesis, and report generation. Total foreground latency exceeds 60s on real documents with no progressive output to the user. Progress events fire via SSE at the node-transition level, but the actual specialist text only arrives at the end of each node.

The infrastructure to fix this already exists:
- `LLMHttpClientService.callLLMStream` exposes token-level streaming over the LLM plane
- Forge's `/invoke/stream` endpoint already speaks SSE for streaming capabilities
- The marketing-swarm capability already streams; legal-department was deferred until the rest of the workflow stabilized

What's missing is the wiring inside `legal-department.service.ts`, the chunked specialist helper, the observability event for stream chunks, and the Forge web conversation renderer's per-specialist merge logic.

## What's Needed

- `LegalDepartmentService.invokeStream(params): AsyncIterable<StreamChunk>` — runs the graph with streaming-enabled specialist/synthesis/report nodes.
- The Forge capability registry entry for `legal-department` routes `POST /invoke/stream` to `invokeStream`.
- `runSpecialistOverDocuments` accepts an optional `onToken(chunk)` callback. When present, it uses `LLMHttpClientService.callLLMStream` and forwards each chunk as `{ specialistKey, chunkIndex, text }` via observability.
- A new `ObservabilityService.emitStreamChunk` (product-local extension if not already in the shared plane) writes `{ type: 'stream_chunk', specialistKey, chunkIndex, text }` onto the SSE bus.
- Forge web `useOutputRenderer` merges `stream_chunk` events keyed by `specialistKey` into the conversation window progressively.
- Legal conversation view subscribes to the new event type; stage ladder tickers show running token counts per specialist.
- The background worker (`LegalJobsWorkerService`) keeps using the non-streaming path — queued jobs are not a streaming-conversation concern.

## Out of Scope (Phase 4)

- Streaming for the queued-job path. Queued jobs already update progress through SSE node events; that's a separate concern from token-level streaming into a conversation window.
- Frontend UX polish beyond the conversation-renderer merge (animations, scrollback, etc.) — those land in Phase 5 hardening.
- Any change to ExecutionContext, transport types, or the HITL interrupt payload.

## Done When

- Foreground `POST /invoke/stream` against the `legal-department` capability shows specialist text appearing token-by-token in the Forge web conversation window during specialist execution.
- Non-streaming `POST /invoke` against the same capability still returns the same fully-buffered response it did before (no behavior regression).
- The background worker path is unchanged: queued jobs run through `process()`, not `invokeStream`.
- ExecutionContext is still passed whole through the streaming path.
- All existing forge-api jest + forge-web vitest tests still pass; new specs cover streaming paths.

## Dependencies

- LLM plane streaming (`callLLMStream`) — already available
- Forge `/invoke/stream` SSE endpoint — already wired for marketing-swarm
- Phase 3's `runSpecialistOverDocuments` helper — landed on `main` in PR #5
