# Org admins and the enterprise admin screens

**Decided:** 2026-10-15, by Matt. **Status:** accepted while enterprise is frozen (v3).

## What happens

The RBAC fix (`a8fef331`) makes "every organization" (`x-organization-slug: *`)
a super-admin's only. Some admin screens in the web app (user management,
settings, privacy, MCP, platform admin) always ask the API for every
organization, so an admin of a single organization gets "permission denied"
(403) on them. Super-admins and the demo login are not affected.

## Decision

Leave it. Those screens are for super-admins while enterprise is frozen. The
code is unchanged; the API is right to refuse.

## If it is reopened

The fix is in the web app, not the API: have those screens send the
organization the user is working in instead of `*`. Do not loosen the API
check.
