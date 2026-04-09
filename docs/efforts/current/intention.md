# Admin API Auth Hardening

## Why this effort exists

During post-merge live verification of Phase 4.5 (Reasoning Capture), I ran an unauthenticated curl against one of the new admin endpoints expecting a 401 and got a **200** back with real data. The endpoint had `@ApiBearerAuth('JWT-auth')` decoration but no actual guard.

Investigating further, **every admin-api controller** has the same gap:

- `llm-analytics` — `@ApiBearerAuth('JWT-auth')`, no `@UseGuards`
- `rag-management` — same
- `agent-registry` — same
- `database-admin` — same
- `claude-pane` — bearer auth in description only
- `system-config` — ad hoc inline `if (!authHeader.startsWith('Bearer '))` check, no shared guard, no permission check
- `crawler`, `database`, `health` — unguarded

**Zero `@UseGuards` decorators exist anywhere in `apps/admin/api/src`.** Every admin endpoint can be hit without a token, and any token that looks vaguely like a JWT is accepted without validation. The Swagger UI shows a lock icon next to every route but it's decorative — it does not enforce anything at runtime.

This was never surfaced before because the admin web app always sends a valid bearer token, and nobody was curl-ing the API directly. Phase 4.5's live testing was the first time an unauthenticated request was sent, and it exposed the gap across the entire product.

## What must change

The admin product must enforce authentication and RBAC permissions on every endpoint that reads or mutates sensitive state. Concretely:

1. **Unauthenticated requests return 401.** No token, invalid token, expired token → 401 with a clear error message.
2. **Authenticated requests from users without sufficient permissions return 403.** The permission check must use the existing RBAC system we already have in Auth API — no new permission model.
3. **Authenticated requests from users with sufficient permissions return 200 with the expected data.** No regression on the happy path.
4. **Every existing admin-api controller must be guarded**, not just `llm-analytics`. The live verification only probed llm-analytics, but the gap exists across the whole product, and partial fixes create confusing "sometimes guarded, sometimes not" behavior.
5. **The enforcement must use the existing shared infrastructure** where possible:
   - `JwtAuthGuard` already exists at `packages/planes/auth/guards/jwt-auth.guard.ts` and is exported from the auth plane. Admin-api should use it, not reimplement it.
   - The Auth API already has a `RbacGuard` at `apps/auth/api/src/rbac/guards/rbac.guard.ts` and a `@RequirePermission()` decorator. Either the guard becomes shared (moved to `packages/planes/auth/guards/` or similar), or admin-api calls Auth API's permission-check endpoint per request. The choice should be deliberate — whichever option matches how other products (forge-api, compose-api) will eventually consume the same infrastructure. Admin-api is the first external consumer; the pattern we pick here becomes the template.
6. **Existing admin web functionality must continue working** without user-visible change. The demo-user account has `admin:settings`, `admin:users`, `admin:roles`, `admin:audit`, `llm:admin`, `rag:admin`, `agents:admin`, and more — that's enough to access every existing admin page. Post-hardening, the same user should still see the same pages.
7. **All admin-api unit and integration tests must keep passing.** Tests that mount controllers without a fake token will need to be updated to either provide a mock token or stub the guards, matching whatever pattern auth-api's own tests use.

## Permission mapping (proposed, subject to review during PRD)

The per-route permission requirements should be documented explicitly. Starting point based on the existing permission catalog:

| Controller | Suggested permission |
|---|---|
| llm-analytics | `llm:admin` |
| rag-management | `rag:admin` |
| agent-registry | `agents:admin` |
| database-admin | `admin:settings` |
| system-config | `admin:settings` |
| crawler | `admin:settings` |
| database | `admin:settings` |
| claude-pane | TBD — check what this endpoint actually does |
| health | unauthenticated OK (it's a liveness probe) |

The PRD phase should confirm these assignments against the real permission catalog in `authz.rbac_permissions` and against what each controller actually does. `health` should stay open.

## Constraints and non-goals

- **This effort does not touch Auth API.** The Auth service already knows how to validate tokens and check permissions. We are consuming its existing primitives, not rebuilding them.
- **This effort does not change the token shape or the login flow.** Admin web continues logging in through Auth API exactly as it does today. Only the admin-api request-validation layer changes.
- **This effort does not add role gating to forge-api, compose-api, pulse-api, or bridge-api.** Those products likely have the same gap but fixing them is scope creep. The patterns we establish here should be reusable by those products in future efforts.
- **This effort does not introduce a new permission model.** We use the existing `authz.rbac_permissions` / `rbac_role_permissions` / `rbac_user_org_roles` schema that's already populated for demo-user, golfergeek, justin, josh, nick.
- **This effort does not redesign Swagger auth.** The existing `@ApiBearerAuth('JWT-auth')` metadata stays — it just gets paired with actual runtime enforcement.
- **No new planes, no new observability, no new shared packages** beyond possibly promoting `RbacGuard` into `packages/planes/auth/` if the PRD picks that path.

## Success criteria

After this effort ships:

- `curl http://localhost:5150/admin/llm/usage/list` (no token) returns **401**
- `curl -H "Authorization: Bearer <garbage>"` returns **401**
- `curl -H "Authorization: Bearer <valid-but-low-permission-token>" ...` returns **403** on any admin endpoint except `/health`
- `curl -H "Authorization: Bearer <demo-user-token>" ...` returns **200** and real data on every admin page/endpoint
- Admin web smoke test (login → LLM Usage page → filter → expand row → reasoning content) still works identically
- All admin-api jest tests pass, all admin-web vitest tests pass, full build clean
- No new `@ts-ignore`, no fallbacks, no swallowed errors, no security theater

## Open questions for the PRD phase

1. **Guard sharing vs. remote call.** Should `RbacGuard` move from `apps/auth/api/src/rbac/guards/` into `packages/planes/auth/guards/` so admin-api can import it directly and check permissions locally? Or should admin-api call Auth API's permission-check endpoint per request, keeping the authz decision in one place but adding network latency? The answer affects blast radius and future product integration.
2. **Per-controller vs. global guard.** Apply guards at the controller level (one decorator per controller) or at the app level via `app.useGlobalGuards()`? Global is simpler but requires a per-route opt-out for `health`. Per-controller is more explicit but more boilerplate.
3. **Test strategy.** Auth-api tests presumably stub `JwtAuthGuard` in their controller specs. Admin-api will need the same stub pattern. Does it need a reusable test helper, or is inline mocking fine?
4. **Health endpoint scope.** Does it need any protection (rate limit, CIDR allow-list) or is fully open correct for an internal dev/prod environment?
5. **Backwards compatibility with the existing system-config inline check.** Should the inline check stay as a belt-and-suspenders defense, be removed entirely once the guard is in place, or be migrated into the shared guard pattern?
6. **Token extraction pattern.** `JwtAuthGuard` in the auth plane — how does it get the JWT secret / validation config? Does admin-api need to pass a config, or is the plane self-contained? Confirm during PRD.

## Evidence of the gap (captured during Phase 4.5 live verification)

```
$ curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5150/admin/llm/usage/list?hasReasoning=true&limit=3"
500     # (500 because of an unrelated column issue; the request reached the handler)

$ curl -sS "http://localhost:5150/admin/llm/usage/list?hasReasoning=true&limit=3" | head -c 200
[{"id":"88cd3f3b-da00-4e22-952e-2becc11c5960", ...  # (after column fix: 200 OK with no auth header)
```

After the underlying column bug was fixed, the same unauthenticated curl returned **200 with real PII-adjacent data** including user conversation IDs, agent names, token counts, and (on the sibling `/reasoning` endpoint) full multi-paragraph LLM reasoning output. This is the single most important failure mode to close.
