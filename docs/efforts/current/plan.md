# Auth Remote Unification — Implementation Plan

**PRD**: ./prd.md
**Intention**: ./intention.md
**Created**: 2026-04-09
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Create packages/auth-client
- [ ] Phase 2: Migrate admin-api
- [ ] Phase 3: Migrate forge-api
- [ ] Phase 4: Migrate compose-api
- [ ] Phase 5: Migrate pulse-api + bridge-api
- [ ] Phase 6: Completion + PR

---

## Shared conventions

- **Working dir**: `/Users/golfergeek/projects/orchAI/orchestratorai-enterprise-dev`
- **Branch**: `effort/auth-remote-unification`
- **Full repo build**: `npm run build`
- **Admin-api test**: `cd apps/admin/api && npm run test`
- **Forge-api test**: `cd apps/forge/api && npm run test`
- **Compose-api test**: `cd apps/compose/api && npm run test`
- **Package new**: `packages/auth-client/`
- **Package name**: `@orchestratorai/auth-client`

### Source files for extraction (verified identical across forge/compose/pulse)
- **In-process JwtAuthGuard**: `apps/forge/api/src/auth/guards/jwt-auth.guard.ts` (256 lines)
- **In-process RbacGuard**: `apps/forge/api/src/rbac/guards/rbac.guard.ts` (170 lines)
- **Remote AuthClient**: `apps/admin/api/src/auth/auth-client.service.ts`
- **Remote JwtAuthGuard**: `apps/admin/api/src/auth/jwt-auth.guard.ts`
- **Remote RbacGuard**: `apps/admin/api/src/auth/rbac.guard.ts`
- **Bridge JwtAuthGuard**: `apps/ambient/bridge/api/src/auth/guards/jwt-auth.guard.ts`
- **Decorators**: `apps/forge/api/src/auth/decorators/public.decorator.ts`, `apps/forge/api/src/rbac/decorators/require-permission.decorator.ts`, `apps/forge/api/src/auth/decorators/current-user.decorator.ts`, `apps/forge/api/src/auth/decorators/roles.decorator.ts`

---

## Phase 1: Create packages/auth-client
**Status**: Not Started
**Objective**: Create the shared auth-client workspace package with all guard variants, decorators, AuthClient service, and consolidated test utilities. Build it. Wire it into the monorepo.

### Steps
- [ ] 1.1 Create `packages/auth-client/package.json`:
  ```json
  {
    "name": "@orchestratorai/auth-client",
    "version": "1.0.0",
    "private": true,
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "scripts": {
      "build": "tsc -p tsconfig.build.json",
      "test": "jest --config jest.config.js"
    }
  }
  ```
  Match the structure of `packages/planes/package.json` for consistency.

- [ ] 1.2 Create `packages/auth-client/tsconfig.build.json` mirroring `packages/planes/tsconfig.build.json` — `outDir: ./dist`, include `src/**/*.ts`, exclude specs + node_modules.

- [ ] 1.3 Add `"packages/auth-client"` to root `package.json` workspaces array.

- [ ] 1.4 Copy in-process guards from forge-api:
  - `cp apps/forge/api/src/auth/guards/jwt-auth.guard.ts packages/auth-client/src/guards/in-process-jwt-auth.guard.ts`
  - Rename the class from `JwtAuthGuard` to `InProcessJwtAuthGuard`
  - Make `StreamTokenService` an optional injection: add `@Optional()` from `@nestjs/common` to the constructor param. Add a null check around every `this.streamTokenService` usage.
  - Update import paths: `SupabaseAuthUserDto` type must come from a local re-export or be inlined. The guard imports from `'../dto/auth.dto'` — create `src/types/auth.types.ts` with the minimal interface shape the guard needs (id, email, role, etc.) OR import the DTO type from wherever it's canonically defined.
  - `cp apps/forge/api/src/rbac/guards/rbac.guard.ts packages/auth-client/src/guards/in-process-rbac.guard.ts`
  - Rename class to `InProcessRbacGuard`
  - Update import paths for `PERMISSION_KEY`, `RESOURCE_PARAM_KEY` to point at the local decorators

- [ ] 1.5 Copy remote guards + AuthClient from admin-api:
  - `cp apps/admin/api/src/auth/auth-client.service.ts packages/auth-client/src/services/auth-client.service.ts`
  - `cp apps/admin/api/src/auth/jwt-auth.guard.ts packages/auth-client/src/guards/remote-jwt-auth.guard.ts`
  - Rename class to `RemoteJwtAuthGuard`
  - Update import paths (AuthClient, decorators)
  - `cp apps/admin/api/src/auth/rbac.guard.ts packages/auth-client/src/guards/remote-rbac.guard.ts`
  - Rename class to `RemoteRbacGuard`

- [ ] 1.6 Copy bridge guard:
  - `cp apps/ambient/bridge/api/src/auth/guards/jwt-auth.guard.ts packages/auth-client/src/guards/bridge-jwt-auth.guard.ts`
  - Rename class to `BridgeJwtAuthGuard`

- [ ] 1.7 Copy decorators from forge-api (the richest versions):
  - `public.decorator.ts` → `src/decorators/public.decorator.ts`
  - `require-permission.decorator.ts` → `src/decorators/require-permission.decorator.ts`
  - `current-user.decorator.ts` → `src/decorators/current-user.decorator.ts`
  - `roles.decorator.ts` → `src/decorators/roles.decorator.ts`

- [ ] 1.8 Create consolidated `src/test-utils/mock-guards.ts`:
  - Export `mockInProcessJwtAuthGuard`, `mockInProcessRbacGuard` (for forge/compose/pulse specs)
  - Export `mockRemoteJwtAuthGuard`, `mockRemoteRbacGuard`, `mockAuthClient` (for admin specs)
  - Export `resetAuthMocks`, `applyInProcessAuthOverrides`, `applyRemoteAuthOverrides`
  - Export `makeJwtGuardReject`, `makeRbacGuardReject` (generic — works with both)

- [ ] 1.9 Create `src/index.ts` barrel exporting everything:
  ```ts
  // Guards
  export { InProcessJwtAuthGuard } from './guards/in-process-jwt-auth.guard';
  export { InProcessRbacGuard } from './guards/in-process-rbac.guard';
  export { RemoteJwtAuthGuard } from './guards/remote-jwt-auth.guard';
  export { RemoteRbacGuard } from './guards/remote-rbac.guard';
  export { BridgeJwtAuthGuard } from './guards/bridge-jwt-auth.guard';
  // Services
  export { AuthClient, type AuthorizeResult } from './services/auth-client.service';
  // Decorators
  export { Public, IS_PUBLIC_KEY } from './decorators/public.decorator';
  export { RequirePermission, PERMISSION_KEY, RESOURCE_PARAM_KEY } from './decorators/require-permission.decorator';
  export { CurrentUser } from './decorators/current-user.decorator';
  // Test utilities
  export * from './test-utils/mock-guards';
  ```

- [ ] 1.10 Run `npm install` at repo root to link the new workspace package.

- [ ] 1.11 Build the package: `cd packages/auth-client && npm run build`. Fix any TypeScript errors from import path adjustments.

- [ ] 1.12 Verify the package is importable: create a trivial test in any product that does `import { InProcessJwtAuthGuard } from '@orchestratorai/auth-client'` — confirm it resolves. Delete the test after verifying.

### Quality Gate
- [ ] **Build**: `cd packages/auth-client && npm run build` — clean
- [ ] **Build (repo)**: `npm run build` — 20/20 tasks (19 existing + 1 new) — all clean
- [ ] **Unit Tests**: N/A (the package has no tests of its own yet — guards are tested via each product's specs)
- [ ] **Phase Review**:
  - [ ] `packages/auth-client/` exists with all files listed in PRD §4.1
  - [ ] `npm ls @orchestratorai/auth-client` resolves
  - [ ] Package exports compile (barrel index.ts builds without errors)
  - [ ] No product code has been modified yet

---

## Phase 2: Migrate admin-api
**Status**: Not Started
**Objective**: Delete admin-api's local `src/auth/` folder and `src/test-utils/mock-guards.ts`. Update all imports to `@orchestratorai/auth-client`. Verify 108+ tests pass.

### Steps
- [ ] 2.1 In `apps/admin/api/src/app.module.ts`: change `import { AuthModule } from './auth'` to register `RemoteJwtAuthGuard`, `RemoteRbacGuard`, and `AuthClient` as providers (or create a thin local `AuthModule` that imports from the package). The key: the `@Global()` module still needs to exist so guards are available everywhere. Create a minimal `auth.module.ts` that re-exports the package classes:
  ```ts
  import { Global, Module } from '@nestjs/common';
  import { AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard } from '@orchestratorai/auth-client';
  @Global()
  @Module({ providers: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard], exports: [AuthClient, RemoteJwtAuthGuard, RemoteRbacGuard] })
  export class AuthModule {}
  ```

- [ ] 2.2 Update every admin-api controller import. The controllers currently import `JwtAuthGuard` and `RbacGuard` from `../auth`. Change to:
  ```ts
  import { RemoteJwtAuthGuard as JwtAuthGuard, RemoteRbacGuard as RbacGuard, RequirePermission, Public } from '@orchestratorai/auth-client';
  ```
  Using `as JwtAuthGuard` / `as RbacGuard` aliases so `@UseGuards(JwtAuthGuard, RbacGuard)` decorators don't need to change. This minimizes the diff.

- [ ] 2.3 Delete the old local files:
  - `rm apps/admin/api/src/auth/auth-client.service.ts`
  - `rm apps/admin/api/src/auth/jwt-auth.guard.ts`
  - `rm apps/admin/api/src/auth/rbac.guard.ts`
  - `rm -rf apps/admin/api/src/auth/decorators/`
  - `rm apps/admin/api/src/auth/index.ts`
  - Keep `apps/admin/api/src/auth/auth.module.ts` (the thin re-export module from step 2.1)
  - `rm apps/admin/api/src/test-utils/mock-guards.ts`

- [ ] 2.4 Update admin-api test specs to import from `@orchestratorai/auth-client`:
  - Every spec that imported from `../test-utils/mock-guards` or `../auth` needs to import from the package
  - Update `overrideGuard(JwtAuthGuard)` calls — the JwtAuthGuard reference must be `RemoteJwtAuthGuard` from the package (or the aliased import)

- [ ] 2.5 Build + test:
  ```
  cd apps/admin/api && npm run build && npm run test
  ```

### Quality Gate
- [ ] **Build**: `cd apps/admin/api && npm run build` — clean
- [ ] **Unit Tests**: `cd apps/admin/api && npm run test` — 108+ tests pass
- [ ] **Phase Review**:
  - [ ] `find apps/admin/api/src/auth -name "*.ts" | grep -v module` → zero guard/decorator files (only auth.module.ts remains)
  - [ ] `find apps/admin/api/src/test-utils -name "*.ts"` → empty (mock-guards deleted)
  - [ ] `grep -rn "from.*\./auth/auth-client\|from.*\./auth/jwt-auth\|from.*\./auth/rbac\|from.*\./auth/decorators" apps/admin/api/src --include="*.ts"` → zero hits

---

## Phase 3: Migrate forge-api
**Status**: Not Started
**Objective**: Delete forge-api's local guard + decorator files. Import from `@orchestratorai/auth-client`. Keep StreamTokenService, auth controller, rbac controller, rbac service local. Verify 1648+ tests pass.

### Steps
- [ ] 3.1 Create a thin local `AuthModule` in forge-api that re-exports the package guards:
  ```ts
  import { Global, Module } from '@nestjs/common';
  import { InProcessJwtAuthGuard, InProcessRbacGuard } from '@orchestratorai/auth-client';
  @Global()
  @Module({ providers: [InProcessJwtAuthGuard, InProcessRbacGuard], exports: [InProcessJwtAuthGuard, InProcessRbacGuard] })
  export class AuthGuardsModule {}
  ```
  Register `AuthGuardsModule` in forge-api's `app.module.ts` (alongside the existing `AuthModule` which provides identity/stream-token services).

- [ ] 3.2 Update every forge-api controller import (27 controllers). Change:
  ```ts
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RbacGuard } from '../rbac/guards/rbac.guard';
  import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
  import { Public } from '../auth/decorators/public.decorator';
  ```
  To:
  ```ts
  import { InProcessJwtAuthGuard as JwtAuthGuard, InProcessRbacGuard as RbacGuard, RequirePermission, Public } from '@orchestratorai/auth-client';
  ```

- [ ] 3.3 Delete local guard + decorator files:
  - `rm apps/forge/api/src/auth/guards/jwt-auth.guard.ts`
  - `rm apps/forge/api/src/auth/guards/roles.guard.ts`
  - `rm apps/forge/api/src/auth/decorators/public.decorator.ts`
  - `rm apps/forge/api/src/auth/decorators/roles.decorator.ts`
  - `rm apps/forge/api/src/auth/decorators/current-user.decorator.ts`
  - `rm apps/forge/api/src/rbac/guards/rbac.guard.ts`
  - `rm apps/forge/api/src/rbac/decorators/require-permission.decorator.ts`
  - `rm apps/forge/api/src/test-utils/mock-guards.ts`
  - Keep: `auth.controller.ts`, `auth.service.ts`, `auth.module.ts` (identity services), `services/stream-token.service.ts`, `dto/`, `interfaces/`
  - Keep: `rbac/rbac.controller.ts`, `rbac/rbac.service.ts`, `rbac/rbac.module.ts` (RBAC management endpoints)

- [ ] 3.4 Update forge-api's existing `AuthModule` (`apps/forge/api/src/auth/auth.module.ts`) — remove the guard + decorator exports that were deleted. It should still export `StreamTokenService`, identity providers, etc.

- [ ] 3.5 Update forge-api's `RbacModule` (`apps/forge/api/src/rbac/rbac.module.ts`) — remove guard + decorator exports. It should still export `RbacService`.

- [ ] 3.6 Update test specs:
  - Every spec importing from `../test-utils/mock-guards` → import from `@orchestratorai/auth-client`
  - Every spec importing guards/decorators from local paths → import from `@orchestratorai/auth-client`
  - `overrideGuard(JwtAuthGuard)` calls → `overrideGuard(InProcessJwtAuthGuard)` (or use the aliased import)

- [ ] 3.7 Build + test:
  ```
  cd apps/forge/api && npm run build && npm run test
  ```

### Quality Gate
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` — 1648+ tests pass
- [ ] **Phase Review**:
  - [ ] `find apps/forge/api/src/auth/guards -name "*.ts"` → empty directory (or directory deleted)
  - [ ] `find apps/forge/api/src/rbac/guards -name "*.ts"` → empty
  - [ ] `find apps/forge/api/src/rbac/decorators -name "*.ts"` → empty
  - [ ] `find apps/forge/api/src/test-utils -name "*.ts"` → empty
  - [ ] StreamTokenService still exists at `apps/forge/api/src/auth/services/stream-token.service.ts`

---

## Phase 4: Migrate compose-api
**Status**: Not Started
**Objective**: Same as Phase 3 but for compose-api. 594+ tests pass.

### Steps
- [ ] 4.1 Same thin `AuthGuardsModule` pattern as forge-api step 3.1. (Or reuse the existing AuthModule and just change its guard imports.)
- [ ] 4.2 Update 19 controller imports to `@orchestratorai/auth-client`.
- [ ] 4.3 Delete local guard + decorator + mock-guards files (same list as forge — they're byte-identical).
- [ ] 4.4 Update compose-api's AuthModule + RbacModule to remove deleted exports.
- [ ] 4.5 Update test specs.
- [ ] 4.6 Build + test: `cd apps/compose/api && npm run build && npm run test`

### Quality Gate
- [ ] **Build**: `cd apps/compose/api && npm run build` — clean
- [ ] **Unit Tests**: `cd apps/compose/api && npm run test` — 594+ tests pass
- [ ] **Phase Review**: same grep checks as Phase 3

---

## Phase 5: Migrate pulse-api + bridge-api
**Status**: Not Started
**Objective**: Pulse gets in-process guards from the package. Bridge gets `BridgeJwtAuthGuard` from the package. Both build clean.

### Steps
- [ ] 5.1 Pulse: same pattern as forge/compose. Update 12 controller imports. Delete local guards/decorators. Build clean.
- [ ] 5.2 Bridge: update 11 controller imports. Change `JwtAuthGuard` import to `BridgeJwtAuthGuard as JwtAuthGuard` from `@orchestratorai/auth-client`. Change `Public` import to package. Delete local `auth/guards/jwt-auth.guard.ts` and `auth/decorators/public.decorator.ts`. Build clean.
- [ ] 5.3 Run whatever tests exist for pulse + bridge.

### Quality Gate
- [ ] **Build**: both products build clean
- [ ] **Phase Review**:
  - [ ] `find apps/ambient/pulse/api/src/auth/guards -name "*.ts"` → empty
  - [ ] `find apps/ambient/bridge/api/src/auth/guards -name "*.ts"` → empty
  - [ ] `find apps/ambient/bridge/api/src/auth/decorators -name "*.ts"` → empty

---

## Phase 6: Completion + PR
**Status**: Not Started
**Objective**: Final verification across the entire monorepo. Completion report. Roadmap update. Commit, push, PR.

### Steps
- [ ] 6.1 Full-repo build: `npm run build` — all tasks clean.
- [ ] 6.2 Full-repo grep verification:
  - `find apps -name "jwt-auth.guard.ts" -path "*/guards/*" -not -path "*/node_modules/*"` → zero hits
  - `find apps -name "rbac.guard.ts" -path "*/guards/*" -not -path "*/node_modules/*"` → zero hits
  - `find apps -name "mock-guards.ts" -not -path "*/node_modules/*"` → zero hits
  - `find apps -name "require-permission.decorator.ts" -not -path "*/node_modules/*"` → zero hits
  - `find apps -name "public.decorator.ts" -not -path "*/node_modules/*"` → zero hits

- [ ] 6.3 Write `docs/efforts/current/completion-report.md`.
- [ ] 6.4 Update `docs/efforts/roadmap.md` — move this effort to completed, remove from Future, note that the auth-client package now exists.
- [ ] 6.5 Commit, push, PR.

### Quality Gate
- [ ] **Build**: `npm run build` — all tasks clean
- [ ] **Unit Tests**: admin 108+, forge 1648+, compose 594+ — all pass
- [ ] **Phase Review**:
  - [ ] All grep checks in 6.2 pass
  - [ ] Completion report written
  - [ ] Roadmap updated
  - [ ] PR opened
