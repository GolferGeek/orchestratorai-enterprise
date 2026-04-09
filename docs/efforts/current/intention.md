# Compose API Auth Hardening (Phase 1 of 2)

## Starting state

Compose API is **structurally a near-twin of forge-api** for the purposes of this effort. It has its own local `apps/compose/api/src/auth/` and `apps/compose/api/src/rbac/` folders containing an in-process `JwtAuthGuard`, `RbacGuard`, `@RequirePermission`, `@Public`, and a `StreamTokenService`. The same forked-from-monolith story applies — compose and forge each carry a copy of what should eventually be one shared package.

**Controller inventory (verified via `find apps/compose/api/src -name "*.controller.ts"`)**: 19 total.

- **7 have `@UseGuards(JwtAuthGuard)`** but no `RbacGuard` and no `@RequirePermission`: `crawler-admin`, `invoke`, `rag/collections`, `rag/documents`, `rag/qa`, `rag/query`, `rbac` (rbac.controller may have method-level `@RequirePermission` like its forge-api counterpart — confirm during Phase 1). These authenticate but don't authorize.
- **1 has `@Public()` on the class**: `speech`. Keep as-is.
- **`auth/auth.controller.ts` has 10 `@UseGuards` entries** at the method level (some `JwtAuthGuard` only, some `JwtAuthGuard + RbacGuard` with `@RequirePermission` at method level). This is the auth module's own endpoints; treat as already correct like we did with forge-api.
- **10 are fully unguarded**: `analytics`, `app.controller`, `assets`, `config/feature-flag`, `customer-service`, `health`, `mcp`, `rag/internal-query`, `runners`, `system`.

The `crawler/crawler-admin.controller.ts` stays — compose has its own legitimate crawler module (as confirmed during admin-auth-hardening when we removed admin-api's orphaned copy). The runners endpoint (`runners.controller.ts`) is compose's reference for the "5 runner types" pattern (context, RAG, API, external, media) per the compose-api CLAUDE.md.

## Decision: Phase 1 = additive in-process hardening, Phase 2 = remote-auth unification (committed, not deferred)

Same structure as `docs/efforts/forge-auth-hardening/`. Phase 1 closes the security gap using compose-api's existing in-process guards — no refactor, no `packages/auth-client/` extraction, no latency regression. Phase 2 (`docs/efforts/future/compose-auth-remote-unification.md`, filed at the end of Phase 1) migrates compose-api onto the shared remote-auth package once the preconditions are met.

**Phase 2 preconditions will be the same three as forge-api Phase 2**:
1. At least one of forge/pulse/bridge has already adopted the remote pattern (triggering the natural extraction of `packages/auth-client/`)
2. Latency measurement on a representative compose workflow (a multi-runner composition chain, e.g. RAG → API → media) comparing in-process vs. a prototype remote build, with a <100ms p50 decision rule
3. `StreamTokenService` migration path chosen (same A/B/C options documented in forge-auth-remote-unification.md)

Compose-api is a **plausible first remote-auth adopter** because its workloads are less latency-sensitive than forge-api's long-running legal-department workflows (compose runners are typically single-shot: one context fetch, one RAG query, one external call). If latency measurement shows <50ms p50 impact, compose could be the second consumer (after admin-api) that triggers the `packages/auth-client/` extraction, unblocking forge-api Phase 2. This is a possibility, not a commitment — the latency measurement makes the call.

## Phase 1 — what this effort actually does

### Scope (in)

1. **Audit the real RBAC vocabulary** via the DB — confirm it's the same 18-row set as forge-api uses (it should be; both products read from the same `authz.rbac_permissions` table).
2. **Check `RbacService.hasPermission` for the array-unwrap bug** — compose-api almost certainly has its own copy of the same latent bug that auth-api and forge-api both had. Apply the same narrow 3-line fix + 3 new unit tests if present.
3. **Verify `AuthModule` and `RbacModule` are `@Global()`** so decorator additions don't require per-module import changes.
4. **Add `@Public()` to health, app, discovery (if any), and any webhook endpoints** that should stay open. Source-code comments explaining why.
5. **Add `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission(...)`** to every non-public unguarded controller. Upgrade the 7 `JwtAuthGuard`-only controllers to the full stack.
6. **Decide per-controller permissions** using compose-api's real rbac vocabulary. Expected defaults: `agents:execute` for runners/invoke, `rag:read/write/admin` for RAG controllers, `admin:settings` for system/feature-flag, `agents:execute` for mcp (MCP servers are agent infrastructure).
7. **Clean up any inline Bearer extraction** outside the canonical guard implementation. Document legitimate exceptions (e.g. rate-limiter key derivation, dual-mode handlers) as we did for forge-api.
8. **Create `apps/compose/api/src/test-utils/mock-guards.ts`** (compose-local; Phase 2 consolidates) and fix every broken controller spec via `applyAuthOverrides`.
9. **Live verification** — curl matrix against running compose-api on port 5300: no-token → 401 on protected routes, demo-user → 2xx, `/health` → 200 without header.
10. **Write `docs/efforts/future/compose-auth-remote-unification.md`** — Phase 2 intention with concrete start triggers (same three as forge-auth Phase 2 plus compose-specific latency measurement).

### Scope (out)

- **Compose-api's in-process `JwtAuthGuard` / `RbacGuard` stay untouched.** Phase 2's job to replace.
- **No `packages/auth-client/` extraction.** Phase 2.
- **No touching admin-api or forge-api.** Each product's `src/auth/` folder stays independent until Phase 2 consolidates.
- **No touching compose-api's runner logic, RAG query engine, speech service, or MCP server integration.** Pure auth-layer work.
- **No new auth-api endpoints.**
- **No touching `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`.** Boundary carried over from admin-auth + forge-auth.
- **Pulse, Bridge auth hardening** — separate efforts.
- **Crawler module changes.** Compose's crawler is legitimate; leave it alone except for adding the guard stack.

## Phase 2 start trigger (will be documented in `compose-auth-remote-unification.md`)

Phase 2 of compose-auth starts when all three are true:
1. At least two products (admin + forge/pulse/bridge) have adopted the remote-authorization pattern, OR compose itself is chosen as the second adopter (in which case this precondition is tautologically satisfied)
2. Latency measurement has been done on a representative compose workflow (multi-runner composition chain) with a <100ms p50 decision rule
3. `StreamTokenService` migration path (A: preserve; B: auth-api endpoint; C: session cookie) chosen and documented

## Done when (Phase 1)

- Every compose-api controller in `apps/compose/api/src/**/*.controller.ts` either has the full guard stack + `@RequirePermission`, OR is explicitly marked `@Public()` with a source comment, OR is an intentional exception documented in the completion report.
- `/health` returns 200 without auth.
- `/runners/*` (or the runners endpoint path) returns 401 without a token and 2xx with demo-user.
- `customer-service` (if it's a dual-mode endpoint like forge-api's) stays as a documented exception, not forced into the standard pattern.
- `npm run build` clean across compose-api and the monorepo.
- Compose-api jest tests all pass, including new spec coverage for controllers whose guard state changed.
- Live curl matrix passes (see PRD Phase 5 for concrete commands).
- `docs/efforts/future/compose-auth-remote-unification.md` exists, is reviewable, and has the three concrete preconditions documented.

## Core principles

- **No fallbacks, no cheating.** Same rule as admin-auth and forge-auth.
- **Keep the working thing working.** Don't touch controllers whose existing guard stack is correct just because we're in the neighborhood.
- **Phase 2 is committed, not aspirational.** The measure of success for Phase 1 includes the existence of a well-scoped Phase 2 intention file. If Phase 1 ships and Phase 2 is forgotten, Phase 1 was not done correctly.
- **Reuse proven patterns from admin-auth and forge-auth.** Same decorator style, same test helper shape, same curl matrix structure. Don't invent a third style.
- **No admin role seed fixes without raising them.** If compose-api's permission vocabulary needs tweaking to let demo-user pass, stop and ask — don't silently modify RBAC data.
