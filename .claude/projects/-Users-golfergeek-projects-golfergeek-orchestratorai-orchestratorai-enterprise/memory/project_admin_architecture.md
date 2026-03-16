---
name: Admin Architecture Decision (Option B)
description: Admin product gets its own API (6150) as an admin gateway that aggregates non-auth data from product APIs. Admin Web (6101) calls Auth API + Admin API only.
type: project
---

Admin architecture decided on 2026-03-14: Option B.

**Auth API** (6100) — auth only (login, logout, tokens, validate, entitlements, orgs, users, roles). Every product calls it.

**Admin API** (6150) — NEW. Aggregates non-auth admin data from product APIs. Single admin gateway so Admin Web doesn't need to know every product's port. Covers:
- LLM usage analytics (calls Forge/Compose APIs)
- RAG collection management (calls Compose API)
- Agent registry/config (calls Forge/Compose APIs)
- Observability dashboards (calls product APIs)
- PII management
- Evaluation management
- System configuration
- System health (pings all product health endpoints)

**Admin Web** (6101) — calls Auth API (6100) for auth admin + Admin API (6150) for platform admin. Single unified admin UI.

**Why:** Admin Web only talks to 2 APIs instead of 7. Admin API becomes the single admin gateway — the frontend never needs to know that LLM data comes from Forge vs Compose. Cleaner than Option A (no Admin API, Web calls all products directly) and simpler than Option C (separate auth admin and platform admin apps).

**Port block**: Auth and Admin share the 61xx block:
- 6100: Auth API
- 6101: Admin Web
- 6150: Admin API
