# Phase 4.5 — Reasoning Capture: Provider Expansion + Usage UI

## Why this phase exists

Phase 4 landed reasoning capture as a **sibling method** (`callLLMWithReasoning?`) with a shared typeof-gated helper, and wired it into the legal-department workflow. It works end to end — but only for Ollama. Every other LLM provider in the fine-control plane currently returns `undefined` from the helper and the call quietly falls through to the non-reasoning `callLLM` path.

That's fine as a staging point, but it leaves Phase 5 Hardening staring at a fractured surface: some providers capture thinking tokens, others don't, and there's no UI for anyone (operator, attorney, developer) to actually see the captured reasoning after the fact. Phase 5 cannot harden what it cannot uniformly observe.

Phase 4.5 closes both gaps **before Phase 5 starts**:

1. Every provider implements `callLLMWithReasoning` — same sibling-method contract as Ollama, same "existing `callLLM` is byte-for-byte unchanged" guarantee.
2. An admin-facing UI surfaces `public.llm_usage.thinking_content` / `thinking_duration_ms` / `thinking_token_count` so captured reasoning is actually inspectable in production.

The legal-department review modal accordion we built in Phase 4 is the attorney-facing surface. Phase 4.5's UI is the operator-facing surface — different audience, same underlying data.

## What Phase 4.5 is NOT

- **Not a refactor.** The sibling-method shape, the shared helper, the three llm_usage columns, the two observability events — all frozen. Phase 4.5 adds implementations and one new view; it does not restructure.
- **Not Phase 5.** No hardening, no retries, no observability dashboards, no cost-attribution work beyond plumbing the existing fields through. Phase 5 starts after this lands.
- **Not a generic "observability" UI.** The usage view in this phase is scoped to inspecting captured reasoning in `llm_usage`. A full LLM observability dashboard is Phase 5+ territory.
- **Not a new audit surface.** Reasoning content is already written durably by Phase 4. This phase just makes it visible.

## Goals

### 1. Provider coverage for `callLLMWithReasoning`

Every provider in `packages/planes/llm/fine-control/services/` grows an optional `callLLMWithReasoning` that returns the same `LLMResponse` shape, populated with `thinkingContent` / `thinkingDurationMs` / `thinkingTokenCount` when the underlying model emits reasoning tokens.

Providers in scope:

- **OpenAI** — uses the Responses API's `reasoning` parameter (effort + summary). Usage object reports `reasoning_tokens` separately, so this provider gets a real `thinkingTokenCount`.
- **Grok (xAI)** — has reasoning models with thinking tokens exposed via a different field than Ollama. Research first, then implement.
- **OpenRouter** — proxy provider. Forward the request with `reasoning: { effort: ... }` parameter when the upstream model supports it. When the upstream doesn't, return normally with `thinkingContent: undefined` (zero-cost passthrough, matching Ollama's non-reasoning behavior).
- **local-llm** (lm-studio / llama.cpp) — check what thinking format the local server exposes. If it's OpenAI-compatible Responses API, reuse the OpenAI parser. If it's raw streaming, write a minimal parser.
- **ollama-cloud** — same wire format as local Ollama, different base URL. Should be a near-copy of the Ollama Phase 4 implementation.

Each provider implementation ships with:
- Unit test for `callLLMWithReasoning` (happy path, empty thinking, non-reasoning model passthrough)
- Assertion that existing `callLLM` is never accidentally invoked inside `callLLMWithReasoning`
- A `git diff` phase-review confirming existing `callLLM` is byte-for-byte unchanged on that provider

### 2. Token-count derivation where the API exposes it

- **OpenAI**: populate `thinkingTokenCount` from the Responses API usage field
- **Grok**: populate if available
- **OpenRouter**: surface whatever upstream reports
- **local-llm / ollama-cloud**: likely NULL, same rationale as Phase 4 Ollama
- **Ollama (unchanged)**: stays NULL — Phase 4 already documented why

### 3. LLM Usage admin UI

A new view surfaces `public.llm_usage` rows with their captured reasoning visible. Scope:

**Data surface:**
- Filter by: org, agent_name (caller), provider, model, date range, "has reasoning" toggle
- Row columns: timestamp, caller, provider/model, tokens, duration, thinking_duration_ms, "has reasoning" badge
- Row expansion: full `thinking_content` in a scrollable monospace panel, same pattern as the legal review modal accordion

**Where it lives:** TBD during PRD phase. Candidates:
- **Admin web** — operator-facing, matches the audience (sysadmins/compliance reviewing AI cost and reasoning patterns)
- **Forge web** — developer-facing, closer to where the workflows live
- **Dedicated observability panel** — overkill for this phase

The PRD phase must pick one and justify it. Lean toward Admin web unless there's a strong reason not to.

**Endpoint:** new `GET /admin/llm-usage` (or equivalent) with pagination, filters, and per-row `thinking_content` lazy-load (same probe/fetch pattern as legal-department's reasoning endpoints). No new database tables — `public.llm_usage` already has everything.

### 4. Shared caller-name constant audit

Phase 4 introduced `apps/forge/api/src/agents/legal-department/constants/llm-event-types.ts` with the legal-specific caller-name format (`legal-department:{specialistKey}-agent`). This phase:

- Grep every other LangGraph workflow (marketing-swarm, cad-agent) for their `callerName` usage
- Confirm they follow a consistent `{workflowSlug}:{nodeName}` pattern, or move them to one if they don't
- Extract the format into a shared constant if it makes sense to do so — without forcing premature framework extraction (that's Phase 6)
- Update the Phase 4.5 admin UI's agent_name parser to handle all workflows

This is a small audit, not a refactor. If the existing workflows already follow a consistent pattern, we note it and move on.

## Quality gate

Same rigor as Phase 4:

- `npm run lint`, build, typecheck, full jest + vitest — all green
- For each provider wired: live curl test against a real reasoning model (OpenAI gpt-5 with reasoning, Grok if available, etc.), verifying:
  - `thinking_content` populated on the row
  - Observability events (`thinking_started` / `thinking_completed`) fire
  - The legal-department review modal accordion works for jobs using that provider (not just Ollama)
- Chrome test of the new admin UI: filter, expand a row, see reasoning content render
- Phase review: `git diff main -- <each-provider-service>` on the `callLLM` method must show zero changes per provider

## Follow-ups explicitly out of scope for Phase 4.5

These are Phase 5 (Hardening) or later:

- Retry logic, failure modes, cost attribution dashboards, reasoning-token budgets
- Extracting legal-department-local reasoning patterns into a shared framework (that's Phase 6)
- Cross-workflow reasoning comparison / analytics
- Redaction or PII handling of reasoning content beyond what the existing PII plane already does
- Streaming reasoning tokens over SSE to a live UI (Phase 4 explicitly moved away from streaming)

## Why this sequencing matters

Phase 5 Hardening will want to:
- Add retry logic that inspects reasoning duration to detect stuck thinking loops
- Add cost attribution that splits reasoning token costs from output costs
- Add rate limiting and budgets on reasoning tokens specifically
- Add admin-visible alerts when reasoning durations spike

None of that is possible if only Ollama captures reasoning. Phase 4.5 is the uniformity pass that makes Phase 5 even feasible. Similarly, without the admin UI, Phase 5 has no way to verify its own hardening work manually. The UI is not a nice-to-have — it's how Phase 5 operators will validate behavior during hardening.
