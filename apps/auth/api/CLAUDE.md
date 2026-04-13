# Auth (Standalone Auth Service)

## Why This Product Exists

Auth exists because **identity and access control must be centralized**. When auth logic was scattered across products, each product had its own user management, its own token validation, and its own permission checks — leading to inconsistencies and security gaps. Auth solves this by being the single source of truth for "who can access what."

Every product delegates to Auth. No product manages users, orgs, or permissions itself.

## Core Architectural Philosophy

### Single Source of Truth

Auth is the canonical owner of the identity layer:
- **Users** — who exists, what roles they have
- **Organizations** — what orgs exist, their settings
- **Teams** — team structure within orgs
- **Roles & Permissions** — RBAC definitions
- **Entitlements** — which products each org can access
- **JWT Tokens** — issuance, validation, refresh

### Other Products Are Consumers

Every other product calls Auth API to:
1. Validate incoming JWT tokens
2. Check permissions for specific actions
3. Read user/org data
4. Check entitlements

No other product writes to auth tables. Ever.

### Request Validation

Auth uses `isA2AInvokeRequest` from `@orchestratorai/transport-types` for validating inbound invoke requests. This is the standard validation guard shared across products.

### Minimal Dependencies

Auth is deliberately lightweight. It does NOT import:
- **LLM plane** — Auth never calls an LLM
- **Observability plane** — Auth logs locally; no cross-product telemetry
- **LangGraph** — no workflow engines
- **Agent code** — no runners, no processors
- **Other products' source** — no imports from `apps/forge`, `apps/compose`, `apps/pulse`, `apps/bridge`, `apps/admin`

Auth DOES use:
- `@orchestratorai/planes/database` — via the existing `src/database/` re-export shim, so `DATABASE_SERVICE` resolves to a plane-level implementation (Supabase locally, swappable for cloud deployments). This is a pure storage abstraction — no LLM, no observability, no cross-cutting product logic.
- `@orchestratorai/planes/auth` — for `SupabaseIdentityProvider`, `SupabaseAuthService`, and provider interfaces. The heavy auth lifting (token validation, Supabase admin client) lives in planes so non-auth products could theoretically use it, but in practice only auth-api does.

The rule to remember: **Auth owns the identity layer and writes to `auth.*` / `authz.*` tables; other products call Auth over HTTP.** The planes imports above are implementation details of how Auth talks to its own storage, not leakage across the product boundary.

## Port Assignments

- API: 6100 (dev) / 7100 (prod)
- No web UI — Admin Web (port 6101) provides the UI

## Architecture

```
apps/auth/api/src/
  auth/              ← Login, logout, token refresh, JWT issuance/validation
  organizations/     ← Org CRUD, org settings, sector/sector_id
  users/             ← User management within orgs
  roles/             ← RBAC role definitions
  permissions/       ← Permission checks
  entitlements/      ← Product access per org
  common/
    guards/
      validation.guard.ts  ← Uses isA2AInvokeRequest for request validation
```

## What Does NOT Belong Here

- **Agent logic** of any kind — Forge, Compose, or Pulse
- **Processing logic** — Pulse
- **Dashboard code** — Forge
- **External A2A** — Bridge
- **LLM calls** — Auth never calls an LLM

## Key Rules

- Auth is the ONLY service that writes to users/orgs/roles tables
- JWT tokens include: userId, orgSlug, orgId, roles, entitlements
- Token refresh is required (short-lived access token, long-lived refresh token)

## Dependencies

- `@orchestratorai/transport-types` — shared type definitions, isA2AInvokeRequest
- Supabase (REST 6010, Postgres 6011) — persistent storage for users, orgs, roles, entitlements
