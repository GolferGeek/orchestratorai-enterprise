# Forge API Auth Hardening (Phase 1 of 2)

## Starting-state correction

An earlier draft of this intention assumed forge-api was like admin-api: unguarded at runtime, zero auth layer. That's wrong. Forge-api already has:

- A 256-line in-process `JwtAuthGuard` at `apps/forge/api/src/auth/guards/jwt-auth.guard.ts` that validates Bearer tokens locally via `SupabaseIdentityProvider` (the `@orchestratorai/planes/auth` `IDENTITY_PROVIDER`). It supports stream tokens, `@Public()`, and populates `request.user`.
- A 170-line local `RbacGuard` at `apps/forge/api/src/rbac/guards/rbac.guard.ts` and a local `@RequirePermission` decorator.
- **Partial guard coverage** — ~9 controllers are already wired with `@UseGuards(JwtAuthGuard)` (rbac, invoke, auth, rag/query, rag/collections, rag/qa, rag/documents, marketing, engineering). The rest (~15+) are unguarded or mis-guarded.

Forge-api is also latency-sensitive in a way admin-api isn't: agent workflows make many LLM + invoke + RAG calls per user request, and every one of them currently does a fast in-process token validation. Swapping to a remote `POST /auth/authorize` per request risks materially slowing down long-running legal-department workflows. We can't just rip out the in-process path without measuring first.

## Decision: ship this in two phases

### Phase 1 (this effort) — **Additive hardening**

Close the actual security gaps using the **existing** in-process `JwtAuthGuard` + `RbacGuard`. No remote-authorization refactor. No `packages/auth-client/` extraction. Zero latency regression. This is the small, safe, ship-this-week effort.

### Phase 2 (committed follow-up, filed immediately) — **Remote-auth unification**

Migrate forge-api's in-process guards to the remote-authorization pattern (same one admin-api uses). Extract `apps/admin/api/src/auth/` and forge-api's new consumer into `packages/auth-client/`. Requires latency measurement of the new pattern against real legal-department workloads and a decision on whether to add a short-TTL cache. This effort is **NOT optional and NOT deferred indefinitely** — it's a named, scoped, ready-to-start follow-up that gets written to `docs/efforts/future/forge-auth-remote-unification.md` as part of Phase 1's completion, so it lives alongside the other parked efforts with a concrete start trigger (see below).

## Phase 1 — what this effort actually does

### Scope (in)

1. **Audit every forge-api controller** for current auth state. Produce a complete inventory: which have `@UseGuards(JwtAuthGuard)`, which have `@UseGuards(JwtAuthGuard, RbacGuard)`, which are `@Public()`, which are unguarded.
2. **Add the guard stack to every unguarded controller** except explicitly public ones (`/health`, `.well-known/*`, the invoke discovery endpoint if it needs to be open for A2A bootstrap, anything that carries `@Public()`).
3. **~~Fix `/observability/stream`~~** — SCOPE CORRECTION: a text search for `@Sse`, `'observability/stream'`, and `ObservabilityStreamController` across `apps/` finds **no controller implementing this endpoint**. It appears only in e2e test files (`apps/auth/api/testing/test/integration/observability-sse.e2e-spec.ts`, etc.) and a doc comment in `legal-jobs.controller.ts`. The `legal-async-workspace-followups.md` item #3 appears to be referencing a planned-but-not-yet-built endpoint, or one that was removed. Dropping from Phase 1 scope; file as a separate small investigation if it's actually needed.
4. **Clean up `customer-service.controller.ts`** — remove the manual Bearer extraction in handler methods (lines ~104, 183) and the inconsistent `@UseGuards(RateLimitGuard)`-without-JwtAuthGuard pattern. Decide whether customer-service is public (webhook-style) or authed; if authed, add the guard stack; if public, add `@Public()` explicitly.
5. **Pick per-controller permissions.** Every guarded controller declares `@RequirePermission('<name>')`. Use the existing forge-api rbac permission vocabulary — do not invent new permissions in this effort.
6. **Update the forge-api controller specs** that mount guarded controllers to use a forge-api-local mock-guards helper (analogous to `apps/admin/api/src/test-utils/mock-guards.ts` but using forge-api's in-process classes). Do not try to share a helper with admin-api in this phase.
7. **Write `docs/efforts/future/forge-auth-remote-unification.md`** — the Phase 2 intention file, scoped, ready to pick up. Includes the start-trigger condition (see below).
8. **Live verification** — curl matrix against a running forge-api (port 5200): no token → 401 on protected routes, valid demo-user token → 200, `/health` → 200 without auth, `/observability/stream` properly rejects unauthed SSE subscribe attempts.

### Scope (out)

- **Forge-api's in-process `JwtAuthGuard` stays.** Not deleted, not refactored, not replaced. That's Phase 2's job.
- **No `packages/auth-client/` extraction.** Phase 2 does it, driven by forge-api becoming the second real consumer of the remote pattern.
- **No touching admin-api.** Admin-api keeps its `src/auth/` folder unchanged. Phase 2 consolidates them.
- **Compose, Pulse, Bridge auth hardening** — separate future efforts.
- **Changes to forge-api's agent workflows, capabilities, RAG collections, or LLM flows** — pure auth-layer work.
- **New auth-api endpoints** — none. `POST /auth/authorize` doesn't even get called by forge-api in this phase.
- **Touching `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`** — same rule as admin-auth-hardening: untouched.
- **Latency measurement or caching design** — that's Phase 2.

## Phase 2 start trigger (documented in Phase 2's intention file)

Phase 2 starts when **all three** of the following are true:

1. **Compose-api and pulse-api have both adopted the remote-authorization pattern.** That means `packages/auth-client/` already exists as a real shared package consumed by at least two products (admin + one of compose/pulse), and the pattern is proven on a second non-trivial product.
2. **Bridge-api has either adopted the pattern or has an explicit exception documented.** Bridge is an edge case (external A2A gateway, potentially different trust boundary); it may or may not use `packages/auth-client/`, but the decision is made and written down.
3. **Someone has run a latency measurement on a representative legal-department workflow** (from `POST /legal-department/jobs` through specialist fan-out to final synthesis) comparing in-process vs. a prototype remote-auth variant. If the remote variant adds >100ms p50 to the end-to-end flow, the cache design has to be part of Phase 2's plan. If it adds <50ms, no cache needed initially.

These aren't "nice to haves" — they're preconditions. Phase 2 does not start before they're met. But they're also not indefinite — each one is a concrete, known-how-to-do-it task with a clear owner.

## Done when (Phase 1)

- Every forge-api controller in `apps/forge/api/src/**/*.controller.ts` either has `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission(...)`, or is explicitly marked `@Public()` with a comment explaining why.
- `/health` returns 200 without any header.
- `.well-known/*` (A2A discovery) remains open.
- `/observability/stream` rejects unauthed connect attempts with 401 and rejects authed-but-under-permissioned attempts with 403.
- `customer-service.controller.ts` has no inline Bearer extraction left.
- `grep -rn "startsWith('Bearer ')" apps/forge/api/src --include="*.ts"` returns only hits inside `apps/forge/api/src/auth/` (the guard implementation itself) and `customer-service/guards/rate-limit.guard.ts` if it still needs to parse tokens for rate-limit keying (document why if so).
- `npm run build` clean across forge-api and the monorepo.
- Forge-api jest specs all pass, including new spec coverage for the controllers whose guard state changed.
- Live curl matrix passes (see PRD Phase 5 for specifics).
- `docs/efforts/future/forge-auth-remote-unification.md` exists and is reviewed by the user as a real, ready-to-pick-up follow-up — not a placeholder.

## Core principles

- **No fallbacks, no cheating.** Same as admin-auth-hardening: guards throw specific Nest exceptions, no silent allows.
- **Keep the working thing working.** Don't touch controllers whose existing guard stack is correct just because we're in the neighborhood. Minimize blast radius.
- **Phase 2 is committed, not aspirational.** The measure of success for Phase 1 includes the existence of a well-scoped Phase 2 intention file with concrete start triggers. If Phase 1 ships and Phase 2 is forgotten, Phase 1 was not done correctly.
- **No new auth patterns invented in this effort.** Use forge-api's existing `JwtAuthGuard`, `RbacGuard`, `@RequirePermission`, `@Public`. Don't create a third style.
