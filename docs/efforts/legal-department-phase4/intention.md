# Effort: Legal Department Phase 4 — Reasoning Capture

Phases 1–3 of the Legal Department Upgrades effort have shipped on `main` (PRs #2, #4, #5):
- Phase 1: production HITL via `interrupt()`/`resume()`
- Phase 2: input size limits + chunked specialists
- Phase 3: multi-document support (parallel metadata extraction, multi-doc fan-out, per-document review tabs)

Full archive of phases 1–3 lives at `docs/efforts/archive/legal-department-upgrades-phases-1-3/`.

This effort is **Phase 4 — Reasoning Capture**. An earlier draft of Phase 4 targeted token-level streaming into a live conversation window; that draft is set aside (`_old_streaming_*.md` in this directory) and, if anything, becomes a future effort for a synchronous-chat product like Compose. It is not the right fit for the legal department because the legal department is no longer a synchronous chat experience — Phases 1–3 deliberately turned it into an async job queue.

---

## Why the metaphor matters

The legal department workflow, after Phase 3, is a queue. A reviewer fires off one or more document analyses, walks away, and comes back when a job needs attention or is complete. The Document Onboarding view is literally a list of rows with statuses like `queued`, `processing`, `awaiting_review`, and `completed`, and the normal interaction pattern is "glance at the queue, open the ones that need me, review, move on." There is no user waiting at a chat window watching a cursor blink.

Token-level streaming is a UX optimization for exactly the thing this workflow stopped being. A reviewer who isn't at the screen gains nothing from seeing 50 thinking tokens per second fly past. The stage ladder tickers that already exist (from Phases 1–3) — `contract_agent: 40%`, `chunked: 3 segments`, `awaiting_review: 85%` — are already the right granularity for the queue metaphor.

What the workflow *is* missing, and what this phase adds, is visibility into a new kind of signal that Gemma 4 (and other reasoning models) produce: **separate thinking tokens that represent the model's reasoning before it commits to an answer.** Today those tokens are silently discarded — we call `llm.callLLM`, it returns the final output, and the reasoning the model did in between is gone. Phase 4 captures that reasoning and exposes it in two ways:

1. **A coarse live signal in the queue** — so a reviewer glancing at the Document Onboarding view can see that a job is currently in its "reasoning" phase versus its "writing" phase versus waiting on them. Two new discrete states, not a live token stream.
2. **A durable post-hoc audit** — so a reviewer who opens a job in HITL and wants to know *why* the contract specialist flagged a particular clause can expand a collapsible "Reasoning" accordion and see the full thinking content for that specialist. The content lives in the `llm_usage` table, not a fire-and-forget SSE stream.

Both paths match the async metaphor. Neither requires a user to be at the screen at the moment the model is reasoning.

## Current State

- `LLMHttpClientService.callLLM` returns the final output string only. Reasoning models that produce thinking tokens (Gemma 4, future Claude with extended thinking, o1/o3, etc.) have their reasoning discarded before the response ever reaches a capability.
- The Ollama provider hardcodes `stream: false` on every call, which means we're not even asking Ollama to send the thinking channel back — it's being filtered at the upstream API layer.
- `public.llm_usage` records per-call telemetry (provider, model, token counts, duration, conversationId, etc.) but has no columns for reasoning content, reasoning duration, or reasoning token count.
- The observability plane has `emitProgress`, `emitStarted`, `emitCompleted`, `emitFailed`, etc., but nothing that captures "the model switched from reasoning to writing."
- The legal department stage ladder shows progress percentages and step labels, but no reasoning/writing state distinction.
- The review modal shows specialist outputs and synthesis, but no way to see the reasoning behind them.

## What We Want

- **LLM plane (Ollama first)**: internally requests Ollama's streaming thinking channel, accumulates thinking and output separately across the stream, and returns a *buffered* `LLMResponse` at the end — same shape as today, plus three new optional fields: `thinkingContent?: string`, `thinkingDurationMs?: number`, `thinkingTokenCount?: number`. Non-reasoning models and every other provider return `undefined` for those fields and are otherwise unchanged. **This is not a streaming public API.** The plane still exposes a buffered method. Streaming is purely an internal implementation detail so the provider can separate the thinking channel from the output channel.
- **`public.llm_usage` table**: three new nullable columns — `thinking_content TEXT`, `thinking_duration_ms INT`, `thinking_token_count INT`. The existing usage reporter persists them when present. Null for every call that didn't produce reasoning, which is fine because the columns are nullable.
- **Observability plane**: two new low-frequency event types emitted via the existing `emitProgress` path (no new interface method, no persistence contract change):
  - `agent.llm.thinking_started` — fires once when the Ollama provider detects the thinking channel has opened on an LLM call
  - `agent.llm.thinking_completed` — fires once when the provider sees the model switch to output tokens
  - Two events per LLM call, not thousands. Durable, same shape as existing progress events.
- **Legal department stage ladder**: ticker rows for each specialist gain two new visual states — "🧠 reasoning" and "✍️ writing" — rendered only when the coarse events arrive. Non-reasoning models never get these states; they continue to show the existing "running" indicator. This is additive visibility, not a uniform facelift.
- **Legal department review modal**: per-specialist collapsible "🧠 Reasoning" accordion, default-collapsed. On expand, fetches the thinking content from a new read endpoint that queries `llm_usage` scoped to the job's conversation ID and the specialist's key. If no reasoning was captured for that specialist (because the call used a non-reasoning model), the accordion is hidden entirely — no empty state.
- **New read endpoint**: `GET /legal-department/jobs/:id/reasoning?orgSlug=…&specialistKey=…` returns the thinking content for a specific specialist on a specific job. Org-scoped via the existing repository pattern.

## Out of Scope

- **Token-level live streaming.** No `callLLMStream` method on the LLM plane, no `emitStreamChunk` on the observability plane, no per-provider state machines for inline `<think>` tags, no changes to `useOutputRenderer`. If Compose or another synchronous product wants live streaming later, it's a separate effort.
- **Non-Ollama providers.** OpenAI o1/o3, Claude extended thinking, Grok, OpenRouter, local-llm — their `callLLM` implementations are untouched in this phase. They continue to return the existing buffered response without reasoning fields. The shape is additive, so the deferred providers are interoperable with the new fields (they just always return `undefined` for them).

  **Commitment**: immediately after Phase 4 lands, a Phase 4.5 effort wires reasoning capture into every remaining provider. Phase 4.5 must land before Phase 5 (Hardening & Verification). The intention of isolating Ollama in Phase 4 is to get the end-to-end pattern proven against a real reasoning model we already run, not to defer non-Ollama providers indefinitely. See the "Done When" criteria for Phase 4.5 (to be written when Phase 4 lands): every provider in `packages/planes/llm/` exposes the same `{thinkingContent, thinkingDurationMs, thinkingTokenCount}` fields when its upstream API supports them, tested against each real upstream where credentials are available and mocked responses otherwise.
- **The background worker path** (`LegalJobsWorkerService`): already uses `callLLM`. After Phase 4, it gets reasoning captured for free on any LLM call that happens to use an Ollama reasoning model, because the capture is inside `callLLM` itself. No code changes in the worker.
- **Changes to the HITL interrupt payload**, transport types, ExecutionContext, or any existing observability event shape. Phase 4 is purely additive.
- **Phase 5 (Hardening & Verification)** — that's the effort promoted into `current/` after Phase 4 lands.

## Done When

- A legal-department job run through a reasoning model (Gemma 4) captures thinking content and persists it to `llm_usage` for every specialist that used that model.
- The stage ladder in the Document Onboarding view shows "reasoning" and "writing" state transitions for each specialist while the job is processing.
- The review modal shows a collapsible "Reasoning" accordion per specialist; expanding it fetches and displays the captured thinking content.
- A legal-department job run through a non-reasoning model (or a provider that hasn't been wired yet) looks exactly like it does today — no new stage states, no accordion, no errors, no behavior regression.
- All existing forge-api jest + forge-web vitest tests still pass.
- `tsc --noEmit` and `vue-tsc --noEmit` clean.
- ExecutionContext passed whole through every new code path.
- No fallbacks, no swallowed errors, no `@ts-ignore`.

## Dependencies

- Ollama running locally with a reasoning model (Gemma 4 family) installed and reachable from the forge API — confirmed working in this tree.
- `public.llm_usage` table and `LLMUsageReporterService` already exist — Phase 4 only adds columns.
- The observability plane's `emitProgress` method already exists — Phase 4 only adds two new event type constants that flow through it.
- Phase 3's `runSpecialistOverDocuments` helper — unchanged by this phase; reasoning capture is inside `callLLM`, one layer down.
