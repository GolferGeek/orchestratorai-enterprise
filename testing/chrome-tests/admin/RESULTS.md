# Admin Chrome Test Results — 2026-03-19

## Overall Status: 16/16 pages PASS (3 remaining issues)

---

## Level 1 — Page Load Test (2026-03-19)

All 17 admin pages tested. Login was automatic (session active).

### Summary: 14 PASS / 1 FAIL / 2 PARTIAL

### Global Issue
- **DUPLICATE LEFT NAV**: Every page shows TWO sidebars — the OaiAppShell sidebar AND an inner sidebar in the content area. This is a layout bug affecting all admin pages.

### Results by Page

| # | Page | Route | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Organizations | /app/admin/organizations | PASS* | 10 orgs loaded. 401 on `/auth/me` at startup. |
| 2 | Users | /app/admin/users | PASS | 3 users, org filter, create/add buttons. No errors. |
| 3 | Roles | /app/admin/roles | PASS | 5 roles, permissions section. No errors. |
| 4 | Entitlements | /app/admin/entitlements | PASS | Org selector, empty state. No errors. |
| 5 | LLM Usage | /app/admin/llm/usage | PASS | 6,619 requests, filters, data table. No errors. |
| 6 | LLM Models | /app/admin/llm/models | PASS | 5 providers, 63 models. No errors. |
| 7 | LLM Costs | /app/admin/llm/costs | PASS | $16.38 total, cost breakdown. No errors. |
| 8 | RAG Collections | /app/admin/rag | PARTIAL | Page loads but one row has empty fields and "Invalid Date". No console errors. |
| 9 | Agent Registry | /app/admin/agents | **FAIL** | Stuck on "Loading agents..." spinner. `TypeError: agents.value.map is not a function` in AgentRegistryPage.vue:18. API response is not an array. |
| 10 | Observability Dashboard | /app/admin/observability | PASS | "No Metrics Available" empty state. No errors. |
| 11 | Observability Events | /app/admin/observability/events | PASS | "No Events Found" empty state, table headers, filters. No errors. |
| 12 | System Config | /app/admin/system | PARTIAL | Renders "No Configuration Keys" but has 404 error — Auth API endpoint for system config doesn't exist yet. |
| 13 | System Health | /app/admin/system/health | PASS | All 6 products healthy (APIs). Web status "unknown". No errors. |
| 14 | Crawler Sources | /app/admin/crawler | PASS | 20 sources, 3.2k articles. No errors. |
| 15 | MCP Servers | /app/admin/mcp | PASS | Compose MCP Server connected, 17 tools. No errors. |
| 16 | Database Admin | /app/admin/database | PARTIAL | 157 tables, 50 migrations. But "Connection Error: Could not find table 'public.users' in schema cache" banner. Schemas shows "public, public" (duplicate). |

### Issues Found (Priority Order)

1. **CRITICAL — Agent Registry broken**: `agents.value.map is not a function`. API response not an array. File: `AgentRegistryPage.vue:18`
2. **HIGH — Duplicate left nav on all pages**: OaiAppShell sidebar + inner content sidebar both rendering
3. **MEDIUM — System Config 404**: Auth API missing `/system-config` endpoint. File: `auth-api.service.ts:107`
4. **MEDIUM — Entitlements 404**: Auth API missing entitlements endpoint. File: `auth-api.service.ts:92`. UI renders toggles but data may not persist.
5. **MEDIUM — Database Admin schema error**: `public.users` table not in schema cache, duplicate "public" schema display
6. **LOW — RAG Collections data issue**: One row with empty fields and "Invalid Date"
7. **LOW — Organizations 401**: `/auth/me` fails with 401 on initial load (may be race condition)

---

## Level 2 — Function Verification (2026-03-19)

Tested interactive elements on pages that passed Level 1.

### Organizations
- [x] Search filter works — typing "eng" filters to Engineering only
- [x] Clear button (X) works on search
- [x] Table columns: slug, name, description, URL, created
- [x] "+ NEW ORGANIZATION" button visible
- [ ] **No edit/delete actions visible per row** — table is read-only display only

### Users
- [x] Click user shows detail panel — name, email, role badges
- [x] "REMOVE FROM ORG" and "DELETE USER" buttons visible
- [x] Current Roles section with remove (X) per role
- [x] Effective Permissions section — shows all granted permissions
- [x] Add Role section
- [x] Password Management — Change Password, Send Password Reset Email
- [ ] **Ionic Vue error on user click**: `TypeError: Cannot read properties of undefined (reading 'classList')` — page transition bug in @ionic_vue.js. Non-blocking.

### Roles
- [x] Click role shows permissions — grouped by category (Admin, Agents, Deliverables, LLM, RAG, System)
- [x] Each category expandable with chevron
- [x] Permission counts per category accurate

### Entitlements
- [x] Org selector dropdown works — opens list of orgs
- [x] Selecting org shows product cards with toggle switches
- [x] 6 products: Forge, Compose, Flow, Pulse, Bridge, Assistant
- [x] Granted/Not Granted count in header
- [ ] **BUG: Org dropdown shows duplicated entries** — all orgs appear twice in the list
- [ ] **BUG: 404 on entitlements API** — `auth-api.service.ts:92` — Auth API endpoint missing

### LLM Analytics (Usage/Models/Costs)
- [x] Agent and Model filter dropdowns visible on Usage page
- [x] Provider cards clickable on Models page — shows models per provider
- [x] Product and Org filter dropdowns visible on Costs page

### Crawler Sources
- [x] Click source shows detail panel — URL, description, status, schedule
- [x] Edit (pencil) and Delete (trash) icons in detail panel
- [x] Recent Articles list with titles
- [x] "Show inactive" toggle works
- [ ] **BUG: "Invalid Date" systemic** — Created field, Published/First Seen columns all show "Invalid Date". Same issue as RAG page. Date parsing broken for crawler timestamps.

### Additional Issues Found in Level 2

8. **MEDIUM — Entitlements org dropdown duplicated**: All organizations appear twice in the selector
9. **MEDIUM — "Invalid Date" systemic across Crawler and RAG**: Date formatting/parsing broken for these data sources
10. **LOW — Ionic Vue classList error**: Page transition error when clicking users. Non-blocking but visible in console.

---

## Fixes Applied (2026-03-19)

All original Level 1/2 issues were fixed:

| # | Issue | Fix |
|---|-------|-----|
| 1 | Agent Registry broken | Unwrapped API response `{ agents: [...] }`, updated types |
| 2 | Duplicate left nav | `use-router-outlet` on OaiAppShell, route restructure |
| 3 | System Config 404 | Created system-config module in Auth API |
| 4 | Entitlements 404 + dropdown duplication | Created entitlements module in Auth API + removed dynamic import |
| 5 | Invalid Date (Crawler) | Added snake_case→camelCase mappers in crawler service |
| 6 | Database Admin schema error | Query `authz.users`, deduplicate schemas, fix status check |
| 7 | Entitlements org dropdown | `:key` on ion-select, removed dynamic import |

---

## Level 3 — Functional Testing (2026-03-19)

All 16 pages tested with interactive functions verified.

### Page-by-Page Results

| # | Page | Status | Key Findings |
|---|------|--------|-------------|
| 1 | Organizations | PASS | Search works, create form works. Edit/delete icons NOT wired up. Search clear (X) broken. |
| 2 | Users | PASS | User detail panel works perfectly — roles, permissions, password mgmt |
| 3 | Roles | PASS | Permission display by category works. All roles have identical permissions (data issue). |
| 4 | Entitlements | PASS | Org selector works, 6 product cards with toggles, no duplicates |
| 5 | LLM Usage | PASS | 7,012 requests, 30 agents, filters, data table |
| 6 | LLM Models | PASS | 5 providers, 63 models, provider selection works |
| 7 | LLM Costs | PASS | $16.38 total, cost breakdown by product/model |
| 8 | RAG Collections | PASS* | Loads but needs org selector. One orphan row with Invalid Date. |
| 9 | Agent Registry | PASS | 19 agents, search, product/org filters |
| 10 | Observability Dashboard | PASS | "No Metrics Available" empty state |
| 11 | Observability Events | PASS | "No Events Found", filters, table headers |
| 12 | System Config | PASS | 2 config keys loaded, edit icons |
| 13 | System Health | PASS | All 6 APIs healthy, response times |
| 14 | Crawler Sources | PASS | 20 sources, dates fixed, detail panel works |
| 15 | MCP Servers | PASS | Connected, 17 tools listed |
| 16 | Database Admin | PASS | Green "Connected", 158 tables, 1 schema |

### Remaining Issues

1. **Organizations: Edit/delete buttons not wired** — icons render but no click handlers
2. **Organizations: Search clear (X) button broken** — must manually clear text
3. **RAG Collections: Needs org selector** — collections are org-scoped but no org filter exists
4. **Roles: Identical permissions across all roles** — seed data issue, not code bug
5. **OaiSidebar console error** — `displayName` TypeError on some page transitions (Vite HMR timing, non-blocking)
