# Auth Remote Unification — Product Requirements Document

## 1. Overview

Five API products each carry their own copy of auth infrastructure. Forge, compose, and pulse have **byte-for-byte identical** in-process `JwtAuthGuard` (256 lines) + `RbacGuard` (170 lines) + decorators. Admin-api has a different remote-auth `AuthClient` + guards. Bridge has a minimal `JwtAuthGuard` with no RBAC. Three `mock-guards.ts` test helpers exist in admin/forge/compose.

This effort extracts all shared auth code into `packages/auth-client/`, deletes the local copies, and updates every import across 77 controllers in 5 products. No behavioral changes — pure deduplication.

## 2. Goals & Success Criteria

- `packages/auth-client/` exists as a workspace package exporting: in-process guards, remote AuthClient + guards, decorators, and test utilities
- Zero local guard implementations in any product's `src/auth/guards/` or `src/rbac/guards/` (except forge-api's `StreamTokenService` which stays local)
- Zero local `require-permission.decorator.ts` or `public.decorator.ts` in any product
- Zero local `mock-guards.ts` in any product
- Every product's existing curl matrix and test suite passes unchanged
- `npm run build` clean across the full monorepo
- Admin-api continues using remote auth; forge/compose/pulse continue using in-process auth; bridge continues using JwtAuthGuard-only — no product changes its auth model

## 3. User Stories

**Developer adding auth to a new product**
> As a developer building a new API product (e.g., assistant-api), I want to `import { AuthModule } from '@orchestratorai/auth-client'` and have guards + decorators ready to use, instead of copy-pasting 400+ lines from forge-api.

**Developer maintaining auth guards**
> As a developer fixing a bug in `JwtAuthGuard`, I want to fix it once in `packages/auth-client/` instead of patching 4 identical copies across forge/compose/pulse/bridge.

## 4. Technical Requirements

### 4.1 Architecture

**Package structure:**

```
packages/auth-client/
  src/
    guards/
      in-process-jwt-auth.guard.ts   ← from forge-api (identical to compose/pulse)
      in-process-rbac.guard.ts       ← from forge-api (identical to compose/pulse)
      remote-jwt-auth.guard.ts       ← from admin-api
      remote-rbac.guard.ts           ← from admin-api
      bridge-jwt-auth.guard.ts       ← from bridge-api (simpler, no RBAC deps)
    decorators/
      public.decorator.ts            ← shared (identical across all products)
      require-permission.decorator.ts ← shared (forge/compose/pulse version — richer than admin's)
      current-user.decorator.ts       ← shared
      roles.decorator.ts              ← shared
    services/
      auth-client.service.ts          ← from admin-api (HTTP client for POST /auth/authorize)
    test-utils/
      mock-guards.ts                  ← consolidated from admin/forge/compose versions
    index.ts                          ← barrel export
  package.json
  tsconfig.build.json
```

**Key design decisions:**

1. **No NestJS module in the package.** The package exports classes and decorators. Each product wires its own `AuthModule` that registers the appropriate guard classes as providers. This avoids the package needing to know about each product's dependency graph (IDENTITY_PROVIDER, AUTH_SERVICE, RbacService, StreamTokenService, ConfigService are all product-provided).

2. **StreamTokenService stays in forge-api.** The in-process JwtAuthGuard has `@Optional() @Inject(StreamTokenService)` — when the consuming product doesn't register `StreamTokenService`, the guard skips the stream-token path. Forge-api registers it; compose/pulse/bridge don't.

3. **Bridge gets its own guard variant.** Bridge's JwtAuthGuard is simpler (no IDENTITY_PROVIDER, no AUTH_SERVICE — uses a different validation path). Rather than forcing bridge onto the heavier in-process guard, keep a `bridge-jwt-auth.guard.ts` that matches bridge's current behavior.

4. **Decorators are unified.** The forge/compose/pulse `require-permission.decorator.ts` is the richest version (supports `resourceParam`). Admin-api's is simpler. Use the richer version as the canonical one — admin-api's simpler usage is a subset. Admin-api may need to update its import path but not its usage.

**Per-product migration:**

| Product | Current guard source | New import | What's deleted locally |
|---|---|---|---|
| Admin-api | `src/auth/` (remote) | `@orchestratorai/auth-client` RemoteJwtAuthGuard + RemoteRbacGuard + AuthClient + decorators | `src/auth/auth-client.service.ts`, `src/auth/jwt-auth.guard.ts`, `src/auth/rbac.guard.ts`, `src/auth/decorators/`, `src/auth/auth.module.ts`, `src/auth/index.ts`, `src/test-utils/mock-guards.ts` |
| Forge-api | `src/auth/guards/` + `src/rbac/guards/` + `src/rbac/decorators/` (in-process) | `@orchestratorai/auth-client` InProcessJwtAuthGuard + InProcessRbacGuard + decorators | `src/auth/guards/jwt-auth.guard.ts`, `src/auth/guards/roles.guard.ts`, `src/rbac/guards/rbac.guard.ts`, `src/rbac/decorators/require-permission.decorator.ts`, `src/auth/decorators/public.decorator.ts`, `src/auth/decorators/roles.decorator.ts`, `src/auth/decorators/current-user.decorator.ts`, `src/test-utils/mock-guards.ts` |
| Compose-api | Same as forge (byte-identical) | Same as forge | Same as forge |
| Pulse-api | Same as forge (byte-identical) | Same as forge | Same as forge |
| Bridge-api | `src/auth/guards/jwt-auth.guard.ts` + `src/auth/decorators/public.decorator.ts` | `@orchestratorai/auth-client` BridgeJwtAuthGuard + Public decorator | `src/auth/guards/jwt-auth.guard.ts`, `src/auth/decorators/public.decorator.ts` |

**What stays local in each product:**

- `auth.controller.ts`, `auth.service.ts`, `auth.module.ts` (the auth endpoints + module wiring are product-specific)
- `services/stream-token.service.ts` (forge-only)
- `rbac.controller.ts`, `rbac.service.ts`, `rbac.module.ts` (RBAC management endpoints are product-specific)
- `interfaces/` and `dto/` (product-specific types)

### 4.2 Data Model Changes

**None.**

### 4.3 API Changes

**None.** No endpoints change. No request/response shapes change. No auth behavior changes.

### 4.4 Frontend Changes

**None.** Frontends don't import from the auth packages.

### 4.5 Infrastructure Requirements

**New workspace package:** Add `packages/auth-client` to root `package.json` workspaces array.

**Package dependencies:** `@nestjs/common`, `@nestjs/core`, `reflect-metadata` (for decorators + guards). These are already available in the monorepo.

**No new env vars, no new services, no container changes.**

## 5. Non-Functional Requirements

**Performance:** Zero change. Each product continues using its existing auth model. No new HTTP calls, no new DB queries.

**Security:** Zero change. Guard logic is moved, not modified. Same token validation, same permission checks.

**Compatibility:** Every product's curl matrix must pass unchanged after migration. Every product's test suite must pass unchanged (modulo import path updates).

## 6. Out of Scope

- Changing any product's auth model (admin stays remote, forge/compose/pulse stay in-process, bridge stays JwtAuthGuard-only)
- Changing any controller's permission mapping
- Changing any endpoint's behavior
- Adding new auth-api endpoints
- StreamTokenService migration (stays local to forge-api)
- Webhook signature verification
- Signed-URL for asset streams
- Modifying `packages/planes/auth/` or `packages/planes/rbac/` (those are identity/RBAC *service* providers, not guard/decorator infrastructure)

## 7. Dependencies & Risks

**Dependencies:**
- Root `package.json` workspaces must include `packages/auth-client`
- `tsconfig.build.json` for the new package must compile correctly
- Each product's `tsconfig.json` path aliases may need updating if they reference local auth paths via `@/auth/...`

**Risks:**

1. **Path alias breakage.** Forge/compose/pulse use `@/auth/guards/jwt-auth.guard` path aliases (via tsconfig paths). After deletion, these paths break. Each product's tsconfig must be updated OR controllers must use relative paths OR a new alias pointing to the package must be added. Mitigation: update controllers to use `@orchestratorai/auth-client` directly — no path aliases needed for package imports.

2. **Circular dependency.** If `packages/auth-client` imports from `@orchestratorai/planes/auth` (for IDENTITY_PROVIDER type), and `packages/planes` somehow references auth-client, we get a cycle. Mitigation: auth-client imports only type definitions from planes, not runtime code. Guard classes reference Symbol tokens by value, not by importing the providing module.

3. **Test isolation.** Some specs may import guards directly from local paths for type-checking in `overrideGuard()`. After moving, the `overrideGuard(JwtAuthGuard)` call needs to reference the same class that's registered — if the spec imports from the old path and the module registers from the new path, `overrideGuard` won't match. Mitigation: update ALL imports consistently — both in the module and in the spec — to point at `@orchestratorai/auth-client`.

4. **StreamTokenService optional injection.** The in-process JwtAuthGuard currently has `private readonly streamTokenService: StreamTokenService` as a required constructor param. Moving to the package requires making it `@Optional()` so products without StreamTokenService don't crash at DI resolution. Mitigation: add `@Optional()` decorator in the package version; verify forge-api still works (it registers StreamTokenService, so the injection succeeds); verify compose/pulse work (they don't register it, so it resolves to null/undefined and the guard skips the stream-token path).

## 8. Phasing

### Phase 1 — Create `packages/auth-client/`

**Objective:** Create the package, copy the canonical source files into it, add workspace wiring, build the package.

**Scope:**
- Create `packages/auth-client/package.json` (workspace package, `@orchestratorai/auth-client`)
- Create `packages/auth-client/tsconfig.build.json`
- Copy forge-api's `jwt-auth.guard.ts` → `src/guards/in-process-jwt-auth.guard.ts` (rename class to `InProcessJwtAuthGuard`; make StreamTokenService `@Optional()`)
- Copy forge-api's `rbac.guard.ts` → `src/guards/in-process-rbac.guard.ts` (rename class to `InProcessRbacGuard`)
- Copy admin-api's `auth-client.service.ts` → `src/services/auth-client.service.ts`
- Copy admin-api's `jwt-auth.guard.ts` → `src/guards/remote-jwt-auth.guard.ts` (rename class to `RemoteJwtAuthGuard`)
- Copy admin-api's `rbac.guard.ts` → `src/guards/remote-rbac.guard.ts` (rename class to `RemoteRbacGuard`)
- Copy bridge-api's `jwt-auth.guard.ts` → `src/guards/bridge-jwt-auth.guard.ts` (rename class to `BridgeJwtAuthGuard`)
- Copy forge-api's decorators → `src/decorators/`
- Consolidate mock-guards into `src/test-utils/mock-guards.ts` — export helpers that work with both guard variants
- Create `src/index.ts` barrel
- Add `packages/auth-client` to root workspaces
- `npm install` to link
- Build the package

**Gate:** Package builds clean. `npm run build` at repo root includes the new package.

### Phase 2 — Migrate admin-api

**Objective:** Delete admin-api's local `src/auth/` and `src/test-utils/mock-guards.ts`. Import everything from `@orchestratorai/auth-client`. Verify 108/108 tests pass and curl matrix works.

**Gate:** admin-api build clean, 108/108 tests pass, `grep -rn "from.*src/auth" apps/admin/api/src --include="*.ts"` returns only product-specific files (auth controllers, not guards/decorators).

### Phase 3 — Migrate forge-api

**Objective:** Delete forge-api's local guard + decorator files. Import from `@orchestratorai/auth-client`. Keep `StreamTokenService`, `auth.controller.ts`, `rbac.controller.ts`, `rbac.service.ts` local. Verify 1648+ tests pass.

**Gate:** forge-api build clean, 1648+ tests pass, zero local guard files in `src/auth/guards/` or `src/rbac/guards/`.

### Phase 4 — Migrate compose-api

**Objective:** Same as forge-api. 594+ tests pass.

### Phase 5 — Migrate pulse-api + bridge-api

**Objective:** Same pattern. Pulse uses in-process guards. Bridge uses `BridgeJwtAuthGuard`. Both build clean.

### Phase 6 — Completion + PR

**Objective:** Final verification, completion report, roadmap update, commit, push, PR.

**Gate:** `npm run build` clean (19/19); every product's test suite passes; `find apps -name "jwt-auth.guard.ts" -path "*/guards/*" -not -path "*/node_modules/*"` returns zero hits; `find apps -name "mock-guards.ts" -not -path "*/node_modules/*"` returns zero hits; all guard/decorator imports across the monorepo point to `@orchestratorai/auth-client`.

---

**End of PRD.** This is pure deduplication — no behavioral changes, no new endpoints, no new auth models. The package is the single source of truth for guards, decorators, and test utilities across all 5 API products.
