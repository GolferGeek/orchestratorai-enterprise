# Compose API Auth Hardening — Phase 2: Remote-Auth Unification

**Status**: Parked — committed follow-up to compose-api Phase 1 auth hardening. Do not start until preconditions are met.

## Starting state

Phase 1 landed in-process hardening using compose-api's existing `JwtAuthGuard` and `RbacGuard`. 11 controllers carry the full guard stack (`@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission(...)`): invoke, runners, rag/collections, rag/documents, rag/query, rag/qa, crawler-admin, mcp, config/feature-flag, system, and speech. 5 controllers are explicitly `@Public()`: app (root), health, analytics, assets (public streams), and rag/internal-query. 3 are intentional exceptions: auth (issues tokens — cannot require one), rbac (permission bootstrap — documented exception), and customer-service (dual-mode `GuestSession` + `Bearer` handling).

Token validation is in-process via `SupabaseIdentityProvider.validateToken()`, not remote to auth-api. Permission evaluation is in-process via `RbacService.hasPermission()`. No HTTP calls to auth-api on the per-request critical path.

Admin-api (merged earlier) uses the **remote-authorization** pattern: its local `src/auth/` folder contains a thin `AuthClient` that makes a single `POST /auth/authorize` call to auth-api per request, with the in-process auth layer deleted. That is the target pattern. Phase 2 migrates compose-api onto it.

## Why this is Phase 2, not Phase 1

Three reasons, consistent with the forge-api Phase 2 rationale:

1. **Latency risk is real and unmeasured.** Compose-api's workloads are single-shot composable runners (context, RAG, API, external, media), and multi-runner composition chains can stack several runners in sequence (e.g., context -> RAG -> API). Per-request +1 HTTP hop to auth-api on each runner invocation could add measurable overhead. Without measurement, we cannot commit to the remote pattern.
2. **`packages/auth-client/` doesn't exist yet.** Admin-api's `src/auth/` folder is the reference implementation, but it is still admin-api-local. Extracting it with only one consumer is the "framework-first" anti-pattern the monorepo deliberately avoids. The extraction should happen naturally when the second product needs it.
3. **StreamTokenService support is unsolved.** Compose-api's in-process `JwtAuthGuard` has a side channel for stream tokens (SSE authentication via `StreamTokenService` without Bearer headers). The remote `POST /auth/authorize` endpoint does not handle stream tokens. Phase 2 has to design and implement the stream-token equivalent in the remote pattern.

However, compose-api is actually a plausible **first remote-auth adopter** (after admin-api) because its workloads are single-shot and less latency-sensitive than forge-api's long-running legal-department workflows. This is discussed further in the note at the end.

## Preconditions (all three must be true)

**Phase 2 does not start until ALL of these are met.**

### 1. At least one other product has adopted the remote pattern, OR compose itself is chosen as the second adopter

- Either: admin-api + at least one of forge/pulse/bridge already consumes `packages/auth-client/`, proving the pattern on a non-trivial second consumer.
- Or: compose-api is explicitly chosen as the second adopter, which triggers the `packages/auth-client/` extraction from admin-api's local implementation. In this case, compose-api Phase 2 includes the extraction work and becomes the effort that unblocks all subsequent products.

### 2. Latency measurement on a representative compose workflow

- **Workload**: a multi-runner composition chain exercising context -> RAG -> API runners in sequence, representative of a real compose-api invocation. Median time across 10 runs.
- **Comparison**: baseline (current in-process auth) vs. a prototype build of compose-api using `packages/auth-client/` for every guard call.
- **Decision rule**:
  - If remote-auth adds **<50ms p50** to end-to-end chain time: proceed without caching in Phase 2.
  - If remote-auth adds **50-100ms p50**: proceed with caching as a Phase 2 task (short-TTL LRU in `AuthClient` keyed by `{token-hash, permission, orgSlug}`, TTL ~30s, max ~10k entries).
  - If remote-auth adds **>100ms p50**: stop. Fix the latency first (e.g., auth-api co-location, HTTP/2 connection reuse, batched authorize calls). Phase 2 does not start until a tractable path is documented.
- Measurement must be committed as a markdown file in `docs/efforts/future/compose-auth-remote-unification-latency-measurement.md` before Phase 2 starts.

### 3. StreamTokenService decision made and documented

Compose-api supports SSE authentication via `StreamTokenService` (`apps/compose/api/src/auth/services/stream-token.service.ts`): a JWT-signed token embedded in the URL query for SSE connections. The in-process `JwtAuthGuard` recognizes this and routes to `StreamTokenService.verify()` instead of the normal Bearer path.

The remote-authorization pattern has no equivalent. Phase 2 must pick one of:

- **A. Preserve in-process stream tokens**: keep a thin in-process guard for SSE-only routes; use remote auth for everything else. Two guards in the codebase, different scopes. Simple but splits the pattern.
- **B. Add stream-token validation to auth-api**: new endpoint `POST /auth/validate-stream-token`. Compose-api's `AuthClient` gets a second method. Consistent pattern but bigger auth-api change.
- **C. Replace stream tokens with a session cookie**: refactor SSE endpoints to use an HTTP-only cookie set by `POST /auth/login`. Biggest change, cleanest long-term, but touches compose-web too.

The decision must be made and documented before Phase 2 starts. This decision is shared with forge-api Phase 2 — whichever product goes first sets the precedent.

## Scope

Once preconditions are met, Phase 2 does the following:

### Delete in-process compose-api auth infrastructure

- Delete `apps/compose/api/src/auth/guards/jwt-auth.guard.ts`
- Delete `apps/compose/api/src/rbac/guards/rbac.guard.ts`
- Delete `apps/compose/api/src/auth/decorators/public.decorator.ts`
- Delete `apps/compose/api/src/auth/decorators/roles.decorator.ts`
- Delete `apps/compose/api/src/rbac/decorators/require-permission.decorator.ts`
- Delete `apps/compose/api/src/auth/services/stream-token.service.ts` if Option B/C was chosen; keep and isolate if Option A
- Verify no other compose-api files reference the deleted symbols

### Replace with `packages/auth-client/` imports

Every compose-api file that currently imports from `../auth/guards/jwt-auth.guard`, `../rbac/guards/rbac.guard`, `../rbac/decorators/require-permission.decorator`, or `../auth/decorators/public.decorator` gets its import path swapped to `@orchestratorai/auth-client` (or the finalized package name).

The shape of the decorator stack on each controller stays identical:
```ts
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('<permission>')
@Controller('...')
```

### Migrate test helper

- Delete `apps/compose/api/src/test-utils/mock-guards.ts`
- Update every spec that imports from it (currently `rag/__tests__/qa.controller.spec.ts` and `system/__tests__/system.controller.spec.ts`) to import from the shared helper in `packages/auth-client/test-utils`
- Run full compose-api test suite — all specs must pass

### Reconcile StreamTokenService

Depends on precondition 3 choice:

- **Option A**: wrap `StreamTokenService` in its own guard class and apply only to SSE endpoints. Document that these endpoints bypass the remote auth path.
- **Option B**: add `POST /auth/validate-stream-token` to auth-api; add `AuthClient.validateStreamToken()` method; update SSE endpoints to call it.
- **Option C**: refactor `POST /auth/login` to set an HTTP-only cookie; update compose-web to stop using stream tokens; update SSE endpoints to read the cookie and call `POST /auth/authorize`.

### Reconcile customer-service dual-mode auth

`apps/compose/api/src/customer-service/customer-service.controller.ts` handles both `GuestSession` and `Bearer` tokens with `@Public()` on session-creation endpoints and inline dual-mode checking on message endpoints. Phase 2 must decide:

- Keep the inline dual-mode handling as a documented exception (the `GuestSession` flow has no equivalent in remote-auth)
- Extract a `CustomerAuthGuard` that routes to either `GuestSession` verification (local) or `AuthClient.authorize()` (remote)

### Reconcile rate-limit guard (if applicable)

If compose-api has a rate-limit guard that extracts Bearer tokens to derive rate-limit keys, Phase 2 either leaves it alone (documented exception) or refactors it to use the `AuthClient.authorize` result's `userId` for the key.

## Follow-up items to fold in (carry-over from Phase 1)

Phase 1 deferred these concerns. Phase 2 picks them up:

1. **`@Public()` analytics controller** (`apps/compose/api/src/analytics/analytics.controller.ts`): currently fully public. Phase 2 decides whether to add auth or keep as `@Public()` with network isolation.
2. **`rag/internal-query.controller.ts` network isolation**: currently `@Public()`. Phase 2 decides whether to keep as `@Public()` + network isolation, or gate behind service-to-service auth.
3. **Assets signed-URL support**: `apps/compose/api/src/assets/assets.controller.ts` has `@Public()` on stream endpoints. Phase 2 designs a signed-URL mechanism so public asset streams are scoped to a specific user or session.
4. **Customer-service exception**: formalize the dual-mode auth pattern or replace with a proper guard.

## Out of scope for Phase 2

- Adding new functionality to compose-api (new controllers, new runners, new RAG capabilities)
- Changing any controller's permission mapping (Phase 1 froze the vocabulary to compose-api's existing rbac permissions)
- Touching forge/pulse/bridge products (their hardening is separate efforts)
- Modifying `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`

## Done when

- `find apps/compose/api/src/auth/guards apps/compose/api/src/rbac/guards -name "*.ts" -not -name "*.spec.ts"` returns empty or only the `StreamTokenService` file if Option A was chosen
- `grep -rn "from.*apps/compose/api/src/auth/guards\|from.*apps/compose/api/src/rbac/guards" apps packages --include="*.ts"` returns zero hits
- Every `@UseGuards` site in compose-api imports from `@orchestratorai/auth-client` (or the finalized package path)
- Phase 1's verification suite (public endpoints 200, protected endpoints 401 unauth / 2xx with demo-user, `/health` 200, invoke 2xx with valid token, latency within target) still passes unchanged
- Multi-runner composition chain (context -> RAG -> API) runs correctly end-to-end
- Latency is within the target decided during the measurement precondition
- StreamTokenService migration path (A/B/C) is implemented and documented
- Analytics, rag/internal-query, assets signed-URL, and customer-service decisions are each either implemented or explicitly documented as out-of-scope with a separate follow-up effort

## Gate

Admin-api and compose-api both use `packages/auth-client/`. Zero code duplication between the two products' auth layers. Compose-api's `src/auth/` folder contains only `auth.controller.ts`, `auth.service.ts`, `auth.module.ts`, possibly `services/stream-token.service.ts` (Option A only), interfaces, and DTOs — no guards, no decorators, no local providers.

## Note: compose-api as the first remote-auth consumer after admin-api

Compose-api is a plausible **first candidate** for the second remote-auth consumer (after admin-api). Its workloads are single-shot composable runners — context, RAG, API, external, and media — which are inherently less latency-sensitive than forge-api's long-running legal-department workflows that chain 20+ LLM calls with sub-requests. A multi-runner composition chain in compose-api typically makes 2-4 sequential runner calls, not 20+.

If compose-api is chosen as the second adopter, it would:
1. **Trigger the `packages/auth-client/` extraction** from admin-api's local implementation into a shared workspace package
2. **Prove the pattern** on a non-trivial second consumer with real workloads (RAG queries, crawler operations, SSE streaming)
3. **Unblock forge-api Phase 2** by satisfying its precondition 1 (two products already consuming `packages/auth-client/`)
4. **Set the StreamTokenService precedent** (Option A/B/C decision), which forge-api Phase 2 then follows

This ordering (admin -> compose -> forge) is the lowest-risk path because it moves from least to most latency-sensitive, and each step de-risks the next.

---

**End of Phase 2 scope.** Phase 2 is not aspirational — it is committed, with concrete preconditions and a clear trigger.
