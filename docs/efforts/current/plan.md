# Forge API Auth Hardening (Phase 1 of 2) — Implementation Plan

**PRD**: ./prd.md
**Intention**: ./intention.md
**Created**: 2026-04-08
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Permission vocabulary + auth module wiring audit
- [x] Phase 2: Mark genuinely-public endpoints with @Public()
- [x] Phase 3: Guard the remaining unguarded controllers + add RbacGuard/@RequirePermission to the JwtAuthGuard-only 9
- [x] Phase 4: Create forge-local mock-guards helper + update broken specs
- [x] Phase 5: Live verification (curl matrix)
- [ ] Phase 6: Write forge-auth-remote-unification.md + completion report + PR

---

## Shared conventions

- **Working dir**: `/Users/golfergeek/projects/orchAI/orchestratorai-enterprise-dev`
- **Branch**: `effort/forge-auth-hardening` (create at start of Phase 1)
- **Lint (repo root)**: `npm run lint`
- **Build (repo root)**: `npm run build`
- **Lint (forge-api targeted)**: `cd apps/forge/api && npm run lint`
- **Build (forge-api targeted)**: `cd apps/forge/api && npm run build`
- **Test (forge-api targeted)**: `cd apps/forge/api && npm run test`
- **Forge API URL (dev)**: `http://localhost:5200`
- **Auth API URL (dev)**: `http://localhost:5100`
- **Admin Web URL (dev)**: `http://localhost:5101`
- **Supabase DB (local)**: `docker exec supabase_db_orchestratorai-enterprise psql -U postgres -d postgres -c "..."`
- **Demo admin user**: `demo-user@orchestratorai.io` / `DEMOUSER123!` — admin role globally (`*`) and in `legal`. NOT super-admin.
- **No fallbacks. No cheating.** Guards throw specific Nest exceptions. No `@Public()` means the controller is NOT public — every non-public controller must have the guard stack.
- **Existing forge-api guards are canonical for Phase 1.** Do NOT modify `apps/forge/api/src/auth/guards/jwt-auth.guard.ts` or `apps/forge/api/src/rbac/guards/rbac.guard.ts`. Do NOT touch `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`.
- **Decorator locations to import from**:
  - `JwtAuthGuard` → `apps/forge/api/src/auth/guards/jwt-auth.guard.ts`
  - `RbacGuard` → `apps/forge/api/src/rbac/guards/rbac.guard.ts`
  - `@RequirePermission`, `PERMISSION_KEY`, `RESOURCE_PARAM_KEY` → `apps/forge/api/src/rbac/decorators/require-permission.decorator.ts`
  - `@Public`, `IS_PUBLIC_KEY` → `apps/forge/api/src/auth/decorators/public.decorator.ts`
  - Each controller's relative import path depends on its depth. Use the already-guarded controllers (e.g. `rag/collections.controller.ts`, `engineering/engineering.controller.ts`) as reference.
- **Controller inventory (from PRD §4.3)**: 28 controllers total. 11 already have `JwtAuthGuard` (9 of them missing `RbacGuard`+`@RequirePermission`); 17 are fully unguarded (of which 4-5 should become `@Public()` and the rest get the full stack).

---

## Phase 1: Permission vocabulary + auth module wiring audit
**Status**: Not Started
**Objective**: Before touching any controller, (a) enumerate forge-api's actual RBAC permission vocabulary from the DB, (b) verify `AuthModule`/`RbacModule` are importable from every feature module that needs them, (c) verify forge-api's `RbacService.hasPermission` doesn't have the same array-unwrap bug we fixed in auth-api, and (d) finalize the real permission mapping for the 17-controller hardening.

### Steps
- [x] 1.1 Create branch: `git checkout -b effort/forge-auth-hardening` (skip if already there).
- [ ] 1.2 Enumerate the real RBAC permission vocabulary:
  ```
  docker exec supabase_db_orchestratorai-enterprise psql -U postgres -d postgres -c "SELECT name, category, description FROM authz.rbac_permissions ORDER BY category, name;"
  ```
  Record every permission name verbatim. This is the source of truth for what `@RequirePermission('X')` can reference.
- [ ] 1.3 Verify the PRD §4.3 planned permissions exist in the vocabulary. For each of `legal:use`, `agents:use`, `rag:read`, `rag:write`, `rag:admin`, `engineering:use`, `marketing:use`, `admin:audit`, `admin:settings`, `assets:read`: check presence. For any that do NOT exist, pick the closest existing name as the fallback and record the mapping in step 1.4.
- [ ] 1.4 Produce the finalized permission-mapping appendix by editing this plan file in place. Replace the placeholder table below (at the bottom of Phase 1 Steps) with the real mapping.
- [ ] 1.5 Read `apps/forge/api/src/rbac/rbac.service.ts` and find the `hasPermission` method. Compare against the pattern in `apps/auth/api/src/rbac/rbac.service.ts` (post-fix). If it has the same `data === true` comparison against a return from `this.db.rpc(...)` without unwrapping an array-of-rows, it has the same latent bug.
- [ ] 1.6 If the bug exists in forge-api's `RbacService.hasPermission`: write 3 new unit tests in `apps/forge/api/src/rbac/rbac.service.spec.ts` covering (a) planes rpc returns `[{ rbac_has_permission: true }]` → `hasPermission` returns true, (b) `[{ rbac_has_permission: false }]` → false, (c) `[]` (empty array) → false. Confirm the new tests fail, then fix `hasPermission` the same way we fixed auth-api: support both the array shape and the old boolean shape. Run `cd apps/forge/api && npx jest rbac.service.spec.ts` — all tests pass.
- [ ] 1.7 If the bug does NOT exist (forge-api has a different implementation that correctly handles the planes rpc shape), document that in this plan as a note and move on.
- [ ] 1.8 Read `apps/forge/api/src/auth/auth.module.ts`. Confirm it exports `JwtAuthGuard` and any `@Global()` annotation that makes it available app-wide. If `@Global()` is not present but every feature module must import `AuthModule` explicitly, that's fine — verify each of the 17 unguarded controllers' feature modules imports it (or will once we add the guards). Produce a per-controller module-import checklist here.
- [ ] 1.9 Read `apps/forge/api/src/rbac/rbac.module.ts`. Same check: is `RbacGuard` provided/exported and is `RbacModule` importable from feature modules? If it's `@Global()` the later phases don't need to import anything.
- [ ] 1.10 For each of the 17 unguarded controllers, open its owning feature module file and check imports. Produce a list of modules that need to add `import { AuthModule } from '...'` / `import { RbacModule } from '...'`. Controllers to check:
  - `agent-registry/agent-registry.module.ts`
  - `agents/business-automation-advisor/business-automation-advisor.module.ts`
  - `agents/cad-agent/cad-agent.module.ts`
  - `agents/data-analyst/data-analyst.module.ts`
  - `agents/extended-post-writer/extended-post-writer.module.ts`
  - `agents/hr-assistant/hr-assistant.module.ts`
  - `agents/legal-department/jobs/legal-jobs.module.ts` (or wherever the legal-jobs controller is wired)
  - `agents/marketing-swarm/marketing-swarm.module.ts`
  - `analytics/analytics.module.ts`
  - `app.module.ts` (for the root AppController)
  - `assets/assets.module.ts`
  - `config/feature-flag.module.ts` (or `config.module.ts`)
  - `health/health.module.ts`
  - `invoke/invoke.module.ts` (for discovery and invoke)
  - `rag/rag.module.ts` (for `internal-query.controller.ts`)
  - `system/system.module.ts`
  - `webhooks/webhooks.module.ts`
- [ ] 1.11 Do NOT actually add the module imports yet — just record what's needed. Phase 2/3 steps will add them alongside the controller edits.

#### Permission mapping appendix (finalized in Phase 1 against real vocab)

**Actual vocabulary** (from `SELECT name, category FROM authz.rbac_permissions`, 18 rows):
```
admin       : admin:audit, admin:billing, admin:roles, admin:settings, admin:users
agents      : agents:admin, agents:execute, agents:manage
deliverables: deliverables:delete, deliverables:read, deliverables:write
llm         : llm:admin, llm:use
rag         : rag:admin, rag:delete, rag:read, rag:write
system      : *:*
```

**Finalized mapping** (PRD plan → real permission):

| PRD planned | Exists? | Final choice | Rationale |
|---|---|---|---|
| `legal:use` | NO | **`agents:execute`** | Legal department is an agent workflow; every agent invocation uses this permission |
| `agents:use` | NO | **`agents:execute`** | Match the vocab |
| `rag:read` | YES | `rag:read` | — |
| `rag:write` | YES | `rag:write` | — |
| `rag:admin` | YES | `rag:admin` | — |
| `engineering:use` | NO | **`agents:execute`** | Engineering endpoints invoke agents |
| `marketing:use` | NO | **`agents:execute`** | Same |
| `admin:audit` | YES | `admin:audit` | — |
| `admin:settings` | YES | `admin:settings` | — |
| `assets:read` | NO | **`deliverables:read`** | Assets are generated artifacts/deliverables |
| `invoke:use` | NO | **`agents:execute`** | Invoke dispatch = agent execution |
| `agents:read` | NO | **`agents:execute`** | No read-only scope exists; use lightest |
| `customer-service:use` | NO | **`agents:execute`** | Same pattern |

**Observation**: forge-api's permission model is coarser than the PRD assumed. `agents:execute` is effectively "any authenticated user who can run workflows." For stricter gates (admin-only management, audit access), `agents:manage` or `admin:audit` / `admin:settings` apply. Demo-user has admin role in `*` — `rbac_has_permission` via role → permissions mapping should cover all of the above.

### Quality Gate
- [ ] **Lint**: `cd apps/forge/api && npm run lint` — no new errors (pre-existing errors in untouched files are OK and documented)
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` — all existing tests still pass; if `RbacService.hasPermission` was fixed, the 3 new tests pass
- [ ] **E2E Tests**: N/A this phase
- [ ] **Curl Tests**: N/A this phase (no controller edits yet)
- [ ] **Chrome Tests**: N/A this phase
- [ ] **Phase Review**:
  - [ ] Permission vocabulary queried and recorded (step 1.2)
  - [ ] Permission-mapping appendix table has a Final choice for every row
  - [ ] `RbacService.hasPermission` bug investigated — either fixed or documented as not-present
  - [ ] Per-controller module-import checklist produced
  - [ ] No controller files have been edited yet
  - [ ] No production `RbacGuard`/`JwtAuthGuard` source files have been edited (admin-api hardening rule carried forward)
  - [ ] `git diff apps/forge/api/src/auth/guards/jwt-auth.guard.ts apps/forge/api/src/rbac/guards/rbac.guard.ts` → empty
  - [ ] `git diff packages/planes/rbac/ packages/planes/auth/guards/jwt-auth.guard.ts` → empty

---

## Phase 2: Mark genuinely-public endpoints with @Public()
**Status**: Not Started
**Objective**: Explicitly decorate `/health`, A2A discovery, and any webhook endpoints that should remain auth-free with `@Public()` + a source-code comment explaining why. Do NOT add `JwtAuthGuard` to these. Every other unguarded controller stays unguarded in this phase — Phase 3 handles them.

### Steps
- [ ] 2.1 Read `apps/forge/api/src/health/health.controller.ts` in full (short file). Add `@Public()` to the class with a comment: `// Liveness probe — must be reachable without auth.` Import `Public` from `../auth/decorators/public.decorator`. Also add `AuthModule` to `health.module.ts` imports if not already present (the `@Public()` decorator doesn't need a guard to run, but the `Reflector` metadata lookup requires the decorator's metadata key to be recognized, which means `AuthModule` must be importable in tests even if not at runtime — verify behavior).
- [ ] 2.2 Read `apps/forge/api/src/invoke/discovery.controller.ts` in full. Add `@Public()` class-level with comment: `// A2A agent discovery (.well-known) — must be reachable without auth for bootstrap.` Import appropriately.
- [ ] 2.3 Read `apps/forge/api/src/app.controller.ts`. If it's a trivial root/"hello" endpoint: add `@Public()` with comment `// Root liveness endpoint; returns basic service identification.`. If it's not trivial (has stateful handlers, returns sensitive data), move it to Phase 3's guarded list and document the move as a Phase 2 note.
- [ ] 2.4 Read `apps/forge/api/src/webhooks/webhooks.controller.ts` in full — this is a key file. Enumerate every `@Post`/`@Get` handler. For each:
  - If the handler is reached only by internal services (A2A event chunks, internal callbacks): add `@Public()` with a comment `// Internal A2A callback — TODO(forge-auth-remote-unification): add HMAC signature check.` Add the signature-check TODO to the Phase 6 `forge-auth-remote-unification.md` follow-up file.
  - If the handler is reached only by authenticated users via the UI (e.g. an admin trigger endpoint): defer to Phase 3 and add `@UseGuards(JwtAuthGuard, RbacGuard) @RequirePermission('admin:settings')` there.
  - If the handler is reached by external services (OpenAI callbacks, Anthropic callbacks, payment webhooks, etc.): `@Public()` with a comment noting no signature check yet + add to the follow-up file.
  - Record the per-method decision as a sub-step in this plan file so Phase 3 doesn't re-decide.
- [ ] 2.5 Read `apps/forge/api/src/agent-registry/agent-registry.controller.ts`. Decision point: is this used by A2A discovery from other products (compose, bridge, protocol-lab)?
  - Check via grep: `grep -rn "/agent-registry\|agent-registry" apps/compose/api apps/bridge/api apps/protocol-lab --include="*.ts" | head`
  - If yes: `@Public()` with comment `// Agent catalog for A2A discovery — must be reachable for cross-product bootstrap.`
  - If no: move to Phase 3 and guard with `@RequirePermission('agents:read')` or whatever Phase 1 finalized.
- [ ] 2.6 Grep-verify Phase 2 scope:
  - `grep -rn "@Public()" apps/forge/api/src --include="*.controller.ts"` → expect 4-6 hits (health + discovery + app + webhooks methods + possibly agent-registry)
  - `grep -rn "@UseGuards" apps/forge/api/src --include="*.controller.ts" | wc -l` → unchanged from baseline (Phase 2 added zero new `@UseGuards`)

### Quality Gate
- [ ] **Lint**: `cd apps/forge/api && npm run lint` — no new errors on touched files
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean
- [ ] **Unit Tests**: `cd apps/forge/api && npm run test` — all tests still pass (Phase 2 doesn't break existing tests because it only adds `@Public()` which is a metadata no-op for unguarded controllers)
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests** (optional — requires running forge-api on port 5200):
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5200/health` → 200
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5200/.well-known/agent.json` → 200 (no Authorization header)
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] Every controller in Phase 2's list either has `@Public()` + comment or was explicitly moved to Phase 3 with documentation
  - [ ] Webhook per-method decisions recorded in this plan file
  - [ ] agent-registry decision recorded (Public vs Phase 3)
  - [ ] `git diff apps/forge/api/src/auth/guards/jwt-auth.guard.ts apps/forge/api/src/rbac/guards/rbac.guard.ts` → empty

---

## Phase 3: Guard the remaining unguarded controllers + add RbacGuard/@RequirePermission to the JwtAuthGuard-only 9
**Status**: Not Started
**Objective**: Apply the full guard stack (`@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission(...)`) to every remaining controller that needs it. Clean up `customer-service.controller.ts`'s inline Bearer extraction.

### Steps

#### 3A — The 9 controllers that already have `JwtAuthGuard` but lack `RbacGuard`/`@RequirePermission`

For each of these, update the decorator stack to include `RbacGuard` and add `@RequirePermission(...)` at the class level using the Phase 1 finalized permission mapping. Pattern:

```ts
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';        // existing
import { RbacGuard } from '../rbac/guards/rbac.guard';               // NEW
import { RequirePermission } from '../rbac/decorators/require-permission.decorator'; // NEW

@ApiTags('...')
@UseGuards(JwtAuthGuard, RbacGuard)   // change: add RbacGuard
@RequirePermission('<permission>')    // NEW
@Controller('...')
export class XController { ... }
```

- [ ] 3A.1 `engineering/engineering.controller.ts` → `@RequirePermission('engineering:use')` (or Phase 1 final)
- [ ] 3A.2 `invoke/invoke.controller.ts` → `@RequirePermission('invoke:use')` (or `agents:use` per Phase 1)
- [ ] 3A.3 `marketing/marketing.controller.ts` → `@RequirePermission('marketing:use')`
- [ ] 3A.4 `rag/collections.controller.ts` → `@RequirePermission('rag:admin')`
- [ ] 3A.5 `rag/documents.controller.ts` → `@RequirePermission('rag:write')`
- [ ] 3A.6 `rag/qa.controller.ts` → `@RequirePermission('rag:read')`
- [ ] 3A.7 `rag/query.controller.ts` → `@RequirePermission('rag:read')`
- [ ] 3A.8 `auth/auth.controller.ts` → method-level `@RequirePermission(...)` on the methods currently using `@UseGuards(JwtAuthGuard)`. If every authed method in this controller should be reachable by any authenticated user (e.g. `/auth/me`, `/auth/refresh`), leave them without `@RequirePermission` but ensure they still have `JwtAuthGuard`. Document per-method rationale in a comment.
- [ ] 3A.9 `customer-service/customer-service.controller.ts` → this file is its own substep (see 3C below).

#### 3B — The unguarded controllers that need the full stack (13 of the 17, minus any moved to Phase 2 @Public())

Starting count is 17 unguarded. Subtract whatever Phase 2 marked `@Public()` (likely 4-5: health, discovery, app, webhooks [partially], maybe agent-registry). Remaining: ~12-13 controllers.

For each: class-level `@UseGuards(JwtAuthGuard, RbacGuard)` + `@RequirePermission(...)`. Add `@ApiBearerAuth('JWT-auth')` if not already present (for Swagger docs) — verify by reading each file.

- [ ] 3B.1 `agents/legal-department/jobs/legal-jobs.controller.ts` — **the highest-value fix**
  - [ ] 3B.1.1 Read the file completely. Count handler methods (plan estimates 14+).
  - [ ] 3B.1.2 Default class-level `@RequirePermission('legal:use')` (or Phase 1 final).
  - [ ] 3B.1.3 For any method that is specifically an admin-only action (e.g. force-cancel, force-complete, purge), apply a stricter permission at method level. Default: no method-level overrides unless the handler name clearly indicates admin scope.
  - [ ] 3B.1.4 Confirm the existing legal-department jest specs still work — if they mount the controller via `Test.createTestingModule`, Phase 4 will fix them. Don't try to fix specs in Phase 3.
- [ ] 3B.2 `agents/data-analyst/data-analyst.controller.ts` → `@RequirePermission('agents:use')`
- [ ] 3B.3 `agents/marketing-swarm/marketing-swarm.controller.ts` → `@RequirePermission('agents:use')`
- [ ] 3B.4 `agents/extended-post-writer/extended-post-writer.controller.ts` → `@RequirePermission('agents:use')`
- [ ] 3B.5 `agents/business-automation-advisor/business-automation-advisor.controller.ts` → `@RequirePermission('agents:use')`
- [ ] 3B.6 `agents/cad-agent/cad-agent.controller.ts` → `@RequirePermission('agents:use')`
- [ ] 3B.7 `agents/hr-assistant/hr-assistant.controller.ts` → `@RequirePermission('agents:use')`
- [ ] 3B.8 `analytics/analytics.controller.ts` → `@RequirePermission('admin:audit')`
- [ ] 3B.9 `assets/assets.controller.ts` → read every handler first. Asset streaming may need public URLs for AI-generated content embedded in pages. Decide per-method: most stay `@RequirePermission('assets:read')`, but the `@Get(':id')` stream endpoint might need to stay `@Public()` with a signed-URL pattern — if no signed-URL exists today, add `@RequirePermission('assets:read')` and leave a TODO for public-signed-URL support in the follow-up file.
- [ ] 3B.10 `config/feature-flag.controller.ts` → `@RequirePermission('admin:settings')`
- [ ] 3B.11 `rag/internal-query.controller.ts` → `@RequirePermission('rag:read')`. Add a code comment noting this endpoint appears to be for internal service-to-service use and may be a candidate for removal in a separate effort.
- [ ] 3B.12 `system/system.controller.ts` → `@RequirePermission('admin:settings')`
- [ ] 3B.13 Any additional controllers from 3B that Phase 2 moved over (e.g. `webhooks/webhooks.controller.ts` authed methods).

#### 3C — Clean up `customer-service.controller.ts` inline Bearer extraction

- [ ] 3C.1 Read the full file. Note the three `@UseGuards(RateLimitGuard)` handlers around lines 70, 85, 149, and the `@Public()` decorators around lines 104, 183. Record the method-level shape:
  - Which methods have `@Public()`
  - Which methods have only `@UseGuards(RateLimitGuard)`
  - Where inline `authHeader.startsWith('Bearer ')` lives and what it does in each handler
- [ ] 3C.2 For each method with inline Bearer extraction:
  - If the method is `@Public()` and the extraction is used to optionally populate a user context (e.g. "if a token is present, try to identify the user for personalization; otherwise serve anonymous"): this is a known anti-pattern. Remove the inline extraction and leave a TODO for the follow-up file noting that optional-auth is a separate concern.
  - If the method should actually be authenticated: change `@Public()` → `@UseGuards(JwtAuthGuard, RbacGuard) @RequirePermission('customer-service:use')` (or Phase 1 fallback). Remove the inline extraction (the guard handles it).
  - If the method should stay public and the extraction was dead code: delete the inline extraction entirely.
- [ ] 3C.3 Check `customer-service/guards/rate-limit.guard.ts` — the plan PRD notes it also extracts Bearer tokens for rate-limit keying. That's a legitimate use: derive a rate-limit bucket per-user when a token is present, fallback to IP. Leave that file alone BUT document it in the completion report as an acceptable exception to the "no inline Bearer extraction" rule.

#### 3D — Grep-verify scope

- [ ] 3D.1 `grep -rn "@UseGuards(JwtAuthGuard, RbacGuard)" apps/forge/api/src --include="*.controller.ts" | wc -l` → should match (controllers guarded this phase + controllers from 3A that had their stack upgraded).
- [ ] 3D.2 `grep -rn "@RequirePermission" apps/forge/api/src --include="*.controller.ts" | wc -l` → should match the count of `@UseGuards(JwtAuthGuard, RbacGuard)` hits (every guarded controller must have a permission).
- [ ] 3D.3 `grep -rn "startsWith('Bearer ')" apps/forge/api/src --include="*.ts"` → expect hits only in `auth/guards/jwt-auth.guard.ts` and `customer-service/guards/rate-limit.guard.ts` (documented exception).
- [ ] 3D.4 `grep -rn "@Controller(" apps/forge/api/src --include="*.controller.ts" | wc -l` → 28 (unchanged).
- [ ] 3D.5 Every one of the 28 controllers is now either guarded or `@Public()`. Manually produce a status line for each in the plan under 3D.5 as a verification record.

### Quality Gate
- [ ] **Lint**: `cd apps/forge/api && npm run lint` — no new errors on touched controllers
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean (this catches decorator stacking issues, missing imports, module-registration gaps)
- [ ] **Unit Tests**: **Intentionally NOT run yet.** Phase 4 is the test-fix phase. If tests are run here, every forge-api controller spec whose controller's guard state changed will fail.
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A — Phase 5 does the full matrix
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] All 9 controllers in 3A have `RbacGuard` added and `@RequirePermission` set
  - [ ] All 12-13 controllers in 3B have the full guard stack
  - [ ] `customer-service.controller.ts` inline Bearer extraction removed (3C)
  - [ ] Every `@Controller` in forge-api is accounted for (3D.5)
  - [ ] `git diff apps/forge/api/src/auth/guards/jwt-auth.guard.ts apps/forge/api/src/rbac/guards/rbac.guard.ts` → empty
  - [ ] `git diff packages/planes/rbac/ packages/planes/auth/guards/jwt-auth.guard.ts` → empty
  - [ ] Forge API compiles clean
  - [ ] Any method-level permission overrides (legal-department stricter methods, assets public streams) documented with comments

---

## Phase 4: Create forge-local mock-guards helper + update broken specs
**Status**: Not Started
**Objective**: Create `apps/forge/api/src/test-utils/mock-guards.ts` (forge-local, imports forge's `JwtAuthGuard`/`RbacGuard` — NOT the admin-api ones). Update every forge-api controller spec whose controller's guard state changed.

### Steps
- [ ] 4.1 Create `apps/forge/api/src/test-utils/mock-guards.ts`:
  ```ts
  import {
    ForbiddenException,
    UnauthorizedException,
  } from '@nestjs/common';
  import { TestingModuleBuilder } from '@nestjs/testing';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RbacGuard } from '../rbac/guards/rbac.guard';

  export interface MockPrincipal {
    id: string;
    email: string;
    // Additional fields as required by forge-api's SupabaseAuthUserDto —
    // read `apps/forge/api/src/auth/dto/auth.dto.ts` and mirror the shape
    // consumed by real handlers (org membership, roles, etc.)
  }

  export const defaultPrincipal: MockPrincipal = {
    id: 'test-user-id',
    email: 'test@example.com',
    // fill in whatever shape real handlers read from request.user
  };

  export const mockJwtAuthGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  export const mockRbacGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  export function resetAuthMocks(): void {
    mockJwtAuthGuard.canActivate.mockReset().mockReturnValue(true);
    mockRbacGuard.canActivate.mockReset().mockReturnValue(true);
  }

  export function applyAuthOverrides(
    builder: TestingModuleBuilder,
  ): TestingModuleBuilder {
    return builder
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RbacGuard)
      .useValue(mockRbacGuard);
  }

  export function makeJwtGuardReject(): void {
    mockJwtAuthGuard.canActivate.mockImplementationOnce(() => {
      throw new UnauthorizedException('Missing token');
    });
  }

  export function makeRbacGuardReject(): void {
    mockRbacGuard.canActivate.mockImplementationOnce(() => {
      throw new ForbiddenException('Permission denied');
    });
  }
  ```
  Verify the SupabaseAuthUserDto shape by reading `apps/forge/api/src/auth/dto/auth.dto.ts` and filling in the `defaultPrincipal` fields accurately.
- [ ] 4.2 Run `cd apps/forge/api && npm run test 2>&1 | grep "FAIL\|Error" | head -40` to enumerate which specs are broken. Expected: every spec that mounts a controller from Phase 3A or 3B fails.
- [ ] 4.3 For each failing spec, update the `Test.createTestingModule(...).compile()` chain to pipe through `applyAuthOverrides(...)`. Add `resetAuthMocks()` in `beforeEach`. Import the helper.
- [ ] 4.4 For each controller spec whose guard state changed, add a minimal `describe('guard stack', ...)` block using `makeJwtGuardReject()` and `makeRbacGuardReject()` — same pattern as admin-api's `llm-analytics.controller.spec.ts`:
  ```ts
  describe('guard stack', () => {
    it('makeJwtGuardReject causes the next canActivate to throw Unauthorized', () => {
      makeJwtGuardReject();
      const { mockJwtAuthGuard } = jest.requireActual<
        typeof import('../test-utils/mock-guards')
      >('../test-utils/mock-guards');
      expect(() =>
        mockJwtAuthGuard.canActivate({} as never),
      ).toThrow(UnauthorizedException);
    });

    it('makeRbacGuardReject causes the next canActivate to throw Forbidden', () => {
      makeRbacGuardReject();
      const { mockRbacGuard } = jest.requireActual<
        typeof import('../test-utils/mock-guards')
      >('../test-utils/mock-guards');
      expect(() =>
        mockRbacGuard.canActivate({} as never),
      ).toThrow(ForbiddenException);
    });
  });
  ```
  Adjust relative paths per file depth. Do NOT add full supertest-style integration tests — unit-shape is sufficient per admin-api precedent.
- [ ] 4.5 Do NOT touch `*.service.spec.ts` — services don't mount controllers.
- [ ] 4.6 Do NOT touch `health.controller.spec.ts` (if it exists) — health is `@Public()`, no guards to mock.
- [ ] 4.7 Do NOT touch specs for the 2 "already fully correct" controllers (`rbac.controller.ts` and the Phase 2 `@Public()` controllers) unless they were using a different mock pattern that needs consolidation.
- [ ] 4.8 Iterate: run `cd apps/forge/api && npm run test`, fix per-spec issues, repeat until all green. Expected failure modes during iteration:
  - Missing helper import path (wrong relative depth)
  - `AuthClient` / `IdentityProvider` / `RbacService` still referenced directly in the spec's providers array — may need additional `.overrideProvider()` calls if the guard's DI tries to resolve them before being overridden
  - `StreamTokenService` references in specs that test stream-token-authed endpoints — this is a forge-api-specific concern; if it blocks a spec, document and skip that spec's new guard-stack test (the stream-token path is its own auth channel and isn't affected by Phase 1)

### Quality Gate
- [ ] **Lint**: `cd apps/forge/api && npm run lint` — no new errors
- [ ] **Build**: `cd apps/forge/api && npm run build` — clean
- [ ] **Unit Tests**:
  - [ ] `cd apps/forge/api && npm run test` — ALL specs pass, including the new 401/403 helper tests
  - [ ] The total test count is >= the pre-Phase-3 count (we didn't drop any tests, only added)
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A — Phase 5
- [ ] **Chrome Tests**: N/A — Phase 5
- [ ] **Phase Review**:
  - [ ] `mock-guards.ts` helper exists with all exports from step 4.1
  - [ ] Every spec that mounts a Phase 3A/3B controller imports from `test-utils/mock-guards` (grep verification)
  - [ ] `grep -rn "test-utils/mock-guards" apps/forge/api/src --include="*.spec.ts" | wc -l` ≥ count of controllers whose guard state changed

---

## Phase 5: Live verification (curl matrix)
**Status**: Not Started
**Objective**: Run the full HTTP-level verification against a running forge-api on port 5200. Confirm §2 success criteria empirically.

### Steps
- [ ] 5.1 Restart forge-api dev server so all decorators are live. Confirm it's listening: `lsof -iTCP:5200 -sTCP:LISTEN -P | head`.
- [ ] 5.2 Confirm auth-api is also running on 5100 (needed for token issuance). `lsof -iTCP:5100 -sTCP:LISTEN -P | head`.
- [ ] 5.3 Obtain a fresh demo-user JWT:
  ```
  TOKEN=$(curl -sS -X POST http://localhost:5100/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"demo-user@orchestratorai.io","password":"DEMOUSER123!"}' | jq -r .accessToken)
  echo "token_len=${#TOKEN}"
  ```
- [ ] 5.4 **Public endpoint matrix** — no header, expect 200:
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5200/health` → 200
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5200/.well-known/agent.json` → 200
  - [ ] If `app.controller.ts` was marked `@Public()`: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5200/` → 200
- [ ] 5.5 **Unauth matrix** — no header against protected endpoints, expect 401 for every one. Use the Phase 3 list. For each controller, curl one representative GET or HEAD. Expected: 401 across the board. Sample commands (adjust URL paths per Phase 3 finalized routes):
  - [ ] `curl -s -o /dev/null -w "legal        %{http_code}\n" http://localhost:5200/legal-department/jobs` → 401
  - [ ] `curl -s -o /dev/null -w "data        %{http_code}\n" http://localhost:5200/data-analyst` → 401
  - [ ] `curl -s -o /dev/null -w "marketing   %{http_code}\n" http://localhost:5200/marketing-swarm` → 401
  - [ ] `curl -s -o /dev/null -w "extended    %{http_code}\n" http://localhost:5200/extended-post-writer` → 401
  - [ ] `curl -s -o /dev/null -w "bizautomate %{http_code}\n" http://localhost:5200/business-automation-advisor` → 401
  - [ ] `curl -s -o /dev/null -w "cad         %{http_code}\n" http://localhost:5200/agents/engineering/cad-agent` → 401
  - [ ] `curl -s -o /dev/null -w "hr          %{http_code}\n" http://localhost:5200/conversions/hr-assistant` → 401
  - [ ] `curl -s -o /dev/null -w "analytics   %{http_code}\n" http://localhost:5200/analytics` → 401
  - [ ] `curl -s -o /dev/null -w "assets      %{http_code}\n" http://localhost:5200/assets` → 401 (unless a specific asset method was kept public)
  - [ ] `curl -s -o /dev/null -w "feat-flags  %{http_code}\n" http://localhost:5200/feature-flags` → 401
  - [ ] `curl -s -o /dev/null -w "system      %{http_code}\n" http://localhost:5200/system` → 401
  - [ ] `curl -s -o /dev/null -w "rag-intq    %{http_code}\n" http://localhost:5200/rag/internal` → 401
  - [ ] `curl -s -o /dev/null -w "rag-coll    %{http_code}\n" http://localhost:5200/api/rag/collections` → 401
  - [ ] `curl -s -o /dev/null -w "rag-query   %{http_code}\n" http://localhost:5200/api/rag/collections/test/query` → 401 (route has path param; 401 should still come before param handling)
  - [ ] `curl -s -o /dev/null -w "engineering %{http_code}\n" http://localhost:5200/engineering` → 401
- [ ] 5.6 **Garbage-token check** — at least one protected route, expect 401:
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer invalid-garbage-token" http://localhost:5200/legal-department/jobs` → 401
- [ ] 5.7 **Demo-user matrix** — every protected route, expect 2xx:
  - [ ] `curl -s -o /dev/null -w "legal        %{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:5200/legal-department/jobs` → 200 or 201 (list jobs)
  - [ ] `curl -s -o /dev/null -w "analytics   %{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:5200/analytics` → 2xx
  - [ ] `curl -s -o /dev/null -w "system      %{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:5200/system` → 2xx
  - [ ] Pick one GET per other protected controller and record the expected status. Any 4xx/5xx other than 401/403 is a red flag to investigate (e.g. 500 = downstream service bug surfaced through the now-correct auth path; 404 = route path wrong in this curl).
  - [ ] Any 403 in the demo-user matrix means the permission we picked in Phase 1 isn't granted to demo-user's admin role. Fall back to a broader permission (e.g. `admin:settings`) in Phase 3 and re-verify. Record the fallback in the completion report.
- [ ] 5.8 **Legal-department end-to-end smoke** (the highest-value endpoint):
  - [ ] `curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:5200/legal-department/jobs | jq '.jobs | length'` → a number (ideally matching what you see in the DB). Success indicator: not 401/403 and not a 5xx.
  - [ ] Optionally: `curl -sS -X POST http://localhost:5200/legal-department/jobs -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"text": "test nda draft"}' | jq .` to create a job and confirm the POST path works through the guard stack.
- [ ] 5.9 **Latency spot-check**:
  - [ ] `for i in 1 2 3 4 5; do curl -sS -o /dev/null -w "%{time_total}\n" -H "Authorization: Bearer $TOKEN" http://localhost:5200/legal-department/jobs; done`
  - [ ] Record the median. Baseline before hardening was approximately 0 extra ms (unguarded). After hardening, expect ~5-15ms for in-process `SupabaseIdentityProvider.validateToken()` + `RbacService.hasPermission()`. Record actual times.

### Quality Gate
- [ ] **Lint**: N/A (no code edits this phase)
- [ ] **Build**: N/A
- [ ] **Unit Tests**: N/A (Phase 4 covered)
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**:
  - [ ] Public endpoints return 200 (at least `/health` and `/.well-known/agent.json`)
  - [ ] All unauth curls return 401
  - [ ] Garbage-token curl returns 401
  - [ ] All demo-user curls return 2xx (or fall back to broader permission if 403)
  - [ ] Legal-department smoke passes (list jobs returns a count; optional POST creates a job)
  - [ ] Latency p50 <30ms on legal-department list (allows headroom for future inflation)
- [ ] **Chrome Tests**: Deferred — admin-web uses the same Bearer flow and no frontend changed. Skip per admin-auth-hardening precedent.
- [ ] **Phase Review**:
  - [ ] Every PRD §2 success criterion empirically verified
  - [ ] Permission fallbacks (if any) recorded for the completion report
  - [ ] Any endpoints returning 500 (downstream service bugs that were masked by the missing auth) recorded for separate follow-up

---

## Phase 6: Write forge-auth-remote-unification.md + completion report + PR
**Status**: Not Started
**Objective**: File Phase 2 as a real follow-up effort, write the completion report, commit, push, open PR. The existence of a well-scoped Phase 2 intention file is itself a gate item — if Phase 2 is forgotten, Phase 1 was not done correctly.

### Steps

- [ ] 6.1 Write `docs/efforts/future/forge-auth-remote-unification.md`. Required sections:
  - **Title**: `Forge API Auth Hardening — Phase 2: Remote-Auth Unification`
  - **Starting state**: reference this effort's completion report; note that Phase 1 landed in-process hardening and that remote-auth migration is the remaining work.
  - **Preconditions** (all three must be true before this effort starts):
    1. Compose-api AND pulse-api have both adopted the remote-authorization pattern. Specifically: `packages/auth-client/` exists as a real shared package consumed by at least two products (admin + one of compose/pulse), the pattern is proven on a second non-trivial product, and the extraction happened naturally as a consequence of the second consumer arriving.
    2. Bridge-api has either adopted the pattern or has an explicit exception documented. Bridge is an edge case (external A2A gateway, possibly different trust boundary); the decision is made and written down before this effort starts.
    3. Latency measurement has been performed on a representative legal-department workflow (from `POST /legal-department/jobs` through specialist fan-out to final synthesis) comparing in-process vs. a prototype remote-auth variant. If the remote variant adds >100ms p50 to the end-to-end flow, the cache design is part of this effort's Phase 1. If it adds <50ms, no cache is needed initially.
  - **Scope**:
    - Replace forge-api's in-process `JwtAuthGuard` + `RbacGuard` + local decorators with `packages/auth-client/` (extracted from `apps/admin/api/src/auth/` during compose/pulse hardening)
    - Delete `apps/forge/api/src/auth/guards/jwt-auth.guard.ts`, `apps/forge/api/src/rbac/guards/rbac.guard.ts`, `apps/forge/api/src/auth/decorators/public.decorator.ts`, `apps/forge/api/src/rbac/decorators/require-permission.decorator.ts`
    - Update every `@UseGuards(JwtAuthGuard, RbacGuard)` site in forge-api to import from `@orchestratorai/auth-client` (or the finalized package name)
    - Migrate `apps/forge/api/src/test-utils/mock-guards.ts` to the shared helper shipped with the package
    - Reconcile `StreamTokenService`: forge-api's in-process `JwtAuthGuard` supports stream tokens via `StreamTokenService` (a separate auth channel for SSE connections). The remote-auth pattern does not handle stream tokens natively. Options: (a) keep `StreamTokenService` as a separate in-process concern and let the HTTP guard skip stream-authed routes, (b) move stream-token validation into `packages/auth-client/` as a second method, (c) stream-authed endpoints remain on a legacy in-process guard that lives in forge-api forever. Decision is part of this effort's design phase.
    - Reconcile `customer-service/guards/rate-limit.guard.ts` (which extracts Bearer tokens for rate-limit key derivation)
    - Add a short-TTL LRU cache in `AuthClient` if the latency measurement demands it (cache key: `sha256(token):permission:orgSlug`; TTL ~30s; max size ~10k entries)
  - **Follow-up items to fold in (carry-over from Phase 1 completion report)**:
    - Webhook signature verification (HMAC) for `webhooks/webhooks.controller.ts` methods that were kept `@Public()` in Phase 1 without a signature check
    - Signed-URL support for `assets/assets.controller.ts` public-stream cases if any were kept public
    - `rag/internal-query.controller.ts` — decide whether to guard (as Phase 1 did) or remove entirely as a service-to-service-only endpoint
  - **Out of scope for Phase 2**:
    - Adding new functionality to forge-api
    - Changing any controller's permission mapping (Phase 1 froze the vocabulary)
    - Touching compose/pulse/bridge products (they are prerequisites, not scope)
  - **Done-when**:
    - Every `@UseGuards` site in forge-api imports from `@orchestratorai/auth-client`
    - Zero imports from `apps/forge/api/src/auth/guards/` or `apps/forge/api/src/rbac/guards/`
    - Phase 1's curl matrix still passes (same commands, same expected responses)
    - Latency is within the target decided during the measurement precondition
    - Legal-department end-to-end workflow still runs correctly (POST, SSE, HITL review, completion)
    - Migration of `StreamTokenService` handling documented and implemented
  - **Gate**: admin-api + forge-api both use `packages/auth-client/`; no duplication; forge-api's `src/auth/` folder contains only `auth.controller.ts`, `auth.service.ts`, `services/stream-token.service.ts`, and possibly `dto/` — no guards, no decorators, no providers
  - Minimum 80 lines of real content (not boilerplate)

- [ ] 6.2 Write `docs/efforts/current/completion-report.md`. Sections:
  - Summary (1 paragraph): what shipped, approach (additive in-process hardening), key numbers (17 unguarded controllers hardened + 9 upgraded from JwtAuthGuard-only to full stack)
  - Phase results table (Phase | Status | Notable decisions/deviations)
  - Permission mapping table (final values from Phase 1)
  - Gate results: lint, build, all three forge-api test counts (before/after), full curl matrix outcomes, latency numbers
  - Deviations from PRD (the `/observability/stream` vaporware finding was already in the PRD; document any Phase 3 permission fallbacks here)
  - Pre-existing issues surfaced: any 500s in the curl matrix (downstream bugs now visible because auth is correct), the `customer-service/guards/rate-limit.guard.ts` inline Bearer documented as acceptable
  - Follow-ups list: explicit pointer to `docs/efforts/future/forge-auth-remote-unification.md` as the committed Phase 2 effort; webhook signature check; signed-URL for assets; rag/internal-query removal investigation

- [ ] 6.3 Run full-repo gates one more time:
  - [ ] `npm run lint` — no new errors on touched files (pre-existing unrelated errors in other products documented)
  - [ ] `npm run build` — clean
  - [ ] `npm run test` — green for all previously-green suites; legal-department, forge, admin, auth all pass

- [ ] 6.4 Final boundary verification:
  - [ ] `git diff main...HEAD -- apps/forge/api/src/auth/guards/jwt-auth.guard.ts apps/forge/api/src/rbac/guards/rbac.guard.ts packages/planes/rbac packages/planes/auth/guards/jwt-auth.guard.ts` → the first two may have been touched ONLY if Phase 1 step 1.6 needed to fix the `hasPermission` bug; the last two MUST be empty
  - [ ] `grep -rn "from.*@orchestratorai/planes/rbac" apps/forge/api/src --include="*.ts"` → zero hits (forge-api does not import planes rbac)
  - [ ] `grep -rn "packages/auth-client" apps/forge/api/src --include="*.ts"` → zero hits (packages/auth-client does not exist yet — that's Phase 2)

- [ ] 6.5 Review commit history on the branch: `git log main..HEAD --oneline`. If messy (many small fixup commits), optionally squash into logical chunks matching phases. If already clean, skip.

- [ ] 6.6 `git push -u origin effort/forge-auth-hardening`

- [ ] 6.7 Open PR via `gh pr create` with a body that:
  - Summarizes the 6 phases and what each delivered
  - Links to the completion report
  - Explicitly calls out the committed Phase 2 follow-up at `docs/efforts/future/forge-auth-remote-unification.md` with its three preconditions
  - Calls out any permission fallbacks taken in Phase 3 that differ from the PRD's planned mapping
  - Notes any 500s surfaced by the curl matrix that indicate pre-existing downstream bugs (not regressions)
  - Includes the latency spot-check numbers from Phase 5.9

- [ ] 6.8 Run `/pr-eval` on the new PR. Fix any issues surfaced, re-run the gates in 6.3, push fixes.

- [ ] 6.9 Merge to main via the standard merge process.

- [ ] 6.10 Archive the effort directory:
  ```
  mkdir -p docs/efforts/forge-auth-hardening
  git mv docs/efforts/current/intention.md docs/efforts/forge-auth-hardening/intention.md
  git mv docs/efforts/current/prd.md docs/efforts/forge-auth-hardening/prd.md
  git mv docs/efforts/current/plan.md docs/efforts/forge-auth-hardening/plan.md
  git mv docs/efforts/current/completion-report.md docs/efforts/forge-auth-hardening/completion-report.md
  git commit -m "chore(efforts): archive forge-auth-hardening"
  git push origin main
  ```

- [ ] 6.11 Create an email draft in Gmail notifying completion. **Draft only — do NOT send.**

### Quality Gate
- [ ] **Lint**: `npm run lint` — no new issues
- [ ] **Build**: `npm run build` — clean
- [ ] **Unit Tests**: `npm run test` — all pre-existing green tests still green
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A (covered in Phase 5)
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] `docs/efforts/future/forge-auth-remote-unification.md` exists, is ≥80 lines of real content, and has all three preconditions documented
  - [ ] Completion report written and accurate
  - [ ] All grep-verified boundaries hold (step 6.4)
  - [ ] PR opened, reviewed, merged, effort archived
  - [ ] Email draft created (not sent)
