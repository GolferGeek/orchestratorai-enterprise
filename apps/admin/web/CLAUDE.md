# Admin (Admin Web UI)

## Why This Product Exists

Admin exists because **system configuration is a distinct concern from agent operations**. Managing users, organizations, roles, and entitlements should not require navigating agent dashboards or processing code. Admin is a clean UI that talks exclusively to Auth API.

## Core Architectural Philosophy

### Auth API Is the Only Backend

Admin never calls the database directly. Every operation goes through Auth API:

```
Admin UI action → Pinia store → auth-api.service.ts → Auth API (port 6100) → Supabase
```

If you need data that Auth API doesn't expose, add an endpoint to Auth API — don't add a direct database call to Admin.

### Manage What Auth Exposes

Admin manages exactly what Auth provides:
- Organizations (create, edit, delete)
- Users (invite, update roles, deactivate)
- Roles & Permissions (RBAC configuration)
- Entitlements (which products each org can access)

Nothing else.

## Port Assignments

- Web: 6101 (dev) / 7101 (prod)
- No API — Admin calls Auth API (port 6100)

## Architecture

```
apps/admin/web/src/
  views/
    orgs/               ← Organization management
    users/              ← User management
    roles/              ← Role & permission management
    entitlements/       ← Product access management
    system/             ← System configuration
  stores/
    orgs.store.ts       ← Org state
    users.store.ts      ← User state
  services/
    auth-api.service.ts ← HTTP client for Auth API (port 6100)
```

## What Does NOT Belong Here

- **Agent views** — no dashboards, no conversations
- **Direct database calls** — everything through Auth API
- **Processing logic** — Pulse
- **External A2A management** — Bridge

## Dependencies

- `@orchestratorai/transport-types` — shared types
- `@orchestratorai/ui` — shared UI component library
- Auth API (port 6100) — all data operations
