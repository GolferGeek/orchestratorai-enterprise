# Admin API Auth Hardening — Implementation Plan

**PRD**: ./prd.md
**Created**: 2026-04-08
**Status**: Not Started

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Add POST /auth/authorize to auth-api
- [x] Phase 2: Build admin-api auth layer (AuthClient + local guards + decorators)
- [x] Phase 3: Wire guards on admin-api controllers
- [x] Phase 4: Update admin-api controller specs + shared mock helper
- [x] Phase 5: Live verification (curl matrix + Chrome smoke)
- [ ] Phase 6: Cleanup + completion report + PR

---

## Shared conventions

- **Working dir**: `/Users/golfergeek/projects/orchAI/orchestratorai-enterprise-dev`
- **Branch**: `effort/admin-auth-hardening` (already created)
- **Lint (root)**: `npm run lint`
- **Build (root)**: `npm run build`
- **Unit tests (root, turbo)**: `npm run test`
- **Targeted jest (auth-api)**: `cd apps/auth/api && npm run test`
- **Targeted jest (admin-api)**: `cd apps/admin/api && npm run test`
- **Targeted lint (auth-api)**: `cd apps/auth/api && npm run lint`
- **Targeted lint (admin-api)**: `cd apps/admin/api && npm run lint`
- **Targeted build (auth-api)**: `cd apps/auth/api && npm run build`
- **Targeted build (admin-api)**: `cd apps/admin/api && npm run build`
- **Auth API URL (dev)**: `http://localhost:5100`
- **Admin API URL (dev)**: `http://localhost:5150`
- **Admin Web URL (dev)**: `http://localhost:5101`
- **Supabase DB (local env)**: `10.0.0.1:54322` — NOT `localhost:54322` (Cursor/Spark SSH tunnel hijacks loopback). Use `docker exec supabase_db_orchestratorai-enterprise psql -U postgres -d postgres -c "..."` for DB inspection.
- **Demo admin user**: `demo-user@orchestratorai.io` / `DEMOUSER123!` — global super-admin; has `admin:settings`, `llm:admin`, `rag:admin`, `agents:admin`, `admin:audit`, `admin:users`, `admin:roles`
- **No fallbacks. No cheating.** Errors propagate. Guards throw `UnauthorizedException` / `ForbiddenException` / `ServiceUnavailableException` / `InternalServerErrorException`. Never silently allow or silently deny.
- **Admin-api does NOT import from `@orchestratorai/planes` for auth**, does NOT import from `apps/auth/api/**`, does NOT touch `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`.
- **Auth-api does NOT import from `@orchestratorai/planes`.** (Enforced by `apps/auth/api/CLAUDE.md`.)

---

## Phase 1: Add POST /auth/authorize to auth-api
**Status**: Not Started
**Objective**: Add a new authenticated endpoint in auth-api that combines token validation (existing `JwtAuthGuard`) with RBAC evaluation (existing `RbacService.isSuperAdmin` → `isAdmin` → `hasPermission` ladder) and returns 200/403 in a single call. Zero moves of existing classes.

### Steps
- [ ] 1.1 Read `apps/auth/api/src/auth/auth.controller.ts` in full (already partially read — focus on existing `@Get('validate')`, `@Get('permissions')`, and the `RbacGuard`-guarded admin endpoints near line 486+) to learn the local DTO + controller conventions and understand the guard stacking pattern used by sibling endpoints.
- [ ] 1.2 Read `apps/auth/api/src/rbac/rbac.service.ts` — confirm the signatures of `isSuperAdmin(userId)`, `isAdmin(userId, orgSlug)`, `hasPermission(userId, orgSlug, permission, resourceType?, resourceId?)` match what the new endpoint will call.
- [ ] 1.3 Read `apps/auth/api/src/rbac/guards/rbac.guard.ts` — copy its short-circuit ladder (super-admin → admin → hasPermission) mentally; the new endpoint replicates this logic inline (do NOT invoke the guard itself from inside a controller handler — that's an anti-pattern in Nest).
- [ ] 1.4 Look for an existing DTO folder in auth-api: `ls apps/auth/api/src/auth/dto 2>/dev/null` OR grep for `*.dto.ts` under `apps/auth/api/src/auth/`. If a conventional location exists, use it; otherwise create `apps/auth/api/src/auth/dto/authorize.dto.ts`.
- [ ] 1.5 Create `AuthorizeRequestDto` with class-validator decorators:
  ```ts
  import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

  export class AuthorizeRequestDto {
    @IsString() @IsNotEmpty()
    permission!: string;

    @IsString() @IsOptional()
    organizationSlug?: string;

    @IsString() @IsOptional()
    resourceType?: string;

    @IsString() @IsOptional()
    resourceId?: string;
  }
  ```
- [ ] 1.6 Add the `POST /auth/authorize` handler to `apps/auth/api/src/auth/auth.controller.ts`. Place it near the existing `@Get('validate')` / `@Get('permissions')` handlers for source-level cohesion:
  ```ts
  @Post('authorize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Validate a Bearer token AND check a permission in one call',
    description:
      'Called by other products (admin-api, and future forge-api/compose-api/pulse-api/bridge-api) to authorize an incoming request in a single round-trip. Returns 200 with principal info when allowed, 401 when the token is invalid, 403 when the permission is denied.',
  })
  @ApiResponse({ status: 200, description: 'Authorized' })
  @ApiResponse({ status: 401, description: 'Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  async authorize(
    @CurrentUser() currentUser: SupabaseAuthUserDto,
    @Request() req: Record<string, unknown>,
    @Body() body: AuthorizeRequestDto,
  ): Promise<{
    allowed: true;
    userId: string;
    email: string | null;
    orgSlug: string | null;
    orgId: string | null;
    roles: string[];
    permission: string;
  }> {
    const start = Date.now();

    // Resolve org slug: body > header > query > '*'
    const headers = (req.headers as Record<string, unknown>) ?? {};
    const query = (req.query as Record<string, unknown>) ?? {};
    const headerOrg = (headers['x-organization-slug'] as string | undefined) ?? undefined;
    const queryOrg = (query['organizationSlug'] as string | undefined) ?? undefined;
    const orgSlug = body.organizationSlug ?? headerOrg ?? queryOrg ?? '*';

    // Short-circuit ladder — mirrors RbacGuard.canActivate()
    const isSuper = await this.rbacService.isSuperAdmin(currentUser.id);
    let allowed = false;
    if (isSuper) {
      allowed = true;
    } else if (body.permission.startsWith('admin:')) {
      allowed = await this.rbacService.isAdmin(currentUser.id, orgSlug);
    }
    if (!allowed) {
      allowed = await this.rbacService.hasPermission(
        currentUser.id,
        orgSlug,
        body.permission,
        body.resourceType,
        body.resourceId,
      );
    }

    const latencyMs = Date.now() - start;
    this.logger.debug(
      `[authorize] userId=${currentUser.id} permission=${body.permission} orgSlug=${orgSlug} result=${allowed ? 'allow' : 'deny'} latencyMs=${latencyMs}`,
    );

    if (!allowed) {
      throw new ForbiddenException(`Permission denied: ${body.permission}`);
    }

    // Re-use the same principal derivation as /auth/me / /auth/validate. If the controller has
    // a helper for this, call it; otherwise return the minimum required shape by reading
    // currentUser + whatever the existing /auth/validate handler already returns.
    return {
      allowed: true,
      userId: currentUser.id,
      email: (currentUser.email as string | null | undefined) ?? null,
      orgSlug,
      orgId: null, // filled from currentUser if available — confirm field name during implementation
      roles: [], // filled from principal — confirm field source during implementation
      permission: body.permission,
    };
  }
  ```
  **Note**: the `orgId` and `roles` fields above are placeholders. Fill them by reading what the existing `/auth/validate` handler returns and using the same derivation. Do NOT introduce new DB calls just to populate `roles` — if the principal derivation from `currentUser` is trivial, do it; otherwise leave `roles: []` and document in the completion report.
- [ ] 1.7 Ensure all imports are present at the top of `auth.controller.ts`: `Post`, `Body`, `ForbiddenException`, `ApiResponse`, and the `AuthorizeRequestDto`. If `rbacService` is not already injected into `AuthController`, check the constructor and the module providers — it MUST already be there because the existing admin endpoints (line 591+) use `@UseGuards(JwtAuthGuard, RbacGuard)` which depends on `RbacService` being wired into the module. Verify by reading the constructor; if missing, add `@Inject(RbacService)` / constructor param and re-check `auth.module.ts`.
- [ ] 1.8 Add a Nest spec for the new endpoint. Preferred: extend `apps/auth/api/src/auth/auth.controller.spec.ts` with a new `describe('POST /auth/authorize', ...)` block. Otherwise create `apps/auth/api/src/auth/authorize.endpoint.spec.ts` next to the controller. Cover:
  - [ ] 1.8.1 Super-admin short-circuit: `rbacService.isSuperAdmin` returns true → 200, `hasPermission` NOT called
  - [ ] 1.8.2 Admin role + `admin:*` permission: `isSuperAdmin` false, `isAdmin` true → 200, `hasPermission` NOT called
  - [ ] 1.8.3 Normal permission granted: `isSuperAdmin` false, `hasPermission` true → 200
  - [ ] 1.8.4 Permission denied: all three return false → `ForbiddenException` (403)
  - [ ] 1.8.5 Bad body: missing `permission` field → 400 (Nest's `ValidationPipe` rejects before the handler runs — confirm `ValidationPipe` is globally registered in `apps/auth/api/src/main.ts`; if it isn't, add `@UsePipes(new ValidationPipe({ whitelist: true }))` on the controller or method)
  - [ ] 1.8.6 Token missing/invalid: JwtAuthGuard rejects → 401 (Nest's standard behavior — usually tested by asserting that an unmocked guard throws on an empty `request.headers`)
  - Mock `RbacService` with `jest.fn()`; mock the current user via whatever pattern the existing spec uses (look at how the `/auth/permissions` spec sets up `@CurrentUser()` — if no spec exists for `/auth/permissions`, use direct controller instantiation and pass `currentUser` as a function argument).
- [ ] 1.9 Run targeted auth-api lint, build, test to verify before global gates:
  ```
  cd apps/auth/api && npm run lint
  cd apps/auth/api && npm run build
  cd apps/auth/api && npm run test
  ```
  Fix any failures before proceeding to step 1.10.
- [ ] 1.10 Verify no planes import was accidentally introduced:
  ```
  grep -rn "from.*@orchestratorai/planes" apps/auth/api/src --include="*.ts"
  ```
  Expect **zero hits**. If any hit appears, it's a mistake — fix before proceeding.
- [ ] 1.11 Verify no files under `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts` were modified in this branch:
  ```
  git diff --name-only main...HEAD -- packages/planes/rbac packages/planes/auth/guards/jwt-auth.guard.ts
  ```
  Expect **empty output**.
- [ ] 1.12 Start auth-api in a background shell (or confirm it's already running) and run manual curl verification — defer to the Quality Gate's Curl Tests section below (don't duplicate commands here).

### Quality Gate
- [ ] **Lint**: `cd apps/auth/api && npm run lint` — no new errors
- [ ] **Build**: `cd apps/auth/api && npm run build` — clean. Also run `npm run build` at repo root to catch transitive type errors.
- [ ] **Unit Tests**:
  - [ ] `cd apps/auth/api && npm run test` — all auth-api tests pass, including the new authorize-endpoint specs (1.8.1–1.8.6)
- [ ] **E2E Tests**: N/A this phase
- [ ] **Curl Tests** (requires a running auth-api on port 5100 — start with `npm run dev:auth:api` if not already running):
  - [ ] `TOKEN=$(curl -sS -X POST http://localhost:5100/auth/login -H "Content-Type: application/json" -d '{"email":"demo-user@orchestratorai.io","password":"DEMOUSER123!"}' | jq -r .accessToken); echo "$TOKEN" | head -c 30` — obtain a demo-user token
  - [ ] `curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5100/auth/authorize -H "Content-Type: application/json" -d '{"permission":"admin:settings"}'` → **401** (no token)
  - [ ] `curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5100/auth/authorize -H "Authorization: Bearer garbage" -H "Content-Type: application/json" -d '{"permission":"admin:settings"}'` → **401**
  - [ ] `curl -sS -w "\n%{http_code}\n" -X POST http://localhost:5100/auth/authorize -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"permission":"admin:settings"}'` → **200** with `{"allowed":true,...}`
  - [ ] `curl -sS -w "\n%{http_code}\n" -X POST http://localhost:5100/auth/authorize -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"permission":"llm:admin"}'` → **200**
  - [ ] `curl -sS -w "\n%{http_code}\n" -X POST http://localhost:5100/auth/authorize -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"permission":"definitely-not-a-real:permission"}'` → **403**
  - [ ] `curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5100/auth/authorize -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'` → **400** (missing required `permission` field)
- [ ] **Chrome Tests**: N/A this phase
- [ ] **Phase Review**:
  - [ ] New `/auth/authorize` endpoint exists and the full curl matrix above passes
  - [ ] Zero planes imports in auth-api: `grep -rn "from.*@orchestratorai/planes" apps/auth/api/src --include="*.ts"` → 0 hits
  - [ ] Zero changes under `packages/planes/rbac/` or `packages/planes/auth/guards/jwt-auth.guard.ts`: `git diff --name-only main...HEAD -- packages/planes/rbac packages/planes/auth/guards/jwt-auth.guard.ts` → empty
  - [ ] Existing `JwtAuthGuard`, `RbacGuard`, `RbacService` in auth-api are unchanged: `git diff main...HEAD -- apps/auth/api/src/auth/guards/jwt-auth.guard.ts apps/auth/api/src/rbac/guards/rbac.guard.ts apps/auth/api/src/rbac/rbac.service.ts` → no changes (only `auth.controller.ts`, module wiring if needed, and new DTO/spec files should appear in the phase-1 diff)
  - [ ] Document any deviations (e.g. if `roles` couldn't be populated from `currentUser` without a new DB call, note it as a future enhancement)

---

## Phase 2: Build admin-api auth layer (AuthClient + local guards + decorators)
**Status**: Not Started
**Objective**: Create the admin-api-local `src/auth/` folder containing `AuthClient` (HTTP client that calls `POST /auth/authorize`), `JwtAuthGuard` + `RbacGuard` (Nest guards), `require-permission` + `public` decorators, an `AuthModule` that registers everything globally, and a barrel `index.ts`. Wire the module into `app.module.ts`. Do NOT attach guards to any controllers yet — Phase 3 does that.

### Steps
- [ ] 2.1 Read `apps/admin/api/package.json` to confirm (a) Node 20+ engines (for global `fetch`), (b) that `@nestjs/common`, `@nestjs/core`, and `reflect-metadata` are already dependencies. No new deps should be needed. Record findings.
- [ ] 2.2 Read `apps/admin/api/src/app.module.ts` in full. Identify the import list + the `@Global()`/module-registration patterns used by other admin-api modules.
- [ ] 2.3 Read `apps/admin/api/src/main.ts` to confirm `ValidationPipe` is globally registered (for future DTO validation work) and note the env-var loading pattern.
- [ ] 2.4 Create the folder and files (do NOT write content yet — just verify the paths are valid):
  ```
  apps/admin/api/src/auth/
    auth-client.service.ts
    auth-client.service.spec.ts
    jwt-auth.guard.ts
    jwt-auth.guard.spec.ts
    rbac.guard.ts
    rbac.guard.spec.ts
    decorators/
      require-permission.decorator.ts
      public.decorator.ts
    auth.module.ts
    index.ts
  ```
- [ ] 2.5 Write `apps/admin/api/src/auth/decorators/require-permission.decorator.ts`:
  ```ts
  import { SetMetadata } from '@nestjs/common';

  export const PERMISSION_KEY = 'requiredPermission';

  export const RequirePermission = (permission: string): MethodDecorator & ClassDecorator =>
    SetMetadata(PERMISSION_KEY, permission);
  ```
- [ ] 2.6 Write `apps/admin/api/src/auth/decorators/public.decorator.ts`:
  ```ts
  import { SetMetadata } from '@nestjs/common';

  export const IS_PUBLIC_KEY = 'isPublic';

  export const Public = (): MethodDecorator & ClassDecorator =>
    SetMetadata(IS_PUBLIC_KEY, true);
  ```
- [ ] 2.7 Write `apps/admin/api/src/auth/auth-client.service.ts`:
  ```ts
  import {
    Injectable,
    Logger,
    UnauthorizedException,
    ForbiddenException,
    ServiceUnavailableException,
    InternalServerErrorException,
  } from '@nestjs/common';

  export interface AuthorizeResult {
    allowed: true;
    userId: string;
    email: string | null;
    orgSlug: string | null;
    orgId: string | null;
    roles: string[];
    permission: string;
  }

  @Injectable()
  export class AuthClient {
    private readonly logger = new Logger(AuthClient.name);
    private readonly authApiUrl: string;
    private readonly timeoutMs: number;

    constructor() {
      const url = process.env['AUTH_API_URL'];
      if (!url) {
        throw new Error(
          'AUTH_API_URL environment variable is required. ' +
            'Set AUTH_API_URL=http://localhost:5100 in your .env file.',
        );
      }
      this.authApiUrl = url.replace(/\/$/, '');
      this.timeoutMs = parseInt(process.env['AUTH_API_TIMEOUT_MS'] ?? '2000', 10);
    }

    async authorize(
      token: string,
      permission: string,
      organizationSlug?: string,
      resourceType?: string,
      resourceId?: string,
    ): Promise<AuthorizeResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await fetch(`${this.authApiUrl}/auth/authorize`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            permission,
            organizationSlug,
            resourceType,
            resourceId,
          }),
        });
      } catch (err) {
        this.logger.error(
          `[authorize] network/timeout calling auth-api: ${(err as Error).message}`,
        );
        throw new ServiceUnavailableException('Auth service unavailable');
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 401) {
        throw new UnauthorizedException('Invalid or missing credentials');
      }
      if (response.status === 403) {
        throw new ForbiddenException(`Permission denied: ${permission}`);
      }
      if (response.status >= 500) {
        this.logger.error(`[authorize] auth-api returned ${response.status}`);
        throw new ServiceUnavailableException('Auth service error');
      }
      if (response.status !== 200) {
        this.logger.error(`[authorize] unexpected status ${response.status}`);
        throw new InternalServerErrorException('Unexpected auth-api response');
      }

      const body = (await response.json()) as AuthorizeResult;
      if (!body || body.allowed !== true || typeof body.userId !== 'string') {
        throw new InternalServerErrorException('Malformed auth-api response');
      }
      return body;
    }
  }
  ```
- [ ] 2.8 Write `apps/admin/api/src/auth/auth-client.service.spec.ts` covering:
  - [ ] 2.8.1 Constructor throws when `AUTH_API_URL` env var is unset
  - [ ] 2.8.2 Successful 200 response returns parsed `AuthorizeResult`
  - [ ] 2.8.3 401 response throws `UnauthorizedException`
  - [ ] 2.8.4 403 response throws `ForbiddenException`
  - [ ] 2.8.5 500 response throws `ServiceUnavailableException`
  - [ ] 2.8.6 Network error throws `ServiceUnavailableException`
  - [ ] 2.8.7 Unknown status (418) throws `InternalServerErrorException`
  - [ ] 2.8.8 Malformed body (missing `userId`) throws `InternalServerErrorException`
  Mock `global.fetch` via `jest.spyOn(globalThis, 'fetch')`. Use `beforeEach` to set `process.env['AUTH_API_URL'] = 'http://localhost:5100'` and restore after.
- [ ] 2.9 Write `apps/admin/api/src/auth/jwt-auth.guard.ts`:
  ```ts
  import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    InternalServerErrorException,
  } from '@nestjs/common';
  import { Reflector } from '@nestjs/core';
  import { AuthClient } from './auth-client.service';
  import { IS_PUBLIC_KEY } from './decorators/public.decorator';
  import { PERMISSION_KEY } from './decorators/require-permission.decorator';

  interface AuthenticatedRequest {
    headers: Record<string, string | undefined>;
    query: Record<string, unknown>;
    body: Record<string, unknown> | undefined;
    user?: unknown;
  }

  @Injectable()
  export class JwtAuthGuard implements CanActivate {
    constructor(
      private readonly reflector: Reflector,
      private readonly authClient: AuthClient,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) return true;

      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const authHeader = request.headers?.['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Missing or malformed Authorization header');
      }
      const token = authHeader.slice('Bearer '.length);

      const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!permission) {
        // Coding bug: every non-public controller must declare @RequirePermission
        throw new InternalServerErrorException(
          'Controller is missing @RequirePermission decorator',
        );
      }

      // Org slug resolution: body > header > query > '*'
      const body = (request.body ?? {}) as Record<string, unknown>;
      const headerOrg = request.headers?.['x-organization-slug'];
      const queryOrg = request.query?.['organizationSlug'] as string | undefined;
      const orgSlug =
        (typeof body['organizationSlug'] === 'string'
          ? (body['organizationSlug'] as string)
          : undefined) ??
        headerOrg ??
        queryOrg ??
        '*';

      const result = await this.authClient.authorize(token, permission, orgSlug);
      request.user = result;
      return true;
    }
  }
  ```
- [ ] 2.10 Write `apps/admin/api/src/auth/jwt-auth.guard.spec.ts` covering:
  - [ ] 2.10.1 `@Public()` on handler → returns true without calling AuthClient
  - [ ] 2.10.2 Missing `Authorization` header → throws `UnauthorizedException`
  - [ ] 2.10.3 Malformed header (no `Bearer ` prefix) → throws `UnauthorizedException`
  - [ ] 2.10.4 Missing `@RequirePermission` metadata → throws `InternalServerErrorException`
  - [ ] 2.10.5 Valid header + permission + AuthClient returns success → attaches `request.user` and returns true
  - [ ] 2.10.6 AuthClient throws `UnauthorizedException` → re-thrown
  - [ ] 2.10.7 AuthClient throws `ForbiddenException` → re-thrown
  - [ ] 2.10.8 Org slug resolution: body > header > query > '*' (four sub-tests, one per priority level)
  Mock `Reflector` + `AuthClient` with `jest.fn()`. Build `ExecutionContext` via a tiny helper that returns a fake HTTP context.
- [ ] 2.11 Write `apps/admin/api/src/auth/rbac.guard.ts`:
  ```ts
  import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';

  /**
   * RbacGuard is a defensive pass-through in the remote-authorization model.
   *
   * The real permission check already happened in JwtAuthGuard via POST /auth/authorize.
   * This guard exists for:
   *   (a) Semantic clarity at controller source — @UseGuards(JwtAuthGuard, RbacGuard)
   *       reads as "authenticated AND authorized"
   *   (b) Forward-compat seam for a future split where one endpoint wants auth without
   *       permission enforcement
   *   (c) It lets @RequirePermission() sit at the same scope as @UseGuards()
   *
   * See PRD §4.1 for the full rationale.
   */
  @Injectable()
  export class RbacGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<{ user?: unknown }>();
      if (!request.user) {
        // JwtAuthGuard should have populated this. If not, fail loud.
        throw new UnauthorizedException('Request is missing authenticated principal');
      }
      return true;
    }
  }
  ```
- [ ] 2.12 Write `apps/admin/api/src/auth/rbac.guard.spec.ts` covering:
  - [ ] 2.12.1 `request.user` populated → returns true
  - [ ] 2.12.2 `request.user` missing → throws `UnauthorizedException`
- [ ] 2.13 Write `apps/admin/api/src/auth/auth.module.ts`:
  ```ts
  import { Global, Module } from '@nestjs/common';
  import { AuthClient } from './auth-client.service';
  import { JwtAuthGuard } from './jwt-auth.guard';
  import { RbacGuard } from './rbac.guard';

  @Global()
  @Module({
    providers: [AuthClient, JwtAuthGuard, RbacGuard],
    exports: [AuthClient, JwtAuthGuard, RbacGuard],
  })
  export class AuthModule {}
  ```
- [ ] 2.14 Write `apps/admin/api/src/auth/index.ts`:
  ```ts
  export { AuthModule } from './auth.module';
  export { AuthClient } from './auth-client.service';
  export type { AuthorizeResult } from './auth-client.service';
  export { JwtAuthGuard } from './jwt-auth.guard';
  export { RbacGuard } from './rbac.guard';
  export {
    RequirePermission,
    PERMISSION_KEY,
  } from './decorators/require-permission.decorator';
  export { Public, IS_PUBLIC_KEY } from './decorators/public.decorator';
  ```
- [ ] 2.15 Update `apps/admin/api/src/app.module.ts`: add `import { AuthModule } from './auth';` and include `AuthModule` in the `imports` array.
- [ ] 2.16 Update the repo-root `.env` file: confirm `AUTH_API_URL=http://localhost:5100` is present (likely already set if any other service talks to auth-api). If missing, add it. Also add `AUTH_API_TIMEOUT_MS=2000` (optional, documented default).
- [ ] 2.17 Check for an `.env.example` file at repo root and/or `apps/admin/api/.env.example`. If it exists, add entries for `AUTH_API_URL` and `AUTH_API_TIMEOUT_MS` with inline comments.
- [ ] 2.18 Run targeted lint/build/test to verify:
  ```
  cd apps/admin/api && npm run lint
  cd apps/admin/api && npm run build
  cd apps/admin/api && npm run test
  ```
- [ ] 2.19 Verify no disallowed imports were introduced:
  ```
  grep -rn "from.*@orchestratorai/planes" apps/admin/api/src/auth --include="*.ts"
  grep -rn "from.*apps/auth/api" apps/admin/api/src --include="*.ts"
  grep -rn "from.*@orchestratorai/planes/rbac" apps/admin/api/src --include="*.ts"
  ```
  Expect **zero hits** on all three.
- [ ] 2.20 Start admin-api with `AUTH_API_URL` unset briefly to confirm it fails fast at startup (a clean error, not a confusing stack). Then restore `AUTH_API_URL` and confirm it starts cleanly. (This can be done via `AUTH_API_URL= npm run dev:admin:api` in a throwaway shell.)

### Quality Gate
- [ ] **Lint**: `cd apps/admin/api && npm run lint` — no new errors
- [ ] **Build**: `cd apps/admin/api && npm run build` — clean. Also run `npm run build` at repo root to catch transitive failures.
- [ ] **Unit Tests**:
  - [ ] `cd apps/admin/api && npm run test` — all tests pass, including every new spec under `src/auth/**/*.spec.ts` (2.8.*, 2.10.*, 2.12.*)
- [ ] **E2E Tests**: N/A this phase
- [ ] **Curl Tests**: N/A this phase — no admin-api routes use the new guards yet. Deferred to Phase 5.
- [ ] **Chrome Tests**: N/A this phase
- [ ] **Phase Review**:
  - [ ] `apps/admin/api/src/auth/` folder exists with all 10 files (client, 2 guards, 2 decorators, module, index, 3 specs)
  - [ ] `AuthModule` registered `@Global()` in `app.module.ts`
  - [ ] Zero disallowed imports (grep checks in step 2.19 all zero)
  - [ ] Admin-api fails fast without `AUTH_API_URL`, starts cleanly with it (step 2.20)
  - [ ] Document any deviations (e.g. if `HttpModule` was used instead of global fetch)

---

## Phase 3: Wire guards on admin-api controllers
**Status**: Not Started
**Objective**: Add `@UseGuards(JwtAuthGuard, RbacGuard)` and `@RequirePermission(...)` at the class level on every admin-api controller except `health`. Remove the `system-config.controller.ts` inline bearer-token check. Leave tests broken — Phase 4 fixes them.

### Steps
- [ ] 3.1 Read `apps/admin/api/src/claude-pane/claude-pane.controller.ts` in full. Decide the final permission: `admin:settings` (safe conservative default for admin config/state management) or `llm:admin` (only if the data is strictly LLM-only, e.g. Claude-code session transcripts). Record the final choice here by editing step 3.5.7 below before moving on.
- [ ] 3.2 Read `apps/admin/api/src/system-config/system-config.controller.ts` to locate the exact inline bearer-token check (lines ~23–28, `if (!authHeader || !authHeader.startsWith('Bearer '))`). Note what imports (e.g. `UnauthorizedException`, `@Req()`, `Request`) become unused after removal.
- [ ] 3.3 Read the actual root routes for each controller so Phase 5's curl matrix has real URLs. Record each path as a sub-step:
  - [ ] 3.3.1 `llm-analytics.controller.ts` root route: `/admin/llm/...` — pick one GET, e.g. `/admin/llm/usage/list`
  - [ ] 3.3.2 `rag-management.controller.ts` root route: `/admin/rag/...`
  - [ ] 3.3.3 `agent-registry.controller.ts` root route: `/admin/agents/...`
  - [ ] 3.3.4 `database-admin.controller.ts` root route: `/admin/database/...`
  - [ ] 3.3.5 `system-config.controller.ts` root route: `/admin/system/...`
  - [ ] 3.3.6 `crawler.controller.ts` root route: `/admin/crawler/...`
  - [ ] 3.3.7 `claude-pane.controller.ts` root route: `/admin/claude-pane/...`
  Store the concrete GET path under each sub-step for reuse in Phase 5.
- [ ] 3.4 Do NOT touch `apps/admin/api/src/health/health.controller.ts`. No `@UseGuards`, no `@Public()` — it stays plainly unguarded.
- [ ] 3.5 For each of the 7 protected controllers, add imports + class-level decorators. The import pattern:
  ```ts
  import { UseGuards } from '@nestjs/common';
  import { JwtAuthGuard, RbacGuard, RequirePermission } from '../auth';
  ```
  The decorator pattern (stacked above the existing `@Controller(...)`):
  ```ts
  @Controller('...')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('<permission>')
  @ApiBearerAuth('JWT-auth')   // existing — keep it
  export class XController { ... }
  ```
  - [ ] 3.5.1 `llm-analytics/llm-analytics.controller.ts` → `llm:admin`
  - [ ] 3.5.2 `rag-management/rag-management.controller.ts` → `rag:admin`
  - [ ] 3.5.3 `agent-registry/agent-registry.controller.ts` → `agents:admin`
  - [ ] 3.5.4 `database-admin/database-admin.controller.ts` → `admin:settings`
  - [ ] 3.5.5 `system-config/system-config.controller.ts` → `admin:settings`
  - [ ] 3.5.6 `crawler/crawler.controller.ts` → `admin:settings`
  - [ ] 3.5.7 `claude-pane/claude-pane.controller.ts` → **PERMISSION_TBD** (fill from step 3.1)
- [ ] 3.6 Remove the inline bearer-token check from `system-config.controller.ts`. Also remove any imports that become unused after the removal (check `UnauthorizedException`, `@Req() req: Request`, `express.Request` type). Run `cd apps/admin/api && npm run build` to confirm no unused-symbol errors.
- [ ] 3.7 Grep-verify scope:
  - [ ] `grep -rn "@UseGuards(JwtAuthGuard, RbacGuard)" apps/admin/api/src --include="*.ts"` → exactly **7** hits
  - [ ] `grep -rn "@UseGuards" apps/admin/api/src/health --include="*.ts"` → **0** hits
  - [ ] `grep -rn "startsWith('Bearer ')" apps/admin/api/src --include="*.ts"` → **0** hits
  - [ ] `grep -rn "@RequirePermission" apps/admin/api/src --include="*.ts"` → exactly **7** hits

### Quality Gate
- [ ] **Lint**: `cd apps/admin/api && npm run lint` — no new errors on touched controllers
- [ ] **Build**: `cd apps/admin/api && npm run build` — compiles clean (catches import path issues, missing module registrations, unused-symbol errors from step 3.6)
- [ ] **Unit Tests**: **Intentionally NOT run yet.** Phase 4 is the test-fix phase. Running tests now is expected to fail because specs don't yet stub the guards.
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A — Phase 5 does the full curl matrix
- [ ] **Chrome Tests**: N/A
- [ ] **Phase Review**:
  - [ ] 7 controllers guarded, 1 (health) open
  - [ ] System-config inline check removed, unused imports cleaned up
  - [ ] Claude-pane permission decided and step 3.5.7 updated with the real value
  - [ ] Admin API compiles clean
  - [ ] Root routes for each protected controller recorded in 3.3.* for Phase 5 reuse

---

## Phase 4: Update admin-api controller specs + shared mock helper
**Status**: Not Started
**Objective**: Fix every admin-api controller spec that mounts a controller so it stubs `JwtAuthGuard` + `RbacGuard` + `AuthClient` via Nest's `.overrideGuard()` / `.overrideProvider()`. Add a reusable helper at `apps/admin/api/src/test-utils/mock-guards.ts`. Add one 401 test and one 403 test per controller to lock in the guard stack.

### Steps
- [ ] 4.1 Enumerate every admin-api controller spec: `find apps/admin/api/src -name "*.controller.spec.ts"`. Record the list. Expected: 7 files (one per protected controller) + `health.controller.spec.ts` (skipped).
- [ ] 4.2 Create `apps/admin/api/src/test-utils/mock-guards.ts`:
  ```ts
  import { TestingModuleBuilder } from '@nestjs/testing';
  import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
  import { JwtAuthGuard, RbacGuard, AuthClient, type AuthorizeResult } from '../auth';

  export const defaultAuthorizeResult: AuthorizeResult = {
    allowed: true,
    userId: 'test-user-id',
    email: 'test@example.com',
    orgSlug: '*',
    orgId: null,
    roles: ['admin'],
    permission: 'admin:settings',
  };

  export const mockJwtAuthGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };
  export const mockRbacGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };
  export const mockAuthClient = {
    authorize: jest.fn().mockResolvedValue(defaultAuthorizeResult),
  };

  export function resetAuthMocks(): void {
    mockJwtAuthGuard.canActivate.mockReset().mockReturnValue(true);
    mockRbacGuard.canActivate.mockReset().mockReturnValue(true);
    mockAuthClient.authorize.mockReset().mockResolvedValue(defaultAuthorizeResult);
  }

  export function applyAuthOverrides(
    builder: TestingModuleBuilder,
  ): TestingModuleBuilder {
    return builder
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RbacGuard)
      .useValue(mockRbacGuard)
      .overrideProvider(AuthClient)
      .useValue(mockAuthClient);
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
- [ ] 4.3 For each controller spec file, update the `Test.createTestingModule(...).compile()` chain:
  - Import `applyAuthOverrides`, `resetAuthMocks`, `makeJwtGuardReject`, `makeRbacGuardReject` from `../test-utils/mock-guards`
  - Call `resetAuthMocks()` in `beforeEach`
  - Pipe the builder through `applyAuthOverrides()` before `.compile()`
- [ ] 4.4 For each protected controller spec, add a `describe('guard stack', ...)` block at the end:
  ```ts
  describe('guard stack', () => {
    it('returns 401 when JwtAuthGuard rejects', async () => {
      makeJwtGuardReject();
      const res = await request(app.getHttpServer())
        .get('<real root GET path from Phase 3 step 3.3.*>')
        .set('Authorization', 'Bearer anything');
      expect(res.status).toBe(401);
    });

    it('returns 403 when RbacGuard rejects', async () => {
      makeRbacGuardReject();
      const res = await request(app.getHttpServer())
        .get('<real root GET path from Phase 3 step 3.3.*>')
        .set('Authorization', 'Bearer anything');
      expect(res.status).toBe(403);
    });
  });
  ```
  If the existing spec uses pure unit-shaped tests (direct controller method calls, no `app.getHttpServer()`), use the closest equivalent: instantiate the guard manually with the mocked reflector/auth-client and assert that `canActivate` throws. Match the style of whichever pattern the existing spec already uses — do not introduce supertest if the file doesn't already use it.
- [ ] 4.5 Do NOT touch `*.service.spec.ts` files — they don't mount controllers and don't interact with guards.
- [ ] 4.6 Do NOT touch `health/health.controller.spec.ts` — health has no guards.
- [ ] 4.7 Run `cd apps/admin/api && npm run test` and iterate until every spec is green. Expected failure modes during iteration:
  - Missing `RbacService` provider (since the override is by guard class, but the guard constructor depends on injected services — use `.overrideGuard()` not `.overrideProvider()` for guards specifically)
  - Missing import path (wrong `../auth` relative path from deeply nested spec files)
  - `AuthClient` constructor throws because `AUTH_API_URL` isn't set in the jest environment — mitigation: the `.overrideProvider(AuthClient).useValue(mockAuthClient)` bypasses the real constructor, but if Nest instantiates it before override, the fix is to set `process.env['AUTH_API_URL'] = 'http://localhost:5100'` in `jest.setup.ts` or at the top of each spec. Add to `apps/admin/api/jest.config.js` `setupFiles` if easier.

### Quality Gate
- [ ] **Lint**: `cd apps/admin/api && npm run lint` — clean
- [ ] **Build**: `cd apps/admin/api && npm run build` — clean
- [ ] **Unit Tests**:
  - [ ] `cd apps/admin/api && npm run test` — every spec passes, including the new 401/403 blocks for all 7 protected controllers
  - [ ] `cd apps/admin/web && npm run test` — unchanged (no web work this phase, should still be green)
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A — Phase 5
- [ ] **Chrome Tests**: N/A — Phase 5
- [ ] **Phase Review**:
  - [ ] `mock-guards.ts` helper exists with all exports in step 4.2
  - [ ] Every admin-api controller spec imports from the helper (grep: `grep -rn "test-utils/mock-guards" apps/admin/api/src --include="*.spec.ts"` → at least 7 hits)
  - [ ] Every protected controller has 401 + 403 coverage
  - [ ] No spec file has inline guard bypass logic — everything goes through the helper

---

## Phase 5: Live verification — curl matrix + Chrome smoke
**Status**: Not Started
**Objective**: Run the full HTTP-level verification against the running local stack, confirming each success criterion from PRD §2. Also verify no-fallback behavior by simulating auth-api down.

### Steps
- [ ] 5.1 Restart admin-api and auth-api dev servers so both pick up the new code. Leave admin-web alone (no changes). Forge-api is not in scope.
- [ ] 5.2 Confirm all three services listening: `lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep -E "node.*:(5100|5101|5150)"` — expect one line per port.
- [ ] 5.3 Obtain a fresh demo-user JWT:
  ```
  TOKEN=$(curl -sS -X POST http://localhost:5100/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"demo-user@orchestratorai.io","password":"DEMOUSER123!"}' | jq -r .accessToken)
  echo "Token: ${TOKEN:0:30}..."
  ```
- [ ] 5.4 **Unauth curl matrix** — every protected endpoint must return 401. Use the concrete root GET paths recorded in Phase 3 step 3.3.*:
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150/admin/llm/usage/list` → **401**
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150<rag root>` → **401**
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150<agents root>` → **401**
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150<database-admin root>` → **401**
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150<system-config root>` → **401**
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150<crawler root>` → **401**
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150<claude-pane root>` → **401**
- [ ] 5.5 **Garbage-token curl** — at least one protected endpoint must return 401:
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer invalid-garbage-token" http://localhost:5150/admin/llm/usage/list` → **401**
- [ ] 5.6 **Health curl** — must still return 200 without any header:
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5150/health` → **200**
- [ ] 5.7 **Demo-user curl matrix** — every protected endpoint must return 200 with real data:
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://localhost:5150/admin/llm/usage/list?limit=3"` → **200**
  - [ ] Repeat for the other 6 controllers using the concrete GET paths from 3.3.*. Each must return 200.
- [ ] 5.8 **Auth-api-down simulation** — verify no-fallback behavior:
  - [ ] Stop auth-api (or set `AUTH_API_URL=http://localhost:59999` in admin-api's env and restart admin-api)
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:5150/admin/llm/usage/list` → **503** (NOT 200, NOT 401)
  - [ ] Restore `AUTH_API_URL=http://localhost:5100` and restart admin-api
  - [ ] `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:5150/admin/llm/usage/list` → **200** (confirmed recovery)
- [ ] 5.9 **Low-permission 403 test** (stretch): create a minimal test user via Supabase, or use an existing low-privilege user if one exists, and confirm a protected endpoint returns 403. If non-trivial, document as a manual follow-up and skip — unit tests in Phase 4 already cover the 403 path via the mocked guard.
- [ ] 5.10 **Chrome smoke test** — admin web still works identically:
  - [ ] `mcp__claude-in-chrome__tabs_context_mcp` — get current tab context
  - [ ] `mcp__claude-in-chrome__tabs_create_mcp` → new tab at `http://localhost:5101/login`
  - [ ] Log in as demo-user via form (JS-based form fill + click pattern from Phase 4.5 live verification — placeholder values to avoid leaking credentials into logs)
  - [ ] Navigate to `http://localhost:5101/app/admin/llm/usage`
  - [ ] Confirm the Detailed Usage Log table renders with rows containing workflow + node columns (e.g. `select-tables`, `respond`, `legal-department:synthesis`)
  - [ ] Toggle the "With Reasoning" filter; confirm the list shrinks to reasoning-only rows
  - [ ] Expand a reasoning row (click ▼); confirm `thinkingContent` renders inside the monospace `<pre>` element
- [ ] 5.11 **Latency spot-check**:
  - [ ] `for i in 1 2 3 4 5; do time curl -s -o /dev/null -H "Authorization: Bearer $TOKEN" http://localhost:5150/admin/llm/usage/list; done`
  - [ ] Record the median real time. Target: <100ms total. Flag as follow-up if consistently >500ms (do NOT block on this).

### Quality Gate
- [ ] **Lint**: N/A (no code edits this phase — code-edit gates were covered in Phases 1–4)
- [ ] **Build**: N/A (no code edits)
- [ ] **Unit Tests**: N/A (covered in Phase 4)
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**:
  - [ ] All 7 unauth curls returned 401
  - [ ] Garbage-token curl returned 401
  - [ ] `/health` returned 200 without auth
  - [ ] All 7 demo-user curls returned 200 with real data
  - [ ] Auth-api-down simulation returned 503 (no silent fallback), recovered to 200 after restore
  - [ ] Latency within acceptable range (<100ms p50 target; <500ms hard ceiling or flagged as follow-up)
- [ ] **Chrome Tests**:
  - [ ] Login succeeds
  - [ ] LLM Usage page renders with filters + detail table
  - [ ] Reasoning row expansion lazy-loads `thinkingContent`
- [ ] **Phase Review**:
  - [ ] Every PRD §2 success criterion empirically verified
  - [ ] Any deviations or unexpected behaviors documented
  - [ ] If the 403 low-permission test was skipped, documented as a manual follow-up

---

## Phase 6: Cleanup + completion report + PR
**Status**: Not Started
**Objective**: Final hygiene sweep, write `completion-report.md`, commit, push, open PR, merge, archive the effort.

### Steps
- [ ] 6.1 Grep-verify boundaries one more time:
  - [ ] `grep -rn "from.*@orchestratorai/planes" apps/admin/api/src/auth --include="*.ts"` → **0** hits
  - [ ] `grep -rn "from.*apps/auth/api" apps/admin/api/src --include="*.ts"` → **0** hits
  - [ ] `grep -rn "from.*@orchestratorai/planes" apps/auth/api/src --include="*.ts"` → **0** hits
  - [ ] `grep -rn "class JwtAuthGuard" apps/admin/api/src --include="*.ts"` → **1** hit (the local one at `src/auth/jwt-auth.guard.ts`)
  - [ ] `grep -rn "class RbacGuard" apps/admin/api/src --include="*.ts"` → **1** hit (the local one at `src/auth/rbac.guard.ts`)
  - [ ] `grep -rn "startsWith('Bearer ')" apps/admin/api/src --include="*.ts"` → **0** hits
- [ ] 6.2 Verify no untouched-files got touched:
  - [ ] `git diff --name-only main...HEAD -- packages/planes/rbac packages/planes/auth/guards/jwt-auth.guard.ts apps/auth/api/src/rbac apps/auth/api/src/auth/guards` → only expected changes (the auth.controller.ts for the new endpoint, the DTO file, and any module wiring needed to expose RbacService to AuthController — zero modifications to guard implementations or to `packages/planes/rbac/`, zero modifications to `packages/planes/auth/guards/jwt-auth.guard.ts`)
- [ ] 6.3 Run the full repo gates one last time:
  - [ ] `npm run lint` — no new errors on touched files (pre-existing unrelated failures in bridge-web/pulse-api are OK; document in completion report)
  - [ ] `npm run build` — clean
  - [ ] `npm run test` — all pass. Pre-existing unrelated failures (bridge-api a2a-router, planes database-contract ENOTFOUND, pulse-api/bridge-web lint) are OK and must be documented as pre-existing in the completion report.
- [ ] 6.4 Write `docs/efforts/current/completion-report.md` with:
  - Summary of what shipped (one paragraph)
  - Phase-by-phase gate results (table: Phase | Status | Notable decisions | Issues encountered)
  - Final permission mapping table (all 7 controllers, claude-pane with the actual chosen value)
  - Deviations from the PRD (if any) with reasoning
  - Latency measurements from Phase 5.11
  - Whether a low-permission 403 test user was created (and if not, why deferred)
  - **Explicit no-fallback verification**: the auth-api-down simulation result (Phase 5.8) — prove that admin-api fails loud when auth-api is unreachable
  - Follow-ups:
    - Forge/Compose/Pulse/Bridge have the same gap — each needs an equivalent effort, copying the admin-api `src/auth/` folder as the reference pattern
    - Once a second consumer lands, extract `src/auth/` into a shared `packages/auth-client/` package
    - If latency was flagged as a concern, a short-TTL LRU cache in `AuthClient` keyed by `{token-hash, permission, orgSlug}` is the obvious next step
- [ ] 6.5 Review commit history on the branch: `git log main..HEAD --oneline`. If messy, optionally squash into logical chunks matching the 6 phases. If already clean, skip.
- [ ] 6.6 `git push -u origin effort/admin-auth-hardening`
- [ ] 6.7 Open a PR via `gh pr create` with a body covering:
  - The 6 phases and what each delivered
  - The curl matrix results
  - The no-fallback design (explicitly called out so reviewers understand the 503-on-auth-down behavior is intentional)
  - A note that this PR is the reference pattern for future forge/compose/pulse/bridge efforts
- [ ] 6.8 Run `/pr-eval` on the new PR. Fix any issues surfaced, re-run the gates in 6.3, push fixes.
- [ ] 6.9 Merge to main via the standard merge process.
- [ ] 6.10 Archive the effort directory:
  ```
  mkdir -p docs/efforts/admin-auth-hardening
  git mv docs/efforts/current/intention.md docs/efforts/admin-auth-hardening/intention.md
  git mv docs/efforts/current/prd.md docs/efforts/admin-auth-hardening/prd.md
  git mv docs/efforts/current/plan.md docs/efforts/admin-auth-hardening/plan.md
  git mv docs/efforts/current/completion-report.md docs/efforts/admin-auth-hardening/completion-report.md
  git commit -m "chore(efforts): archive admin-auth-hardening"
  git push origin main
  ```
- [ ] 6.11 Create an email draft in Gmail notifying completion (matching the pattern from Phase 4.5). **Draft only — do NOT send.** Use `gmail_get_profile` + `gmail_create_draft`.

### Quality Gate
- [ ] **Lint**: `npm run lint` — no new issues
- [ ] **Build**: `npm run build` — clean
- [ ] **Unit Tests**: `npm run test` — all pre-existing green tests still green
- [ ] **E2E Tests**: N/A
- [ ] **Curl Tests**: N/A (covered in Phase 5)
- [ ] **Chrome Tests**: N/A (covered in Phase 5)
- [ ] **Phase Review**:
  - [ ] All grep-verified boundaries hold (step 6.1)
  - [ ] No untouched files got touched (step 6.2)
  - [ ] Completion report written and accurate
  - [ ] PR opened, reviewed, merged, effort archived
  - [ ] Email draft created (not sent)
