# Admin API Auth Hardening — Product Requirements Document

## 1. Overview

Every controller in `apps/admin/api/src/` is unprotected at runtime. `@ApiBearerAuth('JWT-auth')` exists as Swagger metadata on most controllers, but zero `@UseGuards` decorators exist anywhere in admin-api. A curl against the admin API with no token returns 200 with real data. This was discovered during post-merge live verification of Phase 4.5 (Reasoning Capture), which surfaced PII-adjacent `llm_usage` rows and full LLM reasoning payloads to an unauthenticated requester.

This effort closes the gap using a **remote-authorization** model: admin-api gets a thin `AuthClient` + local guards that make an HTTP call to Auth API on each protected request. Auth API remains the single owner of token validation and RBAC evaluation — admin-api never imports auth logic, never owns a guard implementation of its own beyond the transport layer, and never touches `auth.*` tables.

This model matches `apps/auth/api/CLAUDE.md`'s stated philosophy:

> Auth is the canonical owner of the identity layer. Every other product calls Auth API to: validate incoming JWT tokens, check permissions for specific actions. No other product writes to auth tables. Ever.

A new `POST /auth/authorize` endpoint is added to Auth API: it accepts a bearer token plus a required permission and returns 200/401/403 in one round-trip, so admin-api's guard stack becomes a single HTTP call, not two.

Admin-api becomes the reference consumer of this pattern. Forge/Compose/Pulse/Bridge will adopt the same client + guards in future efforts. The existing login flow, token shape, Auth API surface (except the one new endpoint), admin web app, and RBAC permission model all stay unchanged — only admin-api's request-validation layer changes, and only one new endpoint is added to auth-api.

## 2. Goals & Success Criteria

**Functional goals**

- `curl http://localhost:5150/admin/llm/usage/list` (no Authorization header) returns **401**
- `curl -H "Authorization: Bearer <garbage>"` returns **401**
- `curl -H "Authorization: Bearer <expired-token>"` returns **401**
- `curl -H "Authorization: Bearer <valid-token-for-low-permission-user>"` returns **403** on any protected admin endpoint
- `curl -H "Authorization: Bearer <demo-user-token>"` returns **200** with real data on every admin endpoint (demo-user has `admin:settings`, `llm:admin`, `rag:admin`, `agents:admin` globally)
- `curl http://localhost:5150/health` returns **200** without any header (health stays open)
- Admin web smoke test (login → LLM Usage → filter → expand row → reasoning content) still works identically

**Quality goals**

- All admin-api jest tests pass
- All admin-web vitest tests pass
- All auth-api jest tests pass (new `POST /auth/authorize` endpoint is covered by its own spec)
- `npm run build` clean across the monorepo
- Zero new `@ts-ignore`, zero fallbacks, zero silently-swallowed errors
- Admin-api does NOT import from `@orchestratorai/planes` for auth purposes, does NOT import any auth-api-local code, does NOT read any `auth.*` or `authz.*` table, does NOT call Supabase directly for identity — every auth decision is an HTTP call to Auth API
- Auth-api does NOT gain a dependency on `@orchestratorai/planes` or on any other product — the new `/auth/authorize` endpoint reuses the existing in-process `JwtAuthGuard` + `RbacService`

**Success is measurable**: every item above is a curl, a test run, or a browser click.

## 3. User Stories

**Operator running a live verification**

> As a developer curling the admin API during a smoke test, I want unauthenticated requests to be rejected immediately, so that a missing header in my script is caught loud instead of silently returning real production data.

**Admin UI user**

> As demo-user (or any admin role holder), I want to log into `/app/admin/llm/usage` and see the same page I saw before, so that the hardening is invisible to legitimate users.

**Low-permission user**

> As a user whose role does NOT include `llm:admin`, hitting `/admin/llm/usage/list` directly must return 403, so that I cannot harvest reasoning payloads outside the Admin UI.

**Future product author (forge-api, compose-api, pulse-api, bridge-api)**

> As someone adding guards to a different product later, I want a documented reference pattern (AuthClient service + two local guards in a single `auth/` folder, one HTTP call per request to `POST /auth/authorize`) that I can copy and adapt, so I don't have to invent a new pattern or couple my product to auth-api internals.

**Security auditor**

> As someone reviewing `apps/admin/api/src`, I want every controller except `/health` to have `@UseGuards(JwtAuthGuard, RbacGuard)` and `@RequirePermission('...')` visible in the source, so that the enforcement is documented in the code not in a wiki.

**Auth-api owner**

> As the owner of auth-api, I want to remain the only service that owns identity logic and touches `auth.*`/`authz.*` tables, and I want other products to call me over HTTP instead of importing my classes — so the "single source of truth" boundary in `apps/auth/api/CLAUDE.md` stays intact.

## 4. Technical Requirements

### 4.1 Architecture

**Remote-authorization model:**

```
[admin-api request]
      │
      ▼
┌────────────────────────────────────────────┐
│ JwtAuthGuard + RbacGuard (admin-api local) │
│  - Read Authorization header               │
│  - Read @RequirePermission metadata        │
│  - Short-circuit true if @Public()         │
│  - One HTTP call:                          │
│    POST http://auth-api/auth/authorize     │
│      Authorization: Bearer <token>         │
│      body: { permission, organizationSlug? }│
│  - 401 → throw UnauthorizedException       │
│  - 403 → throw ForbiddenException          │
│  - 200 → attach user to request, continue  │
└────────────────────────────────────────────┘
      │
      ▼
[controller handler runs with request.user]
```

**New auth-api endpoint — `POST /auth/authorize`:**

- Consumes the existing in-process `JwtAuthGuard` (stays in auth-api, unchanged) and the existing in-process `RbacService` (stays in auth-api, unchanged)
- Headers: `Authorization: Bearer <token>` (required)
- Body:
  ```ts
  {
    permission: string;            // e.g. "llm:admin"
    organizationSlug?: string;     // defaults to "*" (global check) when omitted
    resourceType?: string;         // optional — forwarded to hasPermission
    resourceId?: string;           // optional — forwarded to hasPermission
  }
  ```
- Returns 200:
  ```ts
  {
    allowed: true;
    userId: string;
    email: string | null;
    orgSlug: string | null;
    orgId: string | null;
    roles: string[];
    permission: string;            // echoed back for audit
  }
  ```
- Returns 401 on any of: missing/malformed header, expired token, forged token, Supabase rejection
- Returns 403 on any of: token valid but `RbacService.hasPermission()` returns false AND not super-admin AND (for `admin:*` perms) not admin
- Implementation notes:
  - Exactly mirrors `RbacGuard.canActivate()`'s short-circuit ladder: super-admin → true; `admin:*` permission + `isAdmin()` → true; else `hasPermission()`
  - The endpoint is the ONLY place where admin-api's auth decisions are evaluated — no permission logic leaks into admin-api
  - Audit-friendly: logs `{ userId, permission, orgSlug, result }` at debug level; never logs the token

**Admin-api local auth layer (new):**

```
apps/admin/api/src/auth/
  auth-client.service.ts            # HTTP client — calls POST /auth/authorize
  auth-client.service.spec.ts       # unit tests with mocked fetch
  jwt-auth.guard.ts                 # Nest guard — extracts header, passes to AuthClient
  jwt-auth.guard.spec.ts
  rbac.guard.ts                     # Nest guard — reads @RequirePermission, passes to AuthClient
  rbac.guard.spec.ts
  decorators/
    require-permission.decorator.ts # local metadata decorator — NOT imported from elsewhere
    public.decorator.ts             # local @Public() bypasses both guards
  auth.module.ts                    # registers AuthClient + both guards globally
  index.ts                          # barrel export for cross-module use
```

**Why local, not shared:**

- Putting these in `packages/planes/*` would violate `apps/auth/api/CLAUDE.md`'s "auth does not import planes" rule IF auth-api ever needed them. It doesn't in this effort, but the symmetry matters.
- Putting them in a new `packages/auth-client/` package is premature — one consumer is not a library. After forge-api becomes the second consumer in a follow-up effort, we can extract.
- Admin-api is the reference implementation. Future products copy the folder verbatim and change the module name until the second consumer justifies extraction.

**Important constraint — NO shared `packages/planes/rbac/` work:**

- `packages/planes/rbac/` already exists with just `decorators/require-permission.decorator.ts` — that's a LEFTOVER from an earlier approach. Leave it alone in this effort. Do NOT add files to it. Do NOT promote auth-api's `RbacGuard`/`RbacService` into it. Do NOT modify `packages/planes/package.json` `exports` to add a `./rbac` subpath.
- Admin-api's local `require-permission.decorator.ts` is a NEW file written fresh. It must NOT import from `@orchestratorai/planes/rbac` or from `apps/auth/api/src/rbac/`. It's a small file (~15 lines) — the duplication is intentional and cheap.
- `packages/planes/auth/guards/jwt-auth.guard.ts` (the 14-line stub) also stays untouched in this effort. Deleting or replacing it is out of scope and belongs to a future effort if planes-auth is ever actually used by a downstream product.

**Guard execution order (per-request):**

1. `JwtAuthGuard.canActivate()` → reads `request.headers.authorization`, rejects immediately if absent/malformed. Reads `@Public()` metadata; short-circuits true if present. Otherwise passes the token + any `@RequirePermission()` metadata to `AuthClient.authorize(token, permission, orgSlug?)`. On 401 throws `UnauthorizedException`; on 403 throws `ForbiddenException`; on 200 attaches `{ userId, email, orgSlug, orgId, roles }` to `request.user` and returns true.
2. `RbacGuard.canActivate()` → **no-op** in this architecture, because `JwtAuthGuard` already made the authorization call. The second guard is kept in the decorator stack (`@UseGuards(JwtAuthGuard, RbacGuard)`) for three reasons: (a) semantic clarity at the controller source — "this endpoint is auth'd AND permission-checked"; (b) forward compat with a future split where one product wants token validation without permission enforcement; (c) it lets `@RequirePermission()` sit at the same scope as `@UseGuards`. In practice, `RbacGuard.canActivate()` reads the already-populated `request.user` and the `@RequirePermission()` metadata and returns true — if `request.user` is absent it throws `UnauthorizedException` as a defensive check. Document this explicitly in the guard file.

   **Rationale for NOT making RbacGuard do a second HTTP call**: we already know the answer from the combined `/auth/authorize` call. Two calls would double latency for zero security benefit.
3. Handler runs with `request.user` populated.

**Why both guards instead of one:** An earlier draft collapsed everything into a single `AuthGuard`. That works, but the decorator-level separation between "is this request authenticated" and "does this caller have this permission" is valuable for auditors reading controller source. Keeping the two-guard stack matches the pattern auth-api already uses internally and matches what future products will copy.

**Org-slug resolution:** The new `POST /auth/authorize` endpoint extracts org slug from (priority order): body `organizationSlug` field → `x-organization-slug` header → query param `organizationSlug` → default `*`. This mirrors the existing RbacGuard behavior inside auth-api. Admin-api's `RbacGuard` forwards those same sources to `AuthClient.authorize()`.

**Failure modes the AuthClient must handle:**

- **Auth API unreachable** → throw `ServiceUnavailableException` (503) from the guard. Do NOT fall back to allowing the request. Do NOT fall back to denying silently. Log the failure loudly.
- **Auth API returns 5xx** → same as unreachable: 503 from the guard, loud log.
- **Auth API returns a shape the client doesn't recognize** → throw `InternalServerErrorException` (500) with a clear message. Do NOT try to parse partial data.
- **Network timeout (>2s default)** → 503, loud log. The timeout is configurable via `AUTH_API_TIMEOUT_MS` env var, default 2000.

No fallbacks. No cheating. If auth-api is down, admin-api is down. That's the right failure mode — see CLAUDE.md §1.

### 4.2 Data Model Changes

**None.** No new tables, no new columns, no RPC changes. Auth-api continues to call the existing `authz.rbac_*` tables and RPCs via its existing `RbacService`. Admin-api never touches those tables.

### 4.3 API Changes

**Admin-api:** No route changes. Every existing admin-api route keeps its same path, method, request/response shape. Only the enforcement layer is added.

**Auth-api:** One new route.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/auth/authorize` | Token validation + permission check in one call | Bearer token in header; permission in body |

**Per-admin-api-controller permission mapping:**

| Controller | Path prefix | Permission (via `@RequirePermission`) | Rationale |
|---|---|---|---|
| `health/health.controller.ts` | `/health` | `@Public()` — no guard | Liveness probe |
| `llm-analytics/llm-analytics.controller.ts` | `/admin/llm` | `llm:admin` | Exposes llm_usage rows + reasoning content (PII-adjacent) |
| `rag-management/rag-management.controller.ts` | `/admin/rag` | `rag:admin` | Exposes RAG collections + embeddings |
| `agent-registry/agent-registry.controller.ts` | `/admin/agents` | `agents:admin` | Exposes full agent registry |
| `database-admin/database-admin.controller.ts` | `/admin/database` | `admin:settings` | Exposes DB snapshot + migration state |
| `system-config/system-config.controller.ts` | `/admin/system` | `admin:settings` | Exposes system config read + write |
| `crawler/crawler.controller.ts` | `/admin/crawler` | `admin:settings` | Exposes crawler state + runs |
| `claude-pane/claude-pane.controller.ts` | `/admin/claude-pane` | `admin:settings` | Exposes Claude pane config/state — confirm during implementation by reading the controller source; adjust to `llm:admin` only if the data is strictly LLM-only |

**Note:** `apps/admin/api/src/database/` contains only an `index.ts` module wiring file, not a controller. The only DB-facing controller is `database-admin/database-admin.controller.ts` (already in the table). There is no separate `/admin/database` route from a `database/` subfolder.

**Canonical controller inventory** (verified against `grep -rn "@Controller" apps/admin/api/src`):
1. `health/health.controller.ts` → `/health` — **unguarded**
2. `llm-analytics/llm-analytics.controller.ts` → `/admin/llm`
3. `rag-management/rag-management.controller.ts` → `/admin/rag`
4. `crawler/crawler.controller.ts` → `/admin/crawler`
5. `claude-pane/claude-pane.controller.ts` → `/admin/claude-pane`
6. `agent-registry/agent-registry.controller.ts` → `/admin/agents`
7. `database-admin/database-admin.controller.ts` → `/admin/database`
8. `system-config/system-config.controller.ts` → `/admin/system`

Eight controllers total; seven gain `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission()`, one stays open.

**All non-health routes** get `@UseGuards(JwtAuthGuard, RbacGuard)` at the **class level**. If any single method needs a different permission later, it overrides the class-level decorator at the method level. `@RequirePermission()` is also applied at the class level.

**`system-config.controller.ts` inline bearer-token check** (lines ~23–28): REMOVED in Phase 3, replaced by the shared guard stack. No dual-check.

### 4.4 Frontend Changes

**None.** Admin web already sends `Authorization: Bearer <jwt>` on every request via the existing axios interceptor. No code changes in `apps/admin/web/`. The smoke-test success criterion verifies this.

### 4.5 Infrastructure Requirements

**New env vars for admin-api:**

- `AUTH_API_URL` (required) — base URL of the Auth API, e.g. `http://localhost:5100` in dev, `http://auth-api:6100` in Docker. Admin-api fails fast at startup if unset — do NOT fall back to a hardcoded default.
- `AUTH_API_TIMEOUT_MS` (optional, default `2000`) — HTTP timeout for the `/auth/authorize` call.

Admin-api already has the Supabase env vars from previous work, but they are NOT used by the new auth layer — only Auth API is contacted. Leaving them unused is fine; this effort does not remove them.

**Auth-api: no new env vars.** The new `/auth/authorize` endpoint uses the same `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and internal RBAC config that the existing auth flows already use.

**Module wiring:**

- Admin-api's new `auth.module.ts` is registered as `@Global()` in `app.module.ts` so `JwtAuthGuard` and `RbacGuard` can be injected anywhere via `@UseGuards(...)`.
- Admin-api uses Nest's `HttpModule` (already a transitive dep of `@nestjs/common`) or `global fetch` via node 20+. PRD preference: **global fetch**, because it has zero dependency surface and matches how other lightweight clients in the repo are written. Confirm at implementation time by reading `apps/admin/api/package.json` dependencies.

**No new packages, no new databases, no new network services, no container changes.**

## 5. Non-Functional Requirements

**Performance**

- Every protected admin request now incurs ONE additional HTTP round-trip to Auth API:
  - `POST /auth/authorize` → in-process `JwtAuthGuard` validates token via Supabase (~5–10ms in local dev) → in-process `RbacService.hasPermission` RPC (~2–5ms) → response (~1ms serialization)
- **Target overhead:** +25ms p50 on every protected admin request in local dev. The UI is not latency-sensitive (dashboards, not chat).
- **Hard ceiling:** +100ms p50. If Phase 5 measurements show worse, flag as a follow-up (in-memory LRU cache keyed by `{token-hash, permission, orgSlug}` with 30s TTL is the obvious next step; out of scope for this effort).
- Demo-user is a super-admin; the server-side path short-circuits on `isSuperAdmin` and skips the full permission RPC, so the common case is fast.

**Security**

- Tokens are NEVER logged by AuthClient or by the guards. The bearer value is opaque; logging permits only `{ userId, permission, orgSlug, result }` on the auth-api side (after validation) and `{ permission, result }` on the admin-api side (before validation — so no userId is available to log).
- `@ts-ignore` / `as any` / swallowed errors are prohibited in new auth code. Every failure path throws a specific Nest exception.
- Inline bearer-token checks (the `system-config.controller.ts` pattern) MUST be removed — no belt-and-suspenders that can drift.
- Guards throw standard NestJS `UnauthorizedException` / `ForbiddenException` / `ServiceUnavailableException` / `InternalServerErrorException`. NestJS's built-in exception filter returns well-formed 401/403/503/500 responses. No custom error shape.
- `@Public()` is the ONLY way to opt a route out of the guard stack. It lives in `apps/admin/api/src/auth/decorators/public.decorator.ts` — admin-api-local, not shared.
- Health endpoint: use `@Public()` OR simply do not apply `@UseGuards` at the class level. Either is acceptable. The PRD recommends **no guard decorators** at all on `health.controller.ts` for maximum clarity — a future reviewer sees "no guards = open" immediately.

**Scalability**

- Admin-api is stateless. Guards are stateless. Auth API absorbs one extra request per protected admin request. For the dev-only target of this effort, this is fine (single admin user, a few concurrent requests). For production scaling, a cache on the admin-api side is the planned next step, not in this effort.

**Compatibility**

- Admin web continues to work with no code changes.
- Auth-api continues to work — the new endpoint is purely additive.
- No existing auth-api endpoints change. No existing admin-api routes change.
- `apps/auth/api/CLAUDE.md` stays truthful: auth-api does NOT import planes, does NOT share classes with other products, owns the identity layer.
- `packages/planes/rbac/` and `packages/planes/auth/guards/jwt-auth.guard.ts` are left untouched. A future effort may consolidate them, but it's outside this scope.

## 6. Out of Scope

- **Promoting auth-api classes into planes.** An earlier draft of this PRD took that path and was rejected because it violated the "auth-api does not import planes" rule and created awkward coupling. The remote-authorization model in this PRD is the decided approach.
- **Extracting admin-api's new `auth/` folder into a shared `packages/auth-client/` package.** One consumer is not a library. After forge-api or compose-api becomes the second consumer, we extract. Not before.
- **Touching `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`.** Out of scope. Leave them alone.
- **Auth API internal refactor.** No changes to `apps/auth/api/src/rbac/*`, `apps/auth/api/src/auth/guards/*`, or any auth-api controller except the single new `/auth/authorize` handler and the method that registers it on the module.
- **Forge API, Compose API, Pulse API, Bridge API.** They have the same gap. Fixing them is a separate effort per product. The admin-api `auth/` folder is the reference to copy from.
- **New RBAC model.** No new tables, no new roles, no new permissions. The existing `authz.*` schema is frozen.
- **Swagger redesign.** `@ApiBearerAuth('JWT-auth')` metadata stays as-is on admin-api controllers. Auth-api's Swagger gets one new entry for `/auth/authorize` — automatic from the decorators.
- **Admin web UI changes.** No new login flow, no new logout, no permission-aware menu hiding, no 403 toast handling beyond what already exists.
- **Rate limiting, CIDR allow-lists, mTLS between admin-api and auth-api.** Scope creep.
- **Caching of `/auth/authorize` responses.** Only added if perf measurements in Phase 5 demand it. Explicitly not planned up front.
- **Multi-tenant refinements.** `organizationSlug` defaults to `*` for global checks exactly as admin-api does today.
- **Dev-mode bypass / test env bypass.** No env var that disables auth. The test strategy for admin-api jest specs is `.overrideGuard()` per Nest's standard pattern, not a runtime switch.

## 7. Dependencies & Risks

**Dependencies**

- `apps/auth/api` must be running and reachable at `AUTH_API_URL` before admin-api accepts any protected request. If auth-api is down, admin-api returns 503 on every protected route. Health stays 200. This is the correct failure mode.
- Auth-api's existing `JwtAuthGuard` + `RbacService` behavior is what the new `/auth/authorize` endpoint reuses. Any bug in those propagates. Mitigation: Phase 1 adds a dedicated spec for the new endpoint that covers the 401/403/200 matrix and at least one super-admin short-circuit case.
- Node 20+ for global `fetch`. Already confirmed in root `package.json` engines.

**Risks**

1. **Auth-api returning 500 on a transient Supabase hiccup causes admin-api to 503 every request.** This is intentional (no fallbacks), but it creates a tighter coupling than today's silent-allow bug. Mitigation: document clearly in the completion report; the right long-term fix is (a) making auth-api more robust against Supabase hiccups, and (b) a short-TTL cache on admin-api for successful authorize results. Both out of scope for this effort.

2. **Per-request latency.** +25ms p50 target is optimistic in containerized dev. If local dev shows >100ms, Phase 5 flags it and the effort still ships — the UI still works, dashboards aren't latency-sensitive. A caching follow-up is captured in the completion report.

3. **Tests coverage gap.** Existing admin-api controller specs don't mock guards because none exist. After this effort, every spec that mounts a guarded controller will fail until it mocks `JwtAuthGuard` + `RbacGuard` (or stubs `AuthClient`). Mitigation: Phase 4 is a dedicated test-fix phase with a shared helper at `apps/admin/api/src/test-utils/mock-guards.ts` that specs import.

4. **`system-config.controller.ts` inline check removal could regress.** If Phase 3 removes the inline check before the new guard is verifiably running, there's a window of wider exposure. Mitigation: Phase 3 **adds** the guard stack and **removes** the inline check in the same commit. The commit does not land until the admin-api build is green.

5. **Health endpoint accidentally guarded.** If a global guard is chosen later or a misconfiguration happens, `/health` could end up returning 401. Mitigation: the PRD specifies **per-controller** guards, not global. `health/health.controller.ts` gets NO `@UseGuards` decoration at all. A single curl to `/health` is part of the Phase 5 gate.

6. **Claude-pane permission unclear.** The controller's actual purpose needs a quick read to pick the right permission. Mitigation: Phase 3 includes a 5-minute read of `claude-pane.controller.ts` to pick between `admin:settings` and `llm:admin`. Default is `admin:settings`.

7. **AuthClient's fetch in tests.** Jest specs must stub `AuthClient.authorize()` (or the raw `fetch`) so no real HTTP calls happen. Mitigation: the shared `mock-guards.ts` helper exposes a `mockAuthClient` alongside the two `mockGuard` objects, and specs either `.overrideGuard()` for fast unit tests or `.overrideProvider(AuthClient)` for integration-shaped tests.

8. **`/auth/authorize` endpoint is a new public surface on auth-api.** It can only return data that the caller already knows (did my token work? do I have this permission?). It does NOT expose anything the caller couldn't derive by other means, so the attack surface is limited. Still, the endpoint itself is protected by `JwtAuthGuard` so it can't be called without a token in the first place — an unauthenticated caller gets 401, not 400.

## 8. Phasing

Each phase has a quality gate that must pass before the next phase starts. Each phase is an independently-validatable slice.

### Phase 1 — Add `/auth/authorize` to auth-api

**Objective:** Add a new endpoint to `apps/auth/api/src/auth/auth.controller.ts` that combines token validation and permission check into a single response. Reuses the existing in-process `JwtAuthGuard` for authentication and the existing `RbacService` for authorization — zero changes to those classes.

**Scope:**

- Add `POST /auth/authorize` handler in `auth.controller.ts`:
  - Decorated with `@UseGuards(JwtAuthGuard)` so token validation happens automatically before the handler runs
  - Takes a body DTO: `{ permission: string; organizationSlug?: string; resourceType?: string; resourceId?: string }`
  - Validates the body (class-validator: `@IsString() @IsNotEmpty()` on permission; optional string on the others)
  - Resolves org slug: body > header `x-organization-slug` > query param `organizationSlug` > `'*'`
  - Runs the short-circuit ladder exactly as `RbacGuard` does today:
    1. `rbacService.isSuperAdmin(userId)` → if true, return allowed
    2. If `permission` starts with `admin:` → `rbacService.isAdmin(userId, orgSlug)` → if true, return allowed
    3. `rbacService.hasPermission(userId, orgSlug, permission, resourceType?, resourceId?)` → if true, return allowed
    4. Otherwise throw `ForbiddenException`
  - Returns `{ allowed: true, userId, email, orgSlug, orgId, roles, permission }` on success
  - Logs `{ userId, permission, orgSlug, result, latencyMs }` at debug level; does NOT log the token
- Add a Nest-style DTO file for the request body at `apps/auth/api/src/auth/dto/authorize.dto.ts` (or similar, matching the existing DTO layout in auth-api — verify by reading the directory)
- Add `apps/auth/api/src/auth/authorize.endpoint.spec.ts` (or extend `auth.controller.spec.ts`) covering:
  - 200 happy path for super-admin
  - 200 happy path for non-super-admin with admin role and `admin:*` permission
  - 200 happy path for non-admin with specific permission granted
  - 403 when `hasPermission` returns false and user is not admin
  - 401 when token is missing (JwtAuthGuard rejects before the handler runs — standard Nest behavior)
  - 400 when `permission` is missing/empty from the body
- Do NOT modify `RbacService`, `RbacGuard`, or `JwtAuthGuard`. Do NOT move any files. Do NOT touch `packages/planes/`.

**Gate:**

- `cd apps/auth/api && npm run lint` — no new errors on touched files
- `cd apps/auth/api && npm run build` — clean
- `cd apps/auth/api && npm run test` — all tests pass including the new authorize-endpoint specs
- `find . -name "rbac.service.ts" -not -path "*/node_modules/*" -not -path "*/dist/*"` — still exactly one hit, still inside `apps/auth/api/src/rbac/` (verifying we didn't move anything)
- `grep -rn "from.*@orchestratorai/planes" apps/auth/api/src --include="*.ts"` — zero hits (auth-api must not import planes)
- Manual curl against a running auth-api:
  - `curl -sS -w "\n%{http_code}\n" -X POST http://localhost:5100/auth/authorize -H "Content-Type: application/json" -d '{"permission":"admin:settings"}'` → 401 (no token)
  - `curl -sS -w "\n%{http_code}\n" -X POST http://localhost:5100/auth/authorize -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"permission":"admin:settings"}'` → 200 with `allowed: true` for demo-user
  - `curl -sS -w "\n%{http_code}\n" -X POST http://localhost:5100/auth/authorize -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"permission":"nonexistent:permission"}'` → 403

### Phase 2 — Build admin-api auth layer (client + guards + decorators)

**Objective:** Create `apps/admin/api/src/auth/` with `AuthClient`, `JwtAuthGuard`, `RbacGuard`, `require-permission.decorator`, `public.decorator`, and `auth.module`. Wire the module into `app.module.ts` as `@Global()`. Do NOT attach the guards to any controllers yet — Phase 3 does that.

**Scope:**

- Create `apps/admin/api/src/auth/auth-client.service.ts`:
  - `@Injectable() export class AuthClient { async authorize(token: string, permission: string, orgSlug?: string, resourceType?: string, resourceId?: string): Promise<AuthorizeResult> }`
  - Reads `AUTH_API_URL` + `AUTH_API_TIMEOUT_MS` from process.env at construction time. Throws at construction if `AUTH_API_URL` is missing.
  - Uses global `fetch` with an `AbortController` for the timeout
  - Maps responses: 200 → return parsed body; 401 → throw `UnauthorizedException`; 403 → throw `ForbiddenException`; 5xx/network/timeout → throw `ServiceUnavailableException` with a clear message; unknown → `InternalServerErrorException`
  - NO fallback allow-through. NO fallback deny-silently. Loud failures.
- Create `apps/admin/api/src/auth/auth-client.service.spec.ts` covering the five return paths above using a mocked `fetch`
- Create `apps/admin/api/src/auth/decorators/require-permission.decorator.ts` — tiny file:
  ```ts
  import { SetMetadata } from '@nestjs/common';
  export const PERMISSION_KEY = 'requiredPermission';
  export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
  ```
- Create `apps/admin/api/src/auth/decorators/public.decorator.ts`:
  ```ts
  import { SetMetadata } from '@nestjs/common';
  export const IS_PUBLIC_KEY = 'isPublic';
  export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
  ```
- Create `apps/admin/api/src/auth/jwt-auth.guard.ts`:
  - Injects `Reflector` + `AuthClient`
  - `canActivate(context)`: reads `@Public()` metadata from handler + class; short-circuits true if present. Otherwise extracts `request.headers.authorization`; if absent or not `Bearer <token>` throws `UnauthorizedException`. Reads `@RequirePermission()` metadata from handler + class; if absent throws `Error('Controller missing @RequirePermission')` (catches a coding bug — the PRD requires every non-public controller to declare a permission). Resolves org slug from body/header/query. Calls `this.authClient.authorize(token, permission, orgSlug)`. On success attaches the returned principal to `request.user` and returns true. On thrown exception re-throws (types propagate unchanged).
- Create `apps/admin/api/src/auth/jwt-auth.guard.spec.ts` covering: `@Public()` bypass; missing header → 401; missing `@RequirePermission` → 500 (coding bug); AuthClient returns → request.user populated, true returned; AuthClient throws 401 → re-thrown; AuthClient throws 403 → re-thrown.
- Create `apps/admin/api/src/auth/rbac.guard.ts`:
  - `canActivate(context)`: checks `request.user` is populated (defensive — JwtAuthGuard must have run first). If not, throws `UnauthorizedException`. Otherwise returns true.
  - File-level comment explains: "The real permission check already happened in JwtAuthGuard via /auth/authorize. This guard exists for semantic clarity in controller decorators (`@UseGuards(JwtAuthGuard, RbacGuard)` reads like 'authenticated AND authorized') and as a forward-compat seam. See PRD §4.1."
- Create `apps/admin/api/src/auth/rbac.guard.spec.ts` — tests both the "request.user populated → true" path and "request.user missing → throws" path.
- Create `apps/admin/api/src/auth/auth.module.ts`:
  - `@Global() @Module({ providers: [AuthClient, JwtAuthGuard, RbacGuard], exports: [AuthClient, JwtAuthGuard, RbacGuard] })`
- Create `apps/admin/api/src/auth/index.ts` — barrel exporting `AuthClient`, `JwtAuthGuard`, `RbacGuard`, `RequirePermission`, `PERMISSION_KEY`, `Public`, `IS_PUBLIC_KEY`, `AuthModule`.
- Update `apps/admin/api/src/app.module.ts` to import `AuthModule` from `./auth`.
- Update `.env.example` at the repo root (or the admin-api-specific `.env.example` if one exists) to document `AUTH_API_URL` and `AUTH_API_TIMEOUT_MS`.
- Update root `.env` file: add `AUTH_API_URL=http://localhost:5100` so local dev works. (Confirm the dev Auth API port first.)

**Gate:**

- `cd apps/admin/api && npm run lint` — no new errors
- `cd apps/admin/api && npm run build` — clean
- `cd apps/admin/api && npm run test` — all tests pass, including all new specs in `src/auth/**/*.spec.ts`
- `grep -rn "from.*@orchestratorai/planes" apps/admin/api/src/auth --include="*.ts"` — zero hits
- `grep -rn "from.*apps/auth/api" apps/admin/api/src --include="*.ts"` — zero hits (admin-api must not import auth-api source)
- Admin-api starts cleanly with `AUTH_API_URL` set and exits fast at startup with a clear error when it is unset

### Phase 3 — Wire guards on admin-api controllers

**Objective:** Add `@UseGuards(JwtAuthGuard, RbacGuard)` and `@RequirePermission(...)` to every admin-api controller except `health/`. Remove the `system-config.controller.ts` inline bearer-token check. Do not update tests yet (Phase 4).

**Scope:**

- Read `apps/admin/api/src/claude-pane/claude-pane.controller.ts` and decide the final permission (`admin:settings` or `llm:admin`). Document the choice in the plan.
- For each of the 7 protected controllers, add imports:
  ```ts
  import { UseGuards } from '@nestjs/common';
  import { JwtAuthGuard, RbacGuard, RequirePermission } from '../auth';
  ```
  and class-level decorators:
  ```ts
  @Controller('...')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('<permission from PRD mapping>')
  @ApiBearerAuth('JWT-auth')  // existing — keep it
  export class XController { ... }
  ```
- Do NOT touch `health/health.controller.ts`. No `@UseGuards` on it, no `@Public()` on it — it stays plainly unguarded.
- Remove the inline `if (!authHeader || !authHeader.startsWith('Bearer '))` block and the related `throw new UnauthorizedException` from `apps/admin/api/src/system-config/system-config.controller.ts`. Remove any unused imports left behind (`UnauthorizedException`, `@Req() req: Request`, etc.) after the cleanup.
- Grep checks:
  - `grep -rn "@UseGuards(JwtAuthGuard, RbacGuard)" apps/admin/api/src --include="*.ts"` → exactly 7 hits
  - `grep -rn "@UseGuards" apps/admin/api/src/health --include="*.ts"` → 0 hits
  - `grep -rn "startsWith('Bearer ')" apps/admin/api/src --include="*.ts"` → 0 hits

**Gate:**

- `cd apps/admin/api && npm run lint` — no new errors on touched controllers
- `cd apps/admin/api && npm run build` — compiles clean
- Tests intentionally **not** run — they will fail. Phase 4 fixes them.
- Phase review: 7 controllers guarded, 1 (health) unguarded, inline check removed, claude-pane permission documented.

### Phase 4 — Update admin-api tests + add shared mock helper

**Objective:** Fix every admin-api controller spec that mounts a controller via `Test.createTestingModule` so it stubs `JwtAuthGuard` + `RbacGuard` (and `AuthClient` for integration-shaped tests). Add a reusable helper. Add one 401 test and one 403 test per controller to lock in the guard stack.

**Scope:**

- Create `apps/admin/api/src/test-utils/mock-guards.ts`:
  ```ts
  export const mockJwtAuthGuard = { canActivate: jest.fn().mockReturnValue(true) };
  export const mockRbacGuard = { canActivate: jest.fn().mockReturnValue(true) };
  export const mockAuthClient = {
    authorize: jest.fn().mockResolvedValue({ allowed: true, userId: 'test-user', email: 'test@example.com', orgSlug: '*', orgId: null, roles: ['admin'], permission: 'admin:settings' }),
  };
  export function applyGuardOverrides<T extends TestingModuleBuilder>(builder: T): T {
    return builder
      .overrideGuard(JwtAuthGuard).useValue(mockJwtAuthGuard)
      .overrideGuard(RbacGuard).useValue(mockRbacGuard)
      .overrideProvider(AuthClient).useValue(mockAuthClient);
  }
  ```
- Find every admin-api controller spec (`find apps/admin/api/src -name "*.controller.spec.ts"`) and update the `Test.createTestingModule(...).compile()` chain to use the helper. Import `mockJwtAuthGuard`/`mockRbacGuard`/`applyGuardOverrides` from the helper.
- For each protected controller, add a `describe('guard stack', ...)` block with:
  - "returns 401 when JwtAuthGuard rejects" — override `mockJwtAuthGuard.canActivate` to throw `UnauthorizedException`
  - "returns 403 when RbacGuard rejects" — override `mockRbacGuard.canActivate` to throw `ForbiddenException`
  - Use supertest if the existing spec uses it, otherwise assert directly on the guard's thrown exception.
- Do NOT touch `*.service.spec.ts` — services don't mount controllers and don't interact with guards.
- Do NOT touch `health/health.controller.spec.ts` — health has no guards.
- Reset all mocks (`jest.clearAllMocks()`) in `beforeEach` so the 401/403 overrides don't leak across tests.

**Gate:**

- `cd apps/admin/api && npm run lint` — clean
- `cd apps/admin/api && npm run build` — clean
- `cd apps/admin/api && npm run test` — every spec passes, including the new 401/403 blocks
- `cd apps/admin/web && npm run test` — unchanged (no web work this phase)
- Phase review: `mock-guards.ts` helper exists, every admin-api controller spec imports it, every protected controller has 401 + 403 coverage.

### Phase 5 — Live verification (curl matrix + Chrome smoke)

**Objective:** Run the full HTTP-level verification against the running local stack, confirming each success criterion from §2.

**Scope:**

- Restart admin-api and auth-api dev servers so both pick up the new code. Admin-web does NOT need restart. Forge-api does NOT need restart.
- Confirm all services listening: `lsof -iTCP -sTCP:LISTEN -P | grep -E "node.*:(5100|5101|5150|5200)"`
- Obtain fresh demo-user JWT:
  ```
  TOKEN=$(curl -sS -X POST http://localhost:5100/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"demo-user@orchestratorai.io","password":"DEMOUSER123!"}' | jq -r .accessToken)
  ```
- **Unauth curl matrix** — every protected endpoint must return 401:
  - `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150/admin/llm/usage/list` → 401
  - Repeat for `/admin/rag/...`, `/admin/agents`, `/admin/database`, `/admin/system/config`, `/admin/crawler`, `/admin/claude-pane` (use the actual root route for each controller — read it from the controller source)
- **Garbage token curl** — every protected endpoint must return 401:
  - `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer invalid-garbage-token" http://localhost:5150/admin/llm/usage/list` → 401
- **Health curl** — must return 200 without any header:
  - `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150/health` → 200
- **Demo-user curl matrix** — every protected endpoint must return 200:
  - `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:5150/admin/llm/usage/list?limit=3` → 200
  - Repeat one GET per other protected controller.
- **Auth-api down simulation** — temporarily point `AUTH_API_URL` at an invalid host, restart admin-api, curl with a valid token → expect 503 (not 200, not 401). Restore `AUTH_API_URL`. This verifies no-fallback behavior.
- **Low-permission 403 test** (stretch): create or reuse a low-privilege test user if one exists. If non-trivial, document as a manual follow-up and skip — unit tests in Phase 4 already cover the 403 path.
- **Chrome smoke test** — admin web still works identically:
  - Drive Chrome via `mcp__claude-in-chrome__*` tools: create new tab, navigate to `http://localhost:5101/login`
  - Log in as demo-user via the form (use the same JS-based form fill + click pattern from Phase 4.5 live verification)
  - Navigate to `/app/admin/llm/usage`, confirm the table renders
  - Toggle "With Reasoning" filter, confirm list shrinks
  - Expand a reasoning row, confirm `thinkingContent` renders in the monospace pre
- **Latency spot-check**:
  - `time curl -s -o /dev/null -H "Authorization: Bearer $TOKEN" http://localhost:5150/admin/llm/usage/list`
  - Record the real time. Target p50 <100ms total; flag as follow-up if >500ms consistently.

**Gate:**

- All unauth curls returned 401
- All garbage-token curls returned 401
- `/health` returned 200 without auth
- All demo-user curls returned 200 with real data
- Auth-api-down simulation returned 503 (no silent fallback)
- Chrome smoke passes end-to-end
- Latency within target
- Phase review: every §2 success criterion empirically verified.

### Phase 6 — Cleanup + completion report + PR

**Objective:** Confirm no leftover dead code, write `completion-report.md`, commit, push, open PR.

**Scope:**

- Grep checks:
  - `grep -rn "from.*@orchestratorai/planes" apps/admin/api/src/auth --include="*.ts"` — 0 hits
  - `grep -rn "from.*apps/auth/api" apps/admin/api/src --include="*.ts"` — 0 hits
  - `grep -rn "class JwtAuthGuard\|class RbacGuard" apps/admin/api/src --include="*.ts"` — each must have exactly one hit (the local ones in `src/auth/`)
  - `grep -rn "startsWith('Bearer ')" apps/admin/api/src --include="*.ts"` — 0 hits
  - `find apps/admin/api/src -name "jwt-auth.guard.ts" -o -name "rbac.guard.ts"` — each exactly one hit under `src/auth/`
- Run the full repo gates one last time:
  - `npm run lint` — no new errors on any touched file (pre-existing unrelated failures in bridge-web/pulse-api are OK)
  - `npm run build` — clean
  - `npm run test` — all pass (pre-existing unrelated failures documented in prior PRs can stay: bridge-api a2a-router, planes database-contract ENOTFOUND, pulse-api/bridge-web lint)
- Write `docs/efforts/current/completion-report.md` with:
  - Summary of what shipped
  - Phase-by-phase gate results
  - Final permission mapping table (including claude-pane's chosen permission)
  - Any deviations from this PRD and why
  - Latency measurements from Phase 5
  - Whether a low-permission 403 test user was created (and if not, why deferred)
  - Follow-ups captured for forge-api/compose-api/pulse-api/bridge-api (copy this pattern)
  - Follow-up captured: extracting `apps/admin/api/src/auth/` into a shared package once the second consumer lands
- Review commit history on the branch — if it's messy, squash into logical chunks matching the 6 phases.
- `git push -u origin effort/admin-auth-hardening`
- Open a PR via `gh pr create` covering the 6 phases, curl matrix results, invariants verified, and the non-fallback design explicitly called out.
- Run `/pr-eval` on the new PR. Fix any issues surfaced, re-run gates, push fixes.
- Merge to main via the standard merge process. Archive the effort: `mkdir docs/efforts/admin-auth-hardening && git mv docs/efforts/current/*.md docs/efforts/admin-auth-hardening/ && git commit -m "chore(efforts): archive admin-auth-hardening" && git push origin main`.
- Create an email draft in Gmail notifying completion. Draft only — do NOT send.

**Gate:**

- `npm run lint` — no new issues
- `npm run build` — clean
- `npm run test` — all pre-existing green tests still green
- No duplicate class definitions anywhere
- Completion report written and accurate
- PR opened, reviewed, merged, effort archived
- Email draft created (not sent)

---

**End of PRD.** Each phase above has a concrete gate. The effort is done when Phase 6's gate passes and the PR is merged to main.
