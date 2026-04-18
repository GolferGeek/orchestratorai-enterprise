# Admin Role Permission Audit

## Intent

Systematically verify that the admin role's permission grants are complete and consistent across all products. Two seed gaps have already been found and patched (agents:execute/manage in forge-auth, rag:read/write/delete in compose-auth). This effort audits the full permission hierarchy to confirm no further gaps exist.

## Background

- Auth hardening sweep (completed) added @RequirePermission guards to 77 controllers across 5 API products.
- Each product has its own seed migrations that define what permissions admin/manager/member roles receive.
- Two gaps surfaced during hardening: forge-api needed agents:execute and agents:manage; compose-api needed rag:read, rag:write, and rag:delete.
- The fix pattern is a new Supabase migration that inserts the missing rows into the role_permissions seed table.
- A full audit has not been done — only gaps surfaced by failing requests have been patched reactively.

## Scope

1. Enumerate all @RequirePermission decorators across all 5 API products (admin, auth, forge, compose, pulse).
2. Enumerate all permissions currently seeded for admin/manager/member in the database migrations.
3. Diff the two sets — identify any permission required by a guard that is not seeded for admin.
4. Verify hierarchy consistency: admin ≥ manager ≥ member (admin has every permission manager has, manager has every permission member has).
5. Write migrations for any gaps found.
6. Verify with a logged-in admin user that previously failing endpoints now return 200.

## Out of Scope

- Changing which permissions are required by which controllers (that's a separate access design effort).
- Adding new roles or restructuring the permission model.
- Bridge — Bridge uses JwtAuthGuard only (no RBAC), intentionally, as an A2A gateway.
