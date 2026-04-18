# Forge + Compose API Auth Remote Unification (Phase 2) — Product Requirements Document

## 1. Overview

Migrates compose-api and forge-api from their in-process `AuthGuardsModule` bridge pattern to the remote-authorization pattern already used by admin-api. Both products currently inject `InProcessJwtAuthGuard` and `InProcessRbacGuard` via a bridge module that wires `IDENTITY_PROVIDER`, `AUTH_SERVICE`, `RBAC_SERVICE`, and `STREAM_TOKEN_SERVICE` tokens from local planes. After this effort, both products will use `RemoteJwtAuthGuard` + `RemoteRbacGuard` backed by `POST /auth/authorize` on auth-api — the same pattern admin-api uses today.

Note: `packages/auth-client/` already exists and ships both in-process and remote guard implementations. The extraction step described in the original intention is already complete. This effort is purely migration.

---

## 2. Goals & Success Criteria

### Goals
1. Delete `AuthGuardsModule` (bridge modules) from compose-api and forge-api.
2. Replace in-process guards with remote guards across all `@UseGuards` sites in both products.
3. Validate latency is within acceptable bounds before any code migration.
4. Resolve carry-over items from Phase 1 (webhook/asset @Public scoping, RAG internal query, customer-service formalization).

### Success Criteria
- `packages/auth-client/` is the sole auth implementation consumed by admin-api, compose-api, and forge-api.
- No `InProcessJwtAuthGuard` or `InProcessRbacGuard` imports remain in compose-api or forge-api.
- No `AuthGuardsModule` exists in compose-api or forge-api.
- Neither product depends on `IDENTITY_PROVIDER` or `AUTH_SERVICE` plane tokens for guard resolution.
- All 25 compose-api `@UseGuards` sites and all 29 forge-api `@UseGuards` sites reference guards from `@orchestratorai/auth-client`.
- Phase 1 curl verification matrices for both products pass unchanged.
- Legal-department end-to-end workflow (forge `POST /legal-department/jobs/upload`) passes unchanged.
- Latency p50 ≤ 100ms for both products under remote auth (with LRU cache if 50–100ms range).

---

## 3. User Stories / Use Cases

**Platform engineers** need a single, maintainable auth implementation. Today, a bug in in-process RBAC must be fixed in three places (admin, compose, forge). After this effort, one fix in `packages/auth-client/` propagates everywhere.

**Security team** needs auth decisions centralized in auth-api so audit logs, permission changes, and token revocation have one enforcement point rather than three per-product copies of the permission check logic.

**Operators** need to tune auth timeouts and caching in one place (`AUTH_API_URL`, `AUTH_API_TIMEOUT_MS`, LRU TTL env vars) rather than per-product plane configurations.

---

## 4. Technical Requirements

### 4.1 Architecture

**Target state** (identical to admin-api today):
```
Request → RemoteJwtAuthGuard → POST /auth/authorize → AuthorizeResult
                              (AuthClient service)
```

**Current state** (compose-api and forge-api):
```
Request → InProcessJwtAuthGuard → IDENTITY_PROVIDER plane (Supabase JWT verify)
        → InProcessRbacGuard    → AUTH_SERVICE plane + local RbacService (permission check)
```

The `AuthGuardsModule` bridge in each product wires four tokens:
- `IDENTITY_PROVIDER` → planes identity provider
- `AUTH_SERVICE` → planes auth service
- `STREAM_TOKEN_SERVICE` → local StreamTokenService (already a re-export shim from auth-client)
- `RBAC_SERVICE` → local RbacService

After migration, `AuthGuardsModule` is deleted entirely. A minimal `AuthModule` (identical to admin-api's) provides `AuthClient`, `RemoteJwtAuthGuard`, and `RemoteRbacGuard` as @Global providers. No plane tokens needed for auth guards.

**Customer-service guest sessions** (`GuestSessionGuard` in forge, guest JWT in compose) are orthogonal to this migration. They use a separate `GuestSession` auth scheme and are not affected.

**StreamTokenService** is already extracted into `packages/auth-client/` and already re-exported from both products' `auth/services/` shims. No change needed for stream token handling.

### 4.2 Data Model Changes

None. Auth decisions remain in auth-api's existing permission tables.

### 4.3 API Changes

#### Environment variables added to compose-api and forge-api
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AUTH_API_URL` | Yes | — | Base URL for auth-api (e.g., `http://localhost:6100`) |
| `AUTH_API_TIMEOUT_MS` | No | `2000` | Per-request timeout for POST /auth/authorize |

#### Auth-API endpoint consumed (already exists)
```
POST /auth/authorize
Authorization: Bearer <JWT>
Body: { permission, organizationSlug?, resourceType?, resourceId? }
Response: { allowed: true, userId, email, orgSlug, orgId, roles, permission }
```

No changes to auth-api itself.

### 4.4 Frontend Changes

None. Auth flow is transparent to web frontends.

### 4.5 Infrastructure Requirements

- Auth-api must be reachable from compose-api and forge-api processes (already true in local dev: port 6100; in Docker: `host.docker.internal:6100` or service DNS).
- LRU cache in `AuthClient` must be enabled if latency measurement shows p50 in 50–100ms range (TTL 30s, max entries 1000).

---

## 5. Non-Functional Requirements

### Performance
- Latency gate: p50 < 50ms → proceed without cache. 50–100ms → proceed with LRU cache. >100ms → stop and fix before migrating.
- Forge legal-department workflows are latency-sensitive. Each LLM step may invoke auth once; total auth overhead must not materially affect workflow duration.

### Security
- Remote auth concentrates permission enforcement in auth-api. This is a security improvement: permission changes take effect immediately without product redeployment.
- `AUTH_API_URL` must not be user-controllable. It is a server-side env var.
- LRU cache (if used) must respect TTL strictly. Stale permission grants are a security risk.

### Reliability
- `AuthClient` already maps 401 → UnauthorizedException, 403 → ForbiddenException, 5xx → ServiceUnavailableException. These propagate correctly — no swallowing.
- If auth-api is unreachable, requests fail-open is unacceptable. `ServiceUnavailableException` is the correct behavior.

### Compatibility
- Phase 1 curl verification matrices for both products must pass unchanged.
- No permission vocabulary changes.

---

## 6. Out of Scope

- New features in compose-api or forge-api.
- Changes to permission mappings or permission vocabulary (frozen at Phase 1).
- Migrating pulse-api or bridge-api.
- Changes to auth-api.
- Replacing customer-service guest session auth with bearer tokens.
- Removing `IDENTITY_PROVIDER` or `AUTH_SERVICE` plane usage outside of the `AuthGuardsModule` bridge (other uses, if any, are not touched).

---

## 7. Dependencies & Risks

### Dependencies
- Auth-api must be running and healthy during migration testing.
- `packages/auth-client/` v1 (already released) — `RemoteJwtAuthGuard`, `RemoteRbacGuard`, `AuthClient` must export correctly.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Latency >100ms blocks migration | Low | High | Measure first (Phase 1); if exceeded, profile auth-api before proceeding |
| LRU cache serves stale permission denial after role grant | Medium | Medium | TTL 30s is short; document cache existence in auth-client README |
| `@Public()` endpoints accidentally double-verified | Low | Low | RemoteJwtAuthGuard honors `@Public()` decorator — same as in-process |
| RAG internal-query endpoint exposed without isolation | Medium | High | Must decide @Public + network isolation or add guard before migration ships |
| Customer-service GuestSession routes broken | Low | High | These use a separate guard path; verify end-to-end in Phase 3 QA |

---

## 8. Phasing

### Phase 1: Latency Measurement & Decision Gate

**Goal:** Establish baseline and post-migration latency numbers and make the cache decision before writing any migration code.

**Work:**
1. Spin up compose-api pointing at a prototype `RemoteJwtAuthGuard` (or direct AuthClient curl) and run 10 consecutive requests through a context → RAG → API runner chain. Record p50 latency.
2. Repeat for forge: run `POST /legal-department/jobs/upload` NDA workflow end-to-end 10 times. Record p50.
3. Compare to baseline (current in-process numbers).
4. Apply decision rule: <50ms → no cache, 50–100ms → enable LRU cache in AuthClient, >100ms → stop.
5. If cache required: verify `AuthClient` LRU cache is wired (it exists in the codebase; confirm TTL and max-entries env vars).

**Gate:** Decision documented. If >100ms, effort is blocked pending auth-api optimization.

---

### Phase 2: Migrate compose-api

**Goal:** compose-api uses `RemoteJwtAuthGuard` + `RemoteRbacGuard` exclusively.

**Work:**
1. Delete `apps/compose/api/src/auth/auth-guards.module.ts`.
2. Create `apps/compose/api/src/auth/auth.module.ts` (matching admin-api pattern: @Global, provides `AuthClient` + `RemoteJwtAuthGuard` + `RemoteRbacGuard`).
3. Update `apps/compose/api/src/app.module.ts` to import `AuthModule` instead of `AuthGuardsModule`.
4. Update all 25 `@UseGuards` import sites: replace `InProcessJwtAuthGuard` → `RemoteJwtAuthGuard`, `InProcessRbacGuard` → `RemoteRbacGuard`, sourced from `@orchestratorai/auth-client`.
5. Remove `IDENTITY_PROVIDER` and `AUTH_SERVICE` plane injections that existed solely for `AuthGuardsModule`.
6. Add `AUTH_API_URL` to compose-api `.env.example` and Docker config.
7. Carry-over: audit all `@Public()` endpoints in compose-api — webhook/asset signed-URL routes should be scoped (e.g., verify signed-URL signature instead of `@Public()`). Document or implement scoping for each.
8. Carry-over: resolve `rag/internal-query.controller.ts` `@Public()` decision (document network isolation requirement or add scope guard).
9. Carry-over: formalize customer-service exception (document why these endpoints bypass standard bearer auth).

**Verification:** Run Phase 1 curl matrix for compose-api. All routes that previously required auth must still require auth. All `@Public()` routes must still be publicly accessible.

---

### Phase 3: Migrate forge-api

**Goal:** forge-api uses `RemoteJwtAuthGuard` + `RemoteRbacGuard` exclusively.

**Work:**
1. Delete `apps/forge/api/src/auth/auth-guards.module.ts`.
2. Create `apps/forge/api/src/auth/auth.module.ts` (admin-api pattern).
3. Update `apps/forge/api/src/app.module.ts`.
4. Update all 29 `@UseGuards` import sites.
5. Remove `IDENTITY_PROVIDER` and `AUTH_SERVICE` plane injections that existed solely for `AuthGuardsModule`.
6. Add `AUTH_API_URL` to forge-api `.env.example` and Docker config.
7. Carry-over: audit all `@Public()` endpoints in forge-api — webhook/asset signed-URL routes should be scoped. Document or implement scoping for each.
8. Carry-over: resolve `rag/internal-query.controller.ts` @Public() (same decision as compose).
9. Carry-over: verify `GuestSessionGuard` on customer-service endpoints is unaffected (it uses a separate auth scheme).
10. Carry-over: verify rate-limit guard on customer-service speech endpoints is unaffected.

**Verification:** Run Phase 1 curl matrix for forge-api. Run `POST /legal-department/jobs/upload` NDA workflow end-to-end. Confirm latency within Phase 1 gate.

---

### Phase 4: Cleanup & Documentation

**Goal:** No vestigial in-process auth code remains in compose or forge.

**Work:**
1. Confirm no `InProcessJwtAuthGuard` or `InProcessRbacGuard` imports exist in compose-api or forge-api (`grep` sweep).
2. Confirm no `AuthGuardsModule` files remain.
3. Confirm neither product's `app.module.ts` imports planes tokens for auth purposes.
4. Update `packages/auth-client/README.md` to document the remote pattern, LRU cache behavior, and `AUTH_API_URL` env vars.
5. Update Docker Compose service definitions to pass `AUTH_API_URL` for compose-api and forge-api.

**Gate:** All three products (admin-api, compose-api, forge-api) use identical remote auth wiring. Zero in-process guard code in any product.
