# Forge API Auth Hardening — Phase 2: Remote-Auth Unification

**Status**: Parked — committed follow-up to `docs/efforts/forge-auth-hardening/` (Phase 1). Do not start until preconditions are met.

## Starting state

Phase 1 of the forge-api auth hardening effort (merged via PR [pending]) added `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission(...)` to every forge-api controller that needed it, using forge-api's existing in-process `JwtAuthGuard` + `RbacGuard`. 18 controllers carry the full guard stack; 6 are explicitly `@Public()`; 3 are intentional exceptions (rbac, auth, customer-service — each documented).

Phase 1 deliberately did NOT touch forge-api's in-process auth layer. Token validation still happens locally via `SupabaseIdentityProvider.validateToken()`, permission evaluation still happens locally via `RbacService.hasPermission()`. No HTTP calls to auth-api on the per-request critical path. This avoided a latency regression on long-running legal-department workflows that make many sub-requests per user action.

Admin-api (merged earlier) uses the **remote-authorization** pattern: its local `src/auth/` folder contains a thin `AuthClient` that makes a single `POST /auth/authorize` call to auth-api per request, in-process auth layer deleted. That's the target pattern. Phase 2 migrates forge-api onto it.

## Why this is Phase 2, not Phase 1

Three reasons, carried over from Phase 1's intention file:

1. **Latency risk is real and unmeasured.** Legal-department workflows chain 20+ LLM calls, each with sub-requests for RAG context, model config, and observability writes. Per-request +1 HTTP hop to auth-api could add 100-500ms to a workflow that runs for minutes. Without measurement, we'd be gambling with demo reliability.
2. **`packages/auth-client/` doesn't exist yet.** Admin-api's `src/auth/` folder is the reference implementation, but it's still admin-api-local — extracting it prematurely (one consumer) is the "framework-first" anti-pattern the monorepo deliberately avoids. The extraction should happen naturally when the second product needs it, and forge-api shouldn't be that second product because of the latency concern.
3. **StreamTokenService support is unsolved.** Forge-api's in-process `JwtAuthGuard` has a side channel for stream tokens (SSE authentication without Bearer headers). The remote `POST /auth/authorize` endpoint doesn't handle stream tokens. Phase 2 has to design and implement the stream-token equivalent in the remote pattern, which isn't trivial.

## Preconditions (all three must be true)

**Phase 2 does not start until ALL of these are met.**

### 1. Compose-api AND (pulse-api OR bridge-api) have adopted the remote-authorization pattern

- `packages/auth-client/` exists as a real shared workspace package
- At least two products (admin-api + at least one of compose/pulse/bridge) consume it
- The pattern is proven on a non-trivial second consumer (not just a hello-world)
- The extraction happened naturally during the second consumer's hardening effort

### 2. Latency measurement has been done on a representative forge-api workflow

- Workload: a full `POST /legal-department/jobs/upload` with an NDA document, end-to-end through document extraction, routing, specialist fan-out, synthesis, and report generation. Median time across 10 runs.
- Comparison: baseline (current in-process auth) vs. a prototype build of forge-api using `packages/auth-client/` for every guard call.
- **Decision rule**:
  - If remote-auth adds **<50ms p50** to end-to-end workflow time: proceed without caching in Phase 2.
  - If remote-auth adds **50-100ms p50**: proceed with caching as a Phase 2 task (short-TTL LRU in `AuthClient` keyed by `{token-hash, permission, orgSlug}`, TTL ~30s, max ~10k entries).
  - If remote-auth adds **>100ms p50**: stop. Fix the latency first (e.g., auth-api co-location, HTTP/2 connection reuse, batched authorize calls). Phase 2 does not start until a tractable path is documented.
- Measurement must be committed as a markdown file in `docs/efforts/future/forge-auth-remote-unification-latency-measurement.md` before Phase 2 starts.

### 3. StreamTokenService decision made and documented

Forge-api supports SSE authentication via `StreamTokenService`: a JWT-signed token embedded in the URL query (`?token=...`) for SSE connections, because EventSource can't send custom headers. The in-process `JwtAuthGuard` recognizes this and routes to `StreamTokenService.verify()` instead of the normal Bearer path.

The remote-authorization pattern has no equivalent. Phase 2 must pick one of:

- **A. Preserve in-process stream tokens**: keep a thin in-process guard for SSE-only routes; use remote auth for everything else. Two guards in the codebase, different scopes. Simple but splits the pattern.
- **B. Add stream-token validation to auth-api**: new endpoint `POST /auth/validate-stream-token` (or similar). Forge-api's `AuthClient` gets a second method. Consistent pattern but bigger auth-api change.
- **C. Replace stream tokens with a session cookie**: refactor SSE endpoints to use an HTTP-only cookie set by `POST /auth/login`. The cookie carries credentials; `/auth/authorize` reads it instead of the Authorization header. Biggest change, cleanest long-term, but touches forge-web too.

The decision must be made and documented before Phase 2 starts. Expected choice: **B**, because it keeps the pattern unified without touching frontend, but A is the safe fallback if B turns out to be messy.

## Scope

Once preconditions are met, Phase 2 does the following:

### Delete in-process forge-api auth infrastructure

- Delete `apps/forge/api/src/auth/guards/jwt-auth.guard.ts` (256 lines)
- Delete `apps/forge/api/src/rbac/guards/rbac.guard.ts` (170 lines)
- Delete `apps/forge/api/src/auth/decorators/public.decorator.ts`
- Delete `apps/forge/api/src/rbac/decorators/require-permission.decorator.ts`
- Delete `apps/forge/api/src/auth/services/stream-token.service.ts` if Option B/C was chosen; keep and isolate if Option A
- Verify no other forge-api files reference the deleted symbols

### Replace with `packages/auth-client/` imports

Every forge-api file that currently imports from `../auth/guards/jwt-auth.guard`, `../rbac/guards/rbac.guard`, `../rbac/decorators/require-permission.decorator`, or `../auth/decorators/public.decorator` gets its import path swapped to `@orchestratorai/auth-client` (or the finalized package name). Expected touch count: ~20 files.

The shape of the decorator stack on each controller stays identical:
```ts
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('<permission>')
@Controller('...')
```

### Migrate test helper

- Delete `apps/forge/api/src/test-utils/mock-guards.ts`
- Update every spec that imports from it to import from the shared helper in `packages/auth-client/test-utils` (or wherever the shared version lives)
- Run full forge-api test suite — all specs must pass

### Reconcile customer-service rate limiter

`apps/forge/api/src/customer-service/guards/rate-limit.guard.ts` currently extracts Bearer tokens to derive rate-limit keys. Phase 2 either:
- Leaves it alone (it's a legitimate in-process concern — documented as an exception)
- Refactors it to use the `AuthClient.authorize` result's `userId` for the key (cleaner but requires the guard to run AFTER auth, which means it has to read `request.user` instead of the header)

### Reconcile customer-service dual-mode auth

`apps/forge/api/src/customer-service/customer-service.controller.ts` currently handles both `GuestSession` and `Bearer` tokens inline. Phase 2 must decide:
- Keep the inline dual-mode handling as a documented exception (the `GuestSession` flow has no equivalent in remote-auth)
- Extract a `CustomerAuthGuard` that routes to either `GuestSession` verification (local) or `AuthClient.authorize()` (remote)

### StreamTokenService migration (depends on precondition 3 choice)

If Option A (preserve): wrap `StreamTokenService` in its own guard class and apply only to SSE endpoints. Document that these endpoints bypass the remote auth path.

If Option B (auth-api endpoint): add `POST /auth/validate-stream-token` to auth-api; add `AuthClient.validateStreamToken()` method; update SSE endpoint to call it.

If Option C (session cookie): refactor `POST /auth/login` in auth-api to set an HTTP-only cookie; update forge-web to stop using stream tokens; update SSE endpoint to read the cookie and call `POST /auth/authorize` with it.

### Run Phase 1's verification suite unchanged

Phase 1's curl matrix (public endpoints 200, protected endpoints 401 unauth / 2xx with demo-user, `/health` 200, `/legal-department/jobs` 2xx with valid token, latency within target) must still pass with zero modifications.

## Follow-up items to fold in (carry-over from Phase 1)

Phase 1's completion report noted these as deferred concerns. Phase 2 picks them up:

1. **Webhook signature verification** for `apps/forge/api/src/webhooks/webhooks.controller.ts`. Currently `@Public()` with a TODO comment. Phase 2 designs and implements an HMAC signature check.
2. **Signed-URL support for `/assets/storage/*` and `/assets/:id`** public streams. Currently `@Public()` — any caller can fetch any asset. Phase 2 designs a signed-URL mechanism so public asset streams are scoped to a specific user or session.
3. **`rag/internal-query.controller.ts` — decide whether to keep as `@Public()` + network isolation, or remove entirely** as a service-to-service endpoint that should be intra-process only. Currently `@Public()` with a TODO.

## Out of scope for Phase 2

- Adding new functionality to forge-api (new controllers, new agents, new LangGraph workflows)
- Changing any controller's permission mapping (Phase 1 froze the vocabulary to forge-api's existing rbac permissions)
- Touching compose/pulse/bridge products (they are preconditions — their hardening is separate efforts that MUST happen first)
- Modifying `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`

## Done when

- `find apps/forge/api/src/auth/guards apps/forge/api/src/rbac/guards -name "*.ts" -not -name "*.spec.ts"` returns empty or only the `StreamTokenService` file if Option A was chosen
- `grep -rn "from.*apps/forge/api/src/auth/guards\|from.*apps/forge/api/src/rbac/guards" apps packages --include="*.ts"` returns zero hits
- Every `@UseGuards` site in forge-api imports from `@orchestratorai/auth-client` (or the finalized package path)
- Phase 1's full curl matrix still passes unchanged
- Legal-department end-to-end workflow runs correctly (`POST /legal-department/jobs/upload` with an NDA → HITL review → approval → synthesis → report)
- Latency is within the target decided during the measurement precondition
- StreamTokenService migration path (A/B/C) is implemented and documented
- Webhook signature verification, signed-URL asset streams, and rag/internal-query decision are each either implemented or explicitly documented as out-of-scope for Phase 2 with a separate follow-up effort

## Gate

Admin-api and forge-api both use `packages/auth-client/`. Zero code duplication between the two products' auth layers. Forge-api's `src/auth/` folder contains only `auth.controller.ts` (if it still exists), `auth.service.ts`, possibly `services/stream-token.service.ts` (Option A only), and possibly `dto/` — no guards, no decorators, no local providers.

---

**End of Phase 2 scope.** Phase 2 is not aspirational — it's committed, with concrete preconditions and a clear trigger.
