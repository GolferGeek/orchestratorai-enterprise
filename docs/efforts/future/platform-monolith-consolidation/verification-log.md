# Platform Monolith Consolidation — Verification Log

## 2026-07-04 — Phase 1 Unified Shells

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- `npm run build:api` — passed. Nest compiled `apps/api` successfully.
- `npm run build:web` — passed after correcting the router type import. Vue type check and Vite build completed.
- `npm run dev:api` — passed. Nest dev server started with `PLATFORM_API_PORT=6000`.
- `curl -sS http://127.0.0.1:6000/health` — returned `{"status":"ok","service":"platform-api"}`.
- `npm run dev:web` — passed. Vite served the unified web shell on `http://localhost:6001/`.
- `curl -sS -I http://127.0.0.1:6001/dashboard` — returned `HTTP/1.1 200 OK`.
- `curl -sS -I http://127.0.0.1:6001/secure-conversations` — returned `HTTP/1.1 200 OK`.
- `curl -sS http://127.0.0.1:6001/api/agents` — returned `{"module":"agents","status":"placeholder"}` through the Vite proxy to the unified API.
- `npm install --package-lock-only` — passed and updated workspace lockfile metadata.

Notes:

- The shell initially used new platform ports `6000` and `6001`; no old product-port proxy or compatibility wrapper was added.
- Placeholder controllers expose target module prefixes only. No product behavior has moved yet.
- `npm install --package-lock-only` reported existing dependency audit findings; no audit remediation was part of this phase.

## 2026-07-05 — Phase 2 Auth/Shell Proof Slice

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- `npm install --package-lock-only` — passed and updated the lockfile for copied auth/web dependencies. Existing audit findings remain: 110 vulnerabilities.
- `npm run build:api` — passed. Nest compiled the unified API with copied Auth/RBAC modules.
- `npm run build:web` — passed. Vue type check and Vite build completed. Vite reported the existing large chunk warning.
- `curl -sS http://127.0.0.1:6701/api/health` — returned `{"status":"ok","service":"platform-api"}` through the unified web proxy.
- `curl -sS -I http://127.0.0.1:6701/login` — returned `HTTP/1.1 200 OK`.
- `curl -sS -I http://127.0.0.1:6701/dashboard` — returned `HTTP/1.1 200 OK`.
- `POST http://127.0.0.1:6701/api/auth/login` — returned 200 and an access token with integration credentials.
- Before hardening the copied planes auth behavior, `GET http://127.0.0.1:6701/api/auth/entitlements` returned `agents,workflows,ambient,secure-conversations,admin,rag,settings`.
- After hardening `SupabaseAuthService.resolveInternalUserId()` to propagate identity-link upsert failures, `GET http://127.0.0.1:6701/api/auth/me` and `/api/auth/entitlements` returned `401` with the API log error `Failed to upsert identity link: permission denied for schema authz`.

Environment notes:

- Root platform scripts now use `6700` for `dev:api` and `6701` for `dev:web`. Port `6000` was changed because browser clients reject it as a blocked port.
- The repo `.env` currently points Supabase at `http://gg-macstudio:6010`, which failed from this environment with `ECONNREFUSED`. Verification used an explicit temporary `ENV_FILE` pointing to the running local Supabase ports: API `127.0.0.1:54321`, DB `127.0.0.1:54322`.
- Browser-visible verification did not complete. Standalone Playwright reported a missing Chromium binary, and the in-app browser kernel timed out during localhost navigation. This is recorded as remaining Phase 2 gate work.
- During auth smoke, the API initially logged `Identity link upsert failed (non-fatal for Supabase auth): Failed to upsert identity link: permission denied for schema authz` from `packages/planes/auth/services/supabase-auth.service.ts`. The code now fails protected auth calls loudly instead of treating the identity-link write as non-fatal. The remaining issue is database/schema permission for `authz.auth_identity_links` under the configured `DATABASE_URL`.

## 2026-07-07 — Phase 2 Closure

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- `PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/migrations/20260707090000_grant_authz_schema_access.sql` — passed.
- Grant verification — `authenticated` and `service_role` both have `USAGE` on `authz`; both have table privileges on `authz.auth_identity_links`.
- `npm run build:api` — passed after removing copied auth shims and importing planes/auth plus auth-client directly.
- `npm run build:web` — passed after flattening platform route rendering and removing the copied auth-store alias.
- API smoke through `http://127.0.0.1:6701/api` — login returned 200 with an access token; `/auth/me` returned the GolferGeek user; `/auth/entitlements` returned platform capabilities including `secure-conversations`.
- In-app browser smoke — `/login` rendered Email, Password, Login; submit navigated to `/dashboard`; visible dashboard state was `Welcome, GolferGeek`, one visible shell, one visible capability nav, and cards for Agents, Workflows, Ambient, Secure Conversations, RAG, and Settings.
- In-app route smoke — clicking Secure Conversations navigated to `/secure-conversations`; the visible route rendered `Secure Conversations` with one visible shell/nav and no console warnings/errors.
- Consistency grep over `apps/api`, `apps/web`, `packages/planes/auth`, and root Supabase migration found no copied shim/non-fatal/old-port hits in the unified slice.

Notes:

- Ionic keeps previous route DOM in the outlet, but inactive cached content is zero-sized. Visible-state checks confirmed only one active shell/nav.
- Vite still reports the existing large chunk warning during web build.

## 2026-07-13 — Phase 3 Admin/RAG/Settings Route Surfaces

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- `npm run build:web` — passed. Vue type check and Vite build completed. Vite still reports the existing large chunk warning.
- `npm run build:api` — passed. Nest compiled the unified API.
- `curl -sS http://127.0.0.1:6700/health` — returned `{"status":"ok","service":"platform-api"}`.
- `curl -sS http://127.0.0.1:6701/api/health` — returned `{"status":"ok","service":"platform-api"}` through the unified web proxy.
- `curl -sS -I http://127.0.0.1:6701/admin` — returned `HTTP/1.1 200 OK`.
- `curl -sS -I http://127.0.0.1:6701/settings/system/health` — returned `HTTP/1.1 200 OK`.
- Old-port/product-prefix grep over `apps/web/src` and `apps/api/src` found no hits for old product ports, `/app/admin`, or forced product routes.

In-app browser visible smoke:

- `/admin` rendered `Admin` with cards for Organizations, Users, Roles, and Entitlements.
- `/admin/users` rendered the same Admin module surface at the unified subroute.
- `/rag` rendered `RAG` with cards for Collections and Documents.
- `/rag/collections` rendered the same RAG module surface at the unified subroute.
- `/settings` rendered `Settings` with cards for System Config, System Health, LLM Usage, LLM Models, LLM Costs, Observability, Event Log, MCP Servers, and Database.
- `/settings/system/health` rendered the same Settings module surface at the unified subroute.
- Each checked route had one visible `.platform-layout` shell and one visible `Capabilities` nav.

Notes:

- This slice copied/adapted legacy AdminShell navigation into unified module route definitions and entry surfaces. It did not move full legacy page components or API-backed Admin/RAG/Settings workflows yet.
- A browser tab without persisted auth logs the copied shell's existing `/auth/me` `401` path. API auth smoke through the web proxy still succeeds with demo credentials; authenticated browser route smoke is pending a reliable browser-plugin storage/form automation path.

## 2026-07-13 — Phase 3 System Health Page And Dev Proxy Fix

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- `npm run build:web` — passed. Vue type check and Vite build completed. Vite still reports the existing large chunk warning.
- `curl -sS http://127.0.0.1:6701/api/health` — returned `{"status":"ok","service":"platform-api"}` through the unified web proxy.
- `curl -sS -I http://127.0.0.1:6701/settings/system/health` — returned `HTTP/1.1 200 OK`.
- Served dev client inspection confirmed `VITE_API_BASE_URL` is now `/api`.

Root-cause fix:

- Browser-visible System Health initially rendered an error state: `Health Check Failed Failed to fetch`.
- `curl /api/health` worked, so the API and proxy were healthy.
- The served client showed `VITE_API_BASE_URL=http://127.0.0.1:6700`, which bypassed the Vite `/api` proxy from browser code.
- Updated `dev:web` to set `VITE_API_BASE_URL=/api` and `VITE_API_PROXY_TARGET=http://127.0.0.1:6700`.
- Updated `apps/web/vite.config.ts` to require `/api` for browser code during dev and a separate absolute `VITE_API_PROXY_TARGET`.
- Restarted `npm run dev:web`; Vite is serving on `http://localhost:6701/`.

In-app browser visible smoke:

- `/settings/system/health` rendered `System Health`.
- The page displayed `HEALTHY`, `Platform API`, and `Health endpoint returned ok.` from the unified `/health` endpoint.
- The route had one visible `.platform-layout` shell and one visible `Capabilities` nav.

Notes:

- The copied System Health page was adapted away from the legacy Admin API product-health aggregator because that old service assumes multiple product ports. The unified page now checks the single platform API health endpoint through `shared/services/api-client.ts`.
- The browser tab still logs the existing copied auth-store `401` path when no valid session is present. The System Health page itself no longer renders an error state after the proxy fix.

## 2026-07-13 — Phase 3 Shell Correction

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- `npm run build:web` — passed after restoring the Command `OaiAppShell` shell and removing simplified shell dependencies.
- `npm run build:api` — passed.
- `curl -sS http://127.0.0.1:6700/health` — returned `{"status":"ok","service":"platform-api"}`.
- `curl -sS http://127.0.0.1:6701/api/health` — returned `{"status":"ok","service":"platform-api"}` through the unified web proxy.
- `GET http://127.0.0.1:6701/api/admin/organizations` with a fresh token — returned `200` and real organization rows from the copied unified Admin Organizations API.
- Grep over `apps/web/src` and `packages/ui/layout/OaiSidebar.vue` found no remaining `PlatformShell`, `CapabilitySwitcher`, deleted route-registry imports, or old product-port navigation patterns. Remaining `window.location.href` hits are OIDC provider redirects.

Browser evidence:

- In-app Browser route `/app/dashboard` rendered one visible `OaiAppShell` and zero visible `.platform-layout` shells.
- Visible shell text included `OrchestratorAI`, `Standard`, `Advanced`, user name, and `Welcome, GolferGeek`, matching the copied Command shell/dashboard pattern rather than the temporary capability-list shell.

Notes:

- `VITE_MONOLITH_MODE=true` is now set for unified web dev/build scripts. In that mode, the shared `OaiSidebar` product switcher routes to `/app/...` module paths and hides old localhost port labels.
- The rewritten Organizations frontend page was removed. The backend Organizations module remains because it was a copy of the existing Auth API organizations controller/service with imports adapted to the existing database plane.

## 2026-07-13 — Phase 3 Admin Organizations Screen

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- `npm run build:web` — passed after copying the Organizations page and copied Admin auth API service into the Admin module.
- `curl -sS -I http://127.0.0.1:6701/app/admin/organizations` — returned `HTTP/1.1 200 OK`.
- `GET http://127.0.0.1:6701/api/admin/organizations` with a fresh token — returned `200` and real organization rows.
- Source grep over `apps/web/src/modules/admin`, `apps/web/src/routes/index.ts`, and `apps/web/src` found no stale `@/services/auth-api.service`, `OrganizationsPage`, `PlatformShell`, or `CapabilitySwitcher` references.

In-app browser visible smoke:

- `/app/admin/organizations` rendered the copied Admin Organizations page.
- Visible state included `Organizations`, `7 TOTAL ORGANIZATIONS`, `NEW ORGANIZATION`, and table headers `Slug`, `Name`, `Description`, `URL`, `Created`, `Actions`.
- The table rendered 7 organization rows from the unified API.
- The page rendered one visible `OaiAppShell` and zero visible `.platform-layout` shells.

Notes:

- The page is copied from the legacy Admin app. The only frontend adaptations are the module-local service import and unified `/api` service boundary.
- Browser log output still contains stale historical `PlatformShell.vue` messages from the in-app browser log buffer; source grep confirms the file is removed from `apps/web/src`.

## 2026-07-13 — Phase 3 Route-Aware Product Nav

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- `npm run build:web` — passed.
- `curl -sS -I http://127.0.0.1:6701/app/admin/organizations` — returned `HTTP/1.1 200 OK`.

In-app browser visible smoke:

- `/app/admin/organizations` rendered one visible `OaiAppShell`.
- Product switcher label was `Admin`.
- Left nav showed Admin section labels: Organizations, Users, Roles, Entitlements, LLM Analytics, RAG Management, Agent Registry, Observability, System, Data & Infrastructure.
- The Organizations table still rendered 7 rows.

Notes:

- This fixes the shell behavior so choosing a product/module changes the left nav to that product/module's options instead of continuing to show the Command product launcher.

## 2026-07-13 — Phase 3 Admin Roles Screen

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Copied `apps/admin/web/src/views/admin/RoleManagementPage.vue` to `apps/web/src/modules/admin/views/RoleManagementPage.vue`.
- Added direct route `/app/admin/roles` to the copied Roles page.
- `GET http://127.0.0.1:6701/api/api/rbac/roles` with a fresh token — returned `200` and 6 roles.
- `GET http://127.0.0.1:6701/api/api/rbac/permissions` with a fresh token — returned `200` and 21 permissions.
- `GET http://127.0.0.1:6701/api/api/rbac/audit?limit=10` with a fresh token — returned `200`.
- `npm run build:web` — passed.

Browser evidence:

- Browser-visible smoke for `/app/admin/roles` rendered `Roles & Permissions`, `System Roles`, and `Permissions`.
- Product switcher/nav context remained Admin.
- Left nav showed Admin section labels: Organizations, Users, Roles, Entitlements, LLM Analytics, RAG Management, Agent Registry, Observability, System, Data & Infrastructure.
- Visible role rows included Administrator, Manager, Member, Practice Manager, Super Administrator, and Viewer.
- The page rendered zero `.platform-layout` shells and no RBAC network failures.

Notes:

- This was a literal frontend page copy. No replacement Roles UI was created.
- The copied page uses the already-copied unified `rbacStore` and `rbacService`, which route through the platform web `/api` proxy to the unified RBAC API module.

## 2026-07-13 — Phase 3 Admin Users Screen

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Copied `apps/admin/web/src/views/admin/UserManagementPage.vue` to `apps/web/src/modules/admin/views/UserManagementPage.vue`.
- Copied `apps/admin/web/src/services/userManagementService.ts` to `apps/web/src/modules/admin/services/userManagementService.ts`.
- Added direct route `/app/admin/users` to the copied Users page.
- Added `POST /auth/password-reset` to the unified Auth controller for the copied Users password-reset action.
- Added and applied `supabase/migrations/20260713150000_grant_demo_user_global_admin.sql`.
- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `GET http://127.0.0.1:6701/api/auth/admin/users` with a fresh token — returned `200` and 6 users.
- `GET http://127.0.0.1:6701/api/api/rbac/organizations/*/users` with a fresh token — returned `200`.
- `POST http://127.0.0.1:6701/api/auth/password-reset` with a fresh token — returned success.

Root-cause fix:

- The copied Users page initially stayed at `Initializing...`.
- RBAC checks showed the local `demo-user@orchestratorai.io` token had no `admin:users`, no super-admin status, and no RBAC organizations, while the effort/docs expect that demo account to administer the app.
- Local database inspection showed `demo-user@orchestratorai.io` only had `member` roles for `building` and `legal`.
- The new migration grants that user the global `super-admin` role at organization `*`.

Browser evidence:

- Browser-visible smoke for `/app/admin/users` rendered `User Management`.
- The page showed real user rows including `demo-user@orchestratorai.io`, `justin@orchestratorai.io`, and `nick@orchestratorai.io`.
- Product switcher/nav context remained Admin.
- Left nav showed Admin section labels: Organizations, Users, Roles, Entitlements, LLM Analytics, RAG Management, Agent Registry, Observability, System, Data & Infrastructure.
- The page rendered zero `.platform-layout` shells and no RBAC/user network failures.

Notes:

- This was a copied frontend page, not a replacement Users UI.
- The module-local copied service only adapts the HTTP client boundary to unified `/api`; the page contract remains the Admin app contract.

## 2026-07-13 — Phase 3 Admin Entitlements Screen

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Copied `apps/admin/web/src/views/admin/EntitlementsAdminPage.vue` to `apps/web/src/modules/admin/views/EntitlementsAdminPage.vue`.
- Copied `apps/admin/web/src/stores/orgs.store.ts` to `apps/web/src/modules/admin/stores/orgs.store.ts`.
- Copied `apps/auth/api/src/entitlements/*` to `apps/api/src/auth/entitlements/*`.
- Added direct route `/app/admin/entitlements` to the copied Entitlements page.
- Wired `EntitlementsModule` into the unified `AuthModule`.
- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `GET http://127.0.0.1:6701/api/auth/admin/organizations/building/entitlements` with a fresh token — returned `200`.
- `POST http://127.0.0.1:6701/api/auth/admin/organizations/building/entitlements` with product `assistant` — returned `201`.
- `POST` with invalid product `not-a-product` — returned `400`.
- `DELETE http://127.0.0.1:6701/api/auth/admin/organizations/building/entitlements/assistant` — returned `204`.
- Database check after the write-path smoke confirmed `authz.org_entitlements` was back to empty.

Browser evidence:

- Browser-visible smoke for `/app/admin/entitlements` rendered `Entitlements`, `Organization:`, and the empty organization-selection state.
- After selecting `building`, the page rendered the copied product grid for Forge, Compose, Pulse, Bridge, and Assistant.
- Product switcher/nav context remained Admin.
- Left nav showed Admin section labels: Organizations, Users, Roles, Entitlements, LLM Analytics, RAG Management, Agent Registry, Observability, System, Data & Infrastructure.
- The page rendered zero `.platform-layout` shells and no entitlements/organization network failures.

Notes:

- This was a copied frontend page and copied Auth entitlements API module.
- The only backend adaptation was replacing the old app-local database alias with the unified `@orchestratorai/planes/database` injection boundary.

## 2026-07-13 — Phase 3 Remaining Admin Screens

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Copied remaining Admin web screens for LLM analytics, RAG, agent registry, observability, system config, MCP, and database into `apps/web/src/modules/admin/views`.
- Copied Admin web service/store/component dependencies into `apps/web/src/modules/admin`.
- Copied Admin API modules for LLM analytics, RAG management, agent registry, observability, database admin, and Claude pane into `apps/api/src/admin`.
- Copied Auth-owned system config API into `apps/api/src/admin/system-config`.
- Added unified `POST /admin/mcp` JSON-RPC endpoint for the copied MCP page because there was no source Admin API module to move.
- Wired copied modules into `apps/api/src/admin/admin.module.ts`.
- `npm run build:api` — passed.
- `npm run build:web` — passed. Vite still reports the existing large chunk warning.
- Endpoint smoke through `http://127.0.0.1:6701/api` with a fresh token returned:
  - `200 /api/admin/llm/usage`
  - `200 /api/admin/llm/models`
  - `200 /api/admin/llm/costs`
  - `200 /api/admin/rag/collections`
  - `200 /api/admin/agents`
  - `200 /api/admin/observability/metrics`
  - `200 /api/admin/observability/events`
  - `200 /api/admin/system/config`
  - `200 /api/admin/database/health`
  - `200 /api/admin/database/config`
  - `200 /api/admin/database/tables`
  - `200 /api/admin/database/migrations`
  - `200 /api/admin/claude-pane/health`
  - `201 /api/admin/mcp` for JSON-RPC `tools/list`
  - `200 /api/health`
- Grep over `apps/api/src/admin` and `apps/web/src/modules/admin` found no copied `@orchestratorai/auth-client` imports.
- Grep over `apps/api/src` and `apps/web/src` found no old `6150`, `/admin-api`, `/mcp-api`, or `localhost:6150` runtime references.

Browser evidence:

- Authenticated Playwright route sweep passed for all Admin routes:
  - `/app/admin/organizations`
  - `/app/admin/users`
  - `/app/admin/roles`
  - `/app/admin/entitlements`
  - `/app/admin/llm/usage`
  - `/app/admin/llm/models`
  - `/app/admin/llm/costs`
  - `/app/admin/rag`
  - `/app/admin/agents`
  - `/app/admin/observability`
  - `/app/admin/observability/events`
  - `/app/admin/system`
  - `/app/admin/system/health`
  - `/app/admin/mcp`
  - `/app/admin/database`
- Each route rendered its expected copied screen title and all 10 Admin left-nav groups/items.
- The earlier old-port console error was traced to `OaiAppShell` defaulting Claude pane health to `http://localhost:6150/admin/claude-pane/health`; copying the Claude pane API and passing `admin-api-url="/api"` fixed it.

Notes:

- `/app/admin/system/health` is routed to the unified platform health page rather than the literal legacy multi-product health grid because the legacy screen reports old product ports. This preserves the one web app / one API app target.
- The MCP backend is intentionally narrow. It exists to serve the copied MCP Admin page through the unified API and avoid an old `/mcp-api` proxy.

## 2026-07-15 — Phase 4 Pulse To Ambient

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Copied Pulse API ambient capability directories into `apps/api/src/ambient`.
- Copied Pulse web views, store, and composables into `apps/web/src/modules/ambient`.
- Mounted Ambient API routes under `/ambient/...`.
- Mounted Ambient web routes under `/app/ambient/...`.
- Added Ambient left nav inside the existing `OaiAppShell`.
- Updated the monolith product switcher to display `Ambient` for the existing `pulse` entitlement slug.
- Replaced old Forge/Compose remote port dispatch in trigger execution with unified in-process `InvokeDispatchService`.
- Aligned copied trigger repository with current local `ambient.triggers` schema and normalized current-schema trigger rows for display.
- `npm run build:api` — passed.
- `npm run build:web` — passed. Vite still reports the existing large chunk warning.
- `GET http://127.0.0.1:6700/health` — passed.
- `GET http://127.0.0.1:6700/ambient/.well-known/agent.json` — returned Ambient metadata.
- Authenticated endpoint smoke returned:
  - `200 /ambient/listeners`
  - `200 /ambient/workflows`
  - `200 /ambient/triggers`
  - `200 /ambient/executions`
  - `200 /ambient/scenarios`
- Temporary trigger create/delete smoke succeeded; delete returned `204`.
- `POST /ambient/listeners/simulate/file` returned `{ accepted: true }`.

Browser evidence:

- In-app browser route sweep passed for:
  - `/app/ambient`
  - `/app/ambient/listeners`
  - `/app/ambient/workflows`
  - `/app/ambient/triggers`
  - `/app/ambient/executions`
  - `/app/ambient/scenarios`
  - `/app/ambient/scenarios/scenario-db-change-trigger`
  - `/app/ambient/stream`
- Product switcher label rendered as `Ambient`.
- Ambient left nav rendered Dashboard, Listeners, Workflows, Triggers, Executions, Scenarios, and Event Stream.
- Event Stream connected and showed the SSE connected event from `/api/ambient/streaming/events`.

Notes:

- Existing current-schema trigger rows include service/capability responses. This slice normalizes them for display but does not invent a service-response executor.
- Some copied listener shutdown warnings remain as cleanup/hardening debt before Phase 7 final removal.

## 2026-07-16 — Phase 4 RAG First-Class Module Promotion

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Copied working Admin RAG backend services into `apps/api/src/rag`.
- Copied working Admin RAG frontend pages, store, components, and service into `apps/web/src/modules/rag`.
- Wired `/rag/collections` API ownership to `apps/api/src/rag`.
- Wired `/app/rag/collections` and `/app/rag/collections/:id` to the copied RAG pages.
- Removed the duplicate Admin RAG backend module.
- Removed Admin-owned RAG frontend pages/store/components and RAG methods from `admin-api.service.ts`.
- Updated the Agents-side RAG helper from `/api/admin/rag/...` to `/api/rag/...`.
- `npm run build:api` — passed.
- `npm run build:web` — passed. Vite still reports the existing `llm.store.ts` chunking warning.
- `npm run dev:stop && npm run dev:all` — restarted the platform stack.
- `./scripts/dev-servers.sh status` — passed; Supabase, Lightning, platform API `6700`, and platform web `6701` were healthy.
- `GET http://127.0.0.1:6700/rag/collections` without token returned `401`, proving the RAG module route exists and is guarded.
- `GET http://127.0.0.1:6700/admin/rag/collections` returned `404`, proving the duplicate Admin route is gone.
- Active-source scan found no remaining `/admin/rag` API calls. The only remaining `/app/admin/rag` source references are intentional redirect routes.

Browser evidence:

- In-app browser verified `/app/rag/collections?verify=rag-module-restart` renders `RAG Collections`.
- The RAG page showed the organization selector and no visible failure text.
- Browser console error log was empty for the RAG page.
- The organization selector exposed seven organizations: All Organizations, Building Demo, Engineering, Finance, Human Resources, Local Legal, and Marketing.
- In-app browser verified `/app/admin/rag?verify=post-restart-redirect` redirects to `/app/rag/collections`.

Notes:

- This keeps the RAG plane intact. `apps/api/src/rag/rag.module.ts` imports `RagStorageModule` from `@orchestratorai/planes/rag`; provider/storage behavior did not move into the app module.

## 2026-07-16 — Phase 4 Settings Web Ownership

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Moved Settings-owned operational screens from Admin views into `apps/web/src/modules/settings/views`.
- Moved LLM and Observability stores into `apps/web/src/modules/settings/stores`.
- Moved and trimmed the Admin API client into `apps/web/src/modules/settings/services/settings-api.service.ts`.
- Added a small Admin API client for the remaining Agent Registry pages.
- Removed the dead Admin multi-product health page and store.
- Wired direct Settings routes for system config, system health, LLM usage/models/costs, observability dashboard/events, MCP servers, and database.
- Changed old Admin operational routes to redirect into Settings.
- `npm run build:web` — passed. Vite still reports the existing `llm.store.ts` chunking warning.
- `./scripts/dev-servers.sh status` — passed; Supabase, Lightning, platform API `6700`, and platform web `6701` were healthy.

Browser evidence:

- In-app browser verified `/app/settings/system/health?verify=settings-module` renders System Health through the Settings left nav with no console errors.
- In-app browser verified `/app/settings/llm/models?verify=settings-module` renders LLM Models through the Settings left nav with no console errors.
- In-app browser verified `/app/settings/observability?verify=settings-module` renders Observability Dashboard through the Settings left nav with no console errors. The page displayed a historical workflow-failed event, which is data content rather than a page-load failure.
- In-app browser verified `/app/settings/database?verify=settings-module` renders Database Admin through the Settings left nav with no console errors.
- In-app browser verified `/app/admin/llm/models?verify=settings-redirect` redirects to `/app/settings/llm/models`.
- In-app browser verified `/app/admin/organizations?verify=settings-admin-nav` renders Admin nav with Organizations, Users, Roles, Entitlements, RAG Management, Agent Registry, and Settings; it no longer shows LLM Analytics or Database inside Admin.

## 2026-07-16 — Phase 4 Integrations Placeholder Removed

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Removed the placeholder-only `apps/api/src/integrations` controller/module.
- Removed `IntegrationsModule` from the unified API `AppModule`.
- Removed the placeholder-only `apps/web/src/modules/integrations/index.ts`.
- Documented Integrations as deferred until there is real source behavior to copy.
- `npm run build:api` — passed.
- `npm run build:web` — passed; existing `llm.store.ts` chunking warning remains.
- Active-source scan found no remaining `IntegrationsModule`, `integrationsModuleName`, `/api/integrations`, or placeholder `integrations` controller references.
- `./scripts/dev-servers.sh status` — passed; Supabase, Lightning, platform API `6700`, and platform web `6701` were healthy.

Notes:

- MCP administration remains under Settings with the Admin API MCP endpoint.
- Customer-service integration behavior remains under Agents and the landing/customer-service widget.
- No replacement stub, proxy, or compatibility route was added.

## 2026-07-16 — Phase 4 Placeholder Status Endpoints Removed

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Removed the shared `CommonCapabilityController` placeholder base.
- Removed fake root status controllers from Admin, Agents, and Workflows.
- Removed the empty top-level Invoke module; real copied `POST /invoke` behavior remains in the Agents invoke module.
- Removed the unused Agents web type placeholder file and its barrel export.
- Removed empty directories left behind by prior module moves.
- Active-source scan found no remaining `CommonCapabilityController`, `CapabilityStatus`, or placeholder status endpoint references.
- `npm run build:api` — passed.
- `npm run build:web` — passed; existing `llm.store.ts` chunking warning remains.

Notes:

- Concrete copied child controllers remain in place for Admin, Agents, Workflows, and Invoke behavior.
- No fake module status endpoint was replaced with another placeholder.

## 2026-07-16 — Phase 4 Workflow RAG And Ambient Trigger Hardening

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Changed `WorkflowRagService` so missing RAG storage/query services, missing named collections, failed RAG queries, invalid smart-routing output, and no active smart-routing collections fail loudly instead of returning empty reference material.
- Removed the copied “best-effort” RAG behavior from the shared Workflows RAG helper.
- Wired the Ambient Triggers create form to the real `POST /api/ambient/triggers` endpoint.
- Added required UI inputs for concrete source config and target agent slug.
- Aligned Ambient trigger source values with backend listener values: `database`, `filesystem`, and `cron`.
- Removed the visible “Trigger creation via UI is a placeholder” note.
- `npm run build:api` — passed.
- `npm run build:web` — passed; existing `llm.store.ts` chunking warning remains.
- Targeted scan found no remaining best-effort RAG helper text or visible Ambient trigger placeholder note.

Browser evidence:

- In-app browser verified `/app/ambient/triggers?verify=trigger-create-form` renders Triggers with no console errors.
- Opening Create Trigger showed New Trigger, Database Table, Target Agent Slug, Save Trigger, and source value `database`.
- The visible placeholder note was absent.

## 2026-07-16 — Phase 4 Secure Conversations And Ambient Cleanup

Branch: `codex/ai-platform-monolith-consolidation`

Commands and outcomes:

- Secure Conversations dispatch now requires inbound/outbound audit log creation before routing.
- Secure Conversations message status updates now propagate database errors instead of warning and continuing.
- Secure Conversations external-agent interaction updates now propagate errors instead of swallowing `.catch(() => {})`.
- External registry interaction updates now throw when the agent is missing.
- Telegram webhook typing/error-response failures are logged explicitly instead of disappearing behind empty catches.
- Ambient database, file, and cron listener startup now propagates trigger load failures.
- Ambient file and cron listener startup now throws on malformed active trigger config instead of warning and skipping the trigger.
- Ambient event evaluation now throws when trigger loading or rate-limit execution counting fails.
- Secure Conversations topology and audit views now label deterministic sample data as demo content instead of presenting it as live runtime state.
- Secure Conversations home/security views now surface status/stream errors in the UI instead of silently ignoring them.
- `npm run build:api` — passed.
- `npm run build:web` — passed; existing `llm.store.ts` chunking warning remains.
- Targeted scan found no remaining swallowed Secure Conversations interaction updates, non-fatal status catches, malformed trigger config skip paths, or deterministic mock topology/audit copy.

Browser evidence:

- In-app browser verified `/app/secure-conversations/observability/topology?verify=demo-labels` renders `Demo Network Topology`, removes the old unqualified title, and has no console errors.
- In-app browser verified `/app/secure-conversations/observability/audit?verify=demo-labels` renders `Demo Audit Trail` with demonstration hash-chain copy and has no console errors.
