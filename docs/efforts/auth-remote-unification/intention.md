# Auth Remote Unification — Extract packages/auth-client + Migrate All Products

## What we're doing

Extracting `apps/admin/api/src/auth/` into a shared `packages/auth-client/` workspace package, then migrating all 5 API products (admin, forge, compose, pulse, bridge) to consume it. This eliminates the 4 independent copies of auth infrastructure (forge, compose, pulse each have their own `JwtAuthGuard`/`RbacGuard`/decorators; admin has the remote-auth `AuthClient`) and converges on one canonical pattern.

After this effort, every product's auth layer is a thin import from `@orchestratorai/auth-client` — no local guard implementations, no local decorator files, no local `mock-guards.ts` test helpers. The package owns the guards, decorators, AuthClient, and test utilities.

## Decision: two auth models coexist in the package

The package ships **two guard implementations**:

1. **Remote guards** (admin-api's current model): `RemoteJwtAuthGuard` + `RemoteRbacGuard` — make an HTTP call to `POST /auth/authorize` on auth-api. Used by admin-api (latency-insensitive dashboards).

2. **In-process guards** (forge/compose/pulse's current model): `InProcessJwtAuthGuard` + `InProcessRbacGuard` — validate tokens locally via `IdentityProvider` and check permissions via `RbacService`. Used by forge/compose/pulse (latency-sensitive agent workflows).

Each product picks which model to use at module registration time. This is NOT a cop-out — it's the architecturally correct answer. Admin-api doesn't need to carry `IdentityProvider` + `RbacService` dependencies; forge-api doesn't need the HTTP round-trip. The package provides both; each product chooses.

Bridge-api uses `InProcessJwtAuthGuard` only (no `RbacGuard` — appropriate for A2A gateway).

**StreamTokenService stays product-local.** It's forge-api-specific SSE infrastructure that doesn't belong in a shared auth package. SSE routes in forge-api remain `@Public()` and use stream tokens via forge-api's local `StreamTokenService`. Option A from the Phase 2 doc.

## Phasing

### Phase 1: Extract `packages/auth-client/`

Create the shared package with:
- `RemoteJwtAuthGuard`, `RemoteRbacGuard`, `AuthClient` (from admin-api's `src/auth/`)
- `InProcessJwtAuthGuard`, `InProcessRbacGuard` (from forge-api's `src/auth/guards/` + `src/rbac/guards/`)
- `@RequirePermission`, `@Public`, `PERMISSION_KEY`, `IS_PUBLIC_KEY` decorators
- `AuthModule.forRemote()` and `AuthModule.forInProcess()` static factory methods
- Shared `mock-guards.ts` test utilities
- `package.json` with workspace wiring

### Phase 2: Migrate admin-api

- Delete `apps/admin/api/src/auth/` (entire folder)
- Delete `apps/admin/api/src/test-utils/mock-guards.ts`
- Import `AuthModule.forRemote()` from `@orchestratorai/auth-client`
- Import guards + decorators from `@orchestratorai/auth-client`
- Update all controller imports
- Update all test imports
- Verify: admin-api curl matrix still passes, 108/108 tests green

### Phase 3: Migrate forge-api

- Delete `apps/forge/api/src/auth/guards/jwt-auth.guard.ts`, `apps/forge/api/src/rbac/guards/rbac.guard.ts`, `apps/forge/api/src/rbac/decorators/require-permission.decorator.ts`, `apps/forge/api/src/auth/decorators/public.decorator.ts`
- Delete `apps/forge/api/src/test-utils/mock-guards.ts`
- Keep `apps/forge/api/src/auth/` folder for: `auth.controller.ts`, `auth.service.ts`, `services/stream-token.service.ts`, `dto/`, `interfaces/` (auth-module-specific, not shared)
- Keep `apps/forge/api/src/rbac/rbac.controller.ts`, `rbac.service.ts`, `rbac.module.ts` (RBAC management endpoints stay product-local; the guard + decorator move to the package)
- Import `AuthModule.forInProcess()` from `@orchestratorai/auth-client`
- Update all controller guard imports (27 controllers)
- Update all test imports
- Verify: forge-api curl matrix, 1648+ tests green

### Phase 4: Migrate compose-api

Same pattern as forge-api. 19 controllers.

### Phase 5: Migrate pulse-api + bridge-api

Same pattern. Pulse uses `forInProcess()`. Bridge uses `forInProcess()` with JwtAuthGuard only (no RbacGuard — the package's `AuthModule.forBridge()` or just `forInProcess({ rbac: false })` if we want to be clean).

### Phase 6: Completion + PR

## Done when

- `packages/auth-client/` exists as a workspace package consumed by all 5 products
- Zero local guard implementations in any product's `src/auth/guards/` or `src/rbac/guards/` (except `StreamTokenService` in forge-api)
- Zero local `require-permission.decorator.ts` or `public.decorator.ts` in any product
- Zero local `mock-guards.ts` in any product
- Every product's curl matrix still passes
- Every product's test suite still passes
- `npm run build` clean across the monorepo

## Explicitly NOT in scope

- Changing any controller's permission mapping (frozen from the auth hardening efforts)
- Changing any endpoint's behavior
- Adding new auth-api endpoints
- StreamTokenService migration (stays local to forge-api — Option A decided)
- Webhook signature verification
- Signed-URL for asset streams
