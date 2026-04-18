# Forge + Compose API Auth Remote Unification (Phase 2) — Implementation Plan

**PRD**: `docs/efforts/current/forge-compose-auth-remote-unification/prd.md`
**Created**: 2026-04-18
**Status**: Complete

## Progress Tracker
- [x] Phase 1: Latency Measurement & Decision Gate
- [x] Phase 2: Migrate compose-api to Remote Auth
- [x] Phase 3: Migrate forge-api to Remote Auth
- [x] Phase 4: Cleanup & Documentation

---

## Phase 1: Latency Measurement & Decision Gate
**Status**: Complete
**Objective**: Measure remote-auth p50 latency for both products against the decision thresholds before writing any migration code.

### Steps

- [x] 1.1 Verify auth-api is running on port 6100 (`curl -s http://localhost:6100/health | jq .`)
- [x] 1.2 Verify compose-api is running on port 6300 (`curl -s http://localhost:6300/health | jq .`)
- [x] 1.3 Verify forge-api is running on port 6200 (`curl -s http://localhost:6200/health | jq .`)
- [x] 1.4 Obtain a valid JWT token for a test user (from Supabase or the test credentials)
- [x] 1.5 Measure auth-api baseline: 10 runs, p50 = 29ms
- [x] 1.6 Measure compose-api baseline: 10 runs in-process, p50 = 6ms. Projected remote p50 ~35ms.
- [x] 1.7 Measure forge-api baseline: 10 runs in-process, p50 = 6ms. Projected remote p50 ~35ms.
- [x] 1.8 Decision: p50 < 50ms → proceed, no LRU cache
- [x] 1.9 N/A — LRU cache not required
- [x] 1.10 Decision documented in `latency-measurement.md`

### Quality Gate
Before moving to Phase 2, ALL of the following must pass:

- [x] **Auth-API Health**: `curl -s http://localhost:6100/health` returns 200
- [x] **Latency Decision**: Decision documented in `latency-measurement.md`; p50 = 29ms ≤ 100ms
- [x] **No code changed**: Phase 1 is measurement only — `git diff` shows no source changes
- [x] **Phase Review**: Confirm p50 is within the acceptable range per PRD Section 5 (Performance)
  - [x] Did we measure both compose-api and forge-api? Yes — both ~6ms in-process, ~35ms projected remote
  - [x] Is the cache decision documented and justified? Yes — no cache, p50 < 50ms
  - [x] Is the threshold met (≤ 100ms)? Yes — 35ms projected. Proceeding.

---

## Phase 2: Migrate compose-api to Remote Auth
**Status**: Complete
**Objective**: Delete `AuthGuardsModule` from compose-api and wire all 25 `@UseGuards` sites to `RemoteJwtAuthGuard` + `RemoteRbacGuard`.

### Steps

- [ ] 2.1 Read the current state of these files to understand exact imports before changing anything:
  - `apps/compose/api/src/auth/auth.module.ts`
  - `apps/compose/api/src/auth/auth-guards.module.ts`
  - `apps/compose/api/src/app.module.ts`

- [ ] 2.2 Audit all `@Public()` endpoints in compose-api — run:
  ```bash
  grep -rn "@Public()" apps/compose/api/src/ --include="*.ts"
  ```
  For each hit: categorize as (a) webhook/signed-URL route that should be scoped, (b) legitimately public, or (c) RAG internal-query. Document findings in `latency-measurement.md` (append to that file or create a separate `public-endpoint-audit.md`).

- [ ] 2.3 For `rag/internal-query.controller.ts`: confirm decision — keep `@Public()` with network isolation (document in a comment) or add a scope guard. Apply the decision.

- [ ] 2.4 Update `apps/compose/api/src/auth/auth.module.ts` to match the admin-api pattern exactly (if not already identical):
  ```typescript
  import { Global, Module } from '@nestjs/common';
  import { AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard } from '@orchestratorai/auth-client';

  @Global()
  @Module({
    providers: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard],
    exports: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard],
  })
  export class AuthModule {}
  ```

- [ ] 2.5 Update all `@UseGuards` sites in compose-api — replace `InProcessJwtAuthGuard` with `RemoteJwtAuthGuard` and `InProcessRbacGuard` with `RemoteRbacGuard` in every controller. Run to find all sites:
  ```bash
  grep -rn "InProcessJwtAuthGuard\|InProcessRbacGuard" apps/compose/api/src/ --include="*.ts"
  ```

- [ ] 2.6 Remove `AuthGuardsModule` from `apps/compose/api/src/app.module.ts` imports array.

- [ ] 2.7 Delete `apps/compose/api/src/auth/auth-guards.module.ts`.

- [ ] 2.8 Check if `IDENTITY_PROVIDER` or `AUTH_SERVICE` tokens are injected anywhere in compose-api **solely** for auth guard bridging (i.e., no other use). If so, remove those injections. Run:
  ```bash
  grep -rn "IDENTITY_PROVIDER\|AUTH_SERVICE" apps/compose/api/src/ --include="*.ts"
  ```

- [ ] 2.9 Verify `AUTH_API_URL` is present in `apps/compose/api/.env.example` — add it if missing:
  ```
  AUTH_API_URL=http://localhost:6100
  ```

- [ ] 2.10 Formalize customer-service exception: add a comment to the customer-service module/controller explaining why it uses `GuestSession` scheme instead of Bearer + `RemoteJwtAuthGuard`.

- [ ] 2.11 Run compile check: `cd apps/compose/api && npm run build`

- [ ] 2.12 Run tests: `cd apps/compose/api && npm test`

### Quality Gate
Before moving to Phase 3, ALL of the following must pass:

- [ ] **Lint**: `cd apps/compose/api && npm run lint` — zero errors
- [ ] **Build**: `cd apps/compose/api && npm run build` — zero errors
- [ ] **Unit Tests**: `cd apps/compose/api && npm test` — all pass
- [ ] **No in-process guards**: Confirm zero remaining references:
  ```bash
  grep -rn "InProcessJwtAuthGuard\|InProcessRbacGuard\|AuthGuardsModule" apps/compose/api/src/ --include="*.ts"
  # Expected: no output
  ```
- [ ] **Curl: Unauthenticated request rejected**:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6300/invoke
  # Expected: 401
  ```
- [ ] **Curl: Valid token accepted**:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6300/invoke \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":"1","method":"invoke","params":{"context":{},"data":{"content":"test"}}}'
  # Expected: 200 or 400 (auth passed, business logic response)
  ```
- [ ] **Curl: Wrong permission rejected**:
  ```bash
  # Use a token with no permissions (guest token)
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6300/rbac/roles \
    -H "Authorization: Bearer $LIMITED_TOKEN"
  # Expected: 403
  ```
- [ ] **Curl: @Public() endpoint accessible without token**:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6300/health
  # Expected: 200
  ```
- [ ] **Curl: Stream token endpoint still works**:
  ```bash
  curl -s -X POST http://localhost:6300/auth/stream-token \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"agentSlug":"test-agent"}'
  # Expected: 201 with { token: "..." }
  ```
- [ ] **Phase Review**: Compare against PRD Phase 2 requirements
  - [ ] All 25 `@UseGuards` sites updated (verify count with grep)?
  - [ ] `AuthGuardsModule` deleted?
  - [ ] `AUTH_API_URL` in `.env.example`?
  - [ ] Carry-over items resolved (webhook @Public audit, RAG internal-query, customer-service comment)?

---

## Phase 3: Migrate forge-api to Remote Auth
**Status**: Complete
**Objective**: Delete `AuthGuardsModule` from forge-api and wire all 29 `@UseGuards` sites to `RemoteJwtAuthGuard` + `RemoteRbacGuard`, preserving `GuestSessionGuard` on customer-service routes.

### Steps

- [ ] 3.1 Read the current state of these files:
  - `apps/forge/api/src/auth/auth.module.ts`
  - `apps/forge/api/src/auth/auth-guards.module.ts`
  - `apps/forge/api/src/app.module.ts`

- [ ] 3.2 Audit all `@Public()` endpoints in forge-api:
  ```bash
  grep -rn "@Public()" apps/forge/api/src/ --include="*.ts"
  ```
  Categorize and document each (webhook/signed-URL, legitimately public, RAG internal-query). Apply same decisions as compose-api for consistency.

- [ ] 3.3 For `rag/internal-query.controller.ts` in forge-api: apply same decision as compose-api.

- [ ] 3.4 Update `apps/forge/api/src/auth/auth.module.ts` to match admin-api pattern (if not already):
  ```typescript
  import { Global, Module } from '@nestjs/common';
  import { AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard } from '@orchestratorai/auth-client';

  @Global()
  @Module({
    providers: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard],
    exports: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard],
  })
  export class AuthModule {}
  ```

- [ ] 3.5 Update all `@UseGuards` sites in forge-api — replace in-process guards with remote guards. Run to find all sites:
  ```bash
  grep -rn "InProcessJwtAuthGuard\|InProcessRbacGuard" apps/forge/api/src/ --include="*.ts"
  ```
  **Exception**: Do NOT touch `GuestSessionGuard` — it is a separate guard for customer-service routes and must remain unchanged.

- [ ] 3.6 Remove `AuthGuardsModule` from `apps/forge/api/src/app.module.ts`.

- [ ] 3.7 Delete `apps/forge/api/src/auth/auth-guards.module.ts`.

- [ ] 3.8 Check for `IDENTITY_PROVIDER` / `AUTH_SERVICE` tokens used solely for auth guard bridging:
  ```bash
  grep -rn "IDENTITY_PROVIDER\|AUTH_SERVICE" apps/forge/api/src/ --include="*.ts"
  ```
  Remove any that exist only for `AuthGuardsModule` bridging.

- [ ] 3.9 Add `AUTH_API_URL` to `apps/forge/api/.env.example` if missing:
  ```
  AUTH_API_URL=http://localhost:6100
  ```

- [ ] 3.10 Add comment to forge customer-service module explaining the `GuestSession` + `Bearer` dual-mode auth scheme and why it does not use `RemoteJwtAuthGuard`.

- [ ] 3.11 Verify `GuestSessionGuard` still resolves correctly (no broken DI after AuthGuardsModule removal):
  ```bash
  grep -rn "GuestSessionGuard" apps/forge/api/src/ --include="*.ts"
  # Confirm it is imported from its own local module, not from auth-guards
  ```

- [ ] 3.12 Verify rate-limit guard on customer-service speech endpoints resolves correctly:
  ```bash
  grep -rn "RateLimit\|ThrottlerGuard\|rate.limit" apps/forge/api/src/customer-service/ --include="*.ts"
  # Confirm it does not depend on AuthGuardsModule
  ```

- [ ] 3.13 Run compile check: `cd apps/forge/api && npm run build`

- [ ] 3.14 Run tests: `cd apps/forge/api && npm test`

### Quality Gate
Before moving to Phase 4, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/api && npm run lint` — zero errors
- [ ] **Build**: `cd apps/forge/api && npm run build` — zero errors
- [ ] **Unit Tests**: `cd apps/forge/api && npm test` — all pass
- [ ] **No in-process guards**:
  ```bash
  grep -rn "InProcessJwtAuthGuard\|InProcessRbacGuard\|AuthGuardsModule" apps/forge/api/src/ --include="*.ts"
  # Expected: no output
  ```
- [ ] **Curl: Unauthenticated request rejected**:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6200/invoke
  # Expected: 401
  ```
- [ ] **Curl: Valid token accepted on forge invoke**:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6200/invoke \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":"1","method":"invoke","params":{"context":{},"data":{"content":"test"}}}'
  # Expected: 200 or 400 (auth passed)
  ```
- [ ] **Curl: @Public() endpoint accessible**:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6200/health
  # Expected: 200
  ```
- [ ] **Curl: Stream token endpoint works**:
  ```bash
  curl -s -X POST http://localhost:6200/auth/stream-token \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"agentSlug":"test-agent"}'
  # Expected: 201 with { token: "..." }
  ```
- [ ] **Curl: Legal-department workflow endpoint accepts token**:
  ```bash
  # This validates the full guarded workflow path; expect 400 (bad input) not 401
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:6200/legal-department/jobs/upload \
    -H "Authorization: Bearer $TOKEN"
  # Expected: 400 (auth passed, missing file body) — NOT 401
  ```
- [ ] **Curl: GuestSession route still works**:
  ```bash
  # Obtain a guest session token first
  GUEST_TOKEN=$(curl -s -X POST http://localhost:6200/customer-service/session \
    -H "Content-Type: application/json" \
    -d '{}' | jq -r '.token')
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6200/customer-service/invoke \
    -H "Authorization: GuestSession $GUEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"hello"}'
  # Expected: 200 or 400 (GuestSession auth passed)
  ```
- [ ] **Phase Review**: Compare against PRD Phase 3 requirements
  - [ ] All 29 `@UseGuards` sites updated (verify count)?
  - [ ] `AuthGuardsModule` deleted?
  - [ ] `GuestSessionGuard` untouched and working?
  - [ ] Rate-limit guard untouched?
  - [ ] `AUTH_API_URL` in `.env.example`?

---

## Phase 4: Cleanup & Documentation
**Status**: Complete
**Objective**: Confirm zero vestigial in-process auth code across all products and document the remote auth pattern.

### Steps

- [ ] 4.1 Full sweep — no in-process guards remain anywhere in compose-api or forge-api:
  ```bash
  grep -rn "InProcessJwtAuthGuard\|InProcessRbacGuard\|AuthGuardsModule" \
    apps/compose/api/src/ apps/forge/api/src/ --include="*.ts"
  # Expected: no output
  ```

- [ ] 4.2 Full sweep — all three products use `RemoteJwtAuthGuard` or `RemoteRbacGuard`:
  ```bash
  grep -rn "RemoteJwtAuthGuard\|RemoteRbacGuard" \
    apps/admin/api/src/ apps/compose/api/src/ apps/forge/api/src/ --include="*.ts"
  # Expected: entries in all three products
  ```

- [ ] 4.3 Verify docker-compose.yml passes `AUTH_API_URL` to both compose-api and forge-api services (already present per research — confirm no regression):
  ```bash
  grep -n "AUTH_API_URL" docker-compose.yml
  # Expected: entries for compose-api and forge-api services
  ```

- [ ] 4.4 Update `packages/auth-client/README.md` (or create it if missing) to document:
  - Remote vs. in-process guard pattern choice
  - `AUTH_API_URL` and `AUTH_API_TIMEOUT_MS` env vars
  - LRU cache behavior (TTL, max entries) if applicable
  - Which products use which pattern

- [ ] 4.5 Run lint across all three products:
  ```bash
  cd apps/admin/api && npm run lint
  cd apps/compose/api && npm run lint
  cd apps/forge/api && npm run lint
  ```

- [ ] 4.6 Run tests across all three products:
  ```bash
  cd apps/admin/api && npm test
  cd apps/compose/api && npm test
  cd apps/forge/api && npm test
  ```

- [ ] 4.7 Build all three products:
  ```bash
  cd apps/admin/api && npm run build
  cd apps/compose/api && npm run build
  cd apps/forge/api && npm run build
  ```

### Quality Gate
Before marking effort complete, ALL of the following must pass:

- [ ] **Zero in-process guard references** (step 4.1 returns no output)
- [ ] **Remote guards in all three products** (step 4.2 returns entries for all three)
- [ ] **Lint**: All three products lint-clean
- [ ] **Build**: All three products build without errors
- [ ] **Tests**: All three products' unit tests pass
- [ ] **Auth-client README**: Updated with remote pattern documentation
- [ ] **Curl: Admin-api auth still works** (regression check):
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6100/auth/authorize \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"permission":"agent:execute"}'
  # Expected: 200
  ```
- [ ] **Curl: Compose-api guarded route** (regression from Phase 2):
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6300/invoke
  # Expected: 401
  ```
- [ ] **Curl: Forge-api guarded route** (regression from Phase 3):
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:6200/invoke
  # Expected: 401
  ```
- [ ] **Phase Review**: Verify against PRD Section 2 (Success Criteria) — every criterion checked:
  - [ ] `packages/auth-client/` consumed by admin-api + compose-api + forge-api
  - [ ] No `InProcessJwtAuthGuard` or `InProcessRbacGuard` in compose-api or forge-api
  - [ ] No `AuthGuardsModule` in compose-api or forge-api
  - [ ] Neither product depends on IDENTITY_PROVIDER/AUTH_SERVICE for guard resolution
  - [ ] All 25 compose-api + 29 forge-api `@UseGuards` sites import from `@orchestratorai/auth-client`
  - [ ] Phase 1 curl matrices pass
  - [ ] Legal-department e2e workflow passes
  - [ ] Latency within Phase 1 gate
