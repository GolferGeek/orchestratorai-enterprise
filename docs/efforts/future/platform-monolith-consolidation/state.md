# Platform Monolith Consolidation — State Ledger

**Last updated**: 2026-07-15  
**Current phase**: Phase 4 in progress — non-Admin product module consolidation  
**Active branch**: `codex/ai-platform-monolith-consolidation`  
**Active agents**: Orchestration agent  
**Implementation status**: Phase 3 Admin screen consolidation complete; Compose/Agents is partially copied and tested; Forge Legal Department is now copied into the unified Workflows module on both API and web with route-aware Workflows left nav; copied Forge Legal workflows have now been execution-smoked; Pulse is now copied into the unified Ambient module on both API and web; Bridge is now copied into the unified Secure Conversations module on both API and web; visible product naming is normalized to Agents, Workflows, Ambient, and Secure Conversations

## Current Status

Phase 0 is complete as an inventory and planning-foundation slice. The effort now has the required context-spanning ledger and migration map:

- `state.md`
- `migration-map.md`

The repo still contains the old multi-deployable apps, but the first unified shell targets now exist and now contain the copied auth proof slice plus the first Phase 3 frontend route surfaces:

- `apps/api`
- `apps/web`

Root `package.json` has new primary platform scripts:

- `dev:api`
- `dev:web`
- `build:api`
- `build:web`

Old product app scripts remain in place until Phase 7.

Phase 3 has started, but the frontend direction was corrected after review:

- The unified web app must keep the original Command frontend shell and `@orchestratorai/ui` `OaiAppShell`.
- Product apps should move under that shell as modules, with route/API rewiring only.
- The simplified `PlatformShell`/`CapabilitySwitcher` shell was removed because it changed the main application frontend.
- The rewritten Organizations frontend page was removed. Future frontend page moves must copy the existing product page and only change imports/API boundaries.
- The shared product switcher now has monolith mode so product switching resolves to in-app `/app/...` module routes instead of old localhost product ports.

Earlier Phase 3 route-surface work remains as temporary module scaffolding:

- Copied/adapted the legacy AdminShell management navigation into `apps/web/src/modules/admin/routes.ts` and `AdminModule.vue`.
- Copied/adapted the legacy AdminShell RAG management entry into `apps/web/src/modules/rag/routes.ts` and `RagModule.vue`.
- Copied/adapted the legacy AdminShell settings groups into `apps/web/src/modules/settings/routes.ts` and `SettingsModule.vue`.
- Wired Admin, RAG, and Settings module subroutes into the unified router while keeping top-level capability routes.
- Copied/adapted the legacy System Health UI into `apps/web/src/modules/settings/SystemHealthPage.vue`.
- Added `apps/web/src/modules/settings/services/systemHealthService.ts`, using `shared/services/api-client.ts` against the unified `/health` endpoint.
- No old product ports, product-prefix navigation, fallback proxies, or compatibility wrappers were added.
- Admin Organizations is now a literal copied screen:
  - `apps/admin/web/src/views/admin/OrganizationsAdminPage.vue` -> `apps/web/src/modules/admin/views/OrganizationsAdminPage.vue`
  - `apps/admin/web/src/services/auth-api.service.ts` -> `apps/web/src/modules/admin/services/auth-api.service.ts`
  - `/app/admin/organizations` routes directly to the copied page inside the restored Command shell.
  - The service boundary now uses unified `VITE_API_BASE_URL=/api` and the existing `authToken` storage key.
- Admin Roles is now a literal copied screen:
  - `apps/admin/web/src/views/admin/RoleManagementPage.vue` -> `apps/web/src/modules/admin/views/RoleManagementPage.vue`
  - `/app/admin/roles` routes directly to the copied page inside the restored Command shell.
  - The copied page uses the existing copied unified RBAC store/service and the unified RBAC API module.
- Admin Users is now a copied screen:
  - `apps/admin/web/src/views/admin/UserManagementPage.vue` -> `apps/web/src/modules/admin/views/UserManagementPage.vue`
  - `apps/admin/web/src/services/userManagementService.ts` -> `apps/web/src/modules/admin/services/userManagementService.ts`
  - `/app/admin/users` routes directly to the copied page inside the restored Command shell.
  - The service boundary now uses the unified `/api` base and existing `authToken` storage key.
  - The copied password-reset action is backed by the unified Auth controller route `POST /auth/password-reset`.
- Added root Supabase migration `20260713150000_grant_demo_user_global_admin.sql` so the documented demo admin user has the expected global `super-admin` RBAC role in local data.
- Admin Entitlements is now a copied screen and API module:
  - `apps/admin/web/src/views/admin/EntitlementsAdminPage.vue` -> `apps/web/src/modules/admin/views/EntitlementsAdminPage.vue`
  - `apps/admin/web/src/stores/orgs.store.ts` -> `apps/web/src/modules/admin/stores/orgs.store.ts`
  - `apps/auth/api/src/entitlements/*` -> `apps/api/src/auth/entitlements/*`
  - `/app/admin/entitlements` routes directly to the copied page inside the restored Command shell.
  - The copied page uses the module-local copied Admin auth API service and unified Auth entitlements module.
- The shell is now route-aware:
  - `/app/admin/...` sets the active product to Admin.
  - The left nav shows Admin section links instead of the Command product launcher.
  - Dashboard/Command routes keep the product launcher behavior.
- The remaining Admin app screens have now been copied into the unified Admin module:
  - LLM Usage, Models, and Costs
  - RAG Collections and Collection Detail
  - Agent Registry and Agent Detail
  - Observability Dashboard and Event Log
  - System Configuration
  - MCP Servers
  - Database Admin
- The copied Admin API modules have been moved under the unified API Admin module:
  - `llm-analytics`
  - `rag-management`
  - `agent-registry`
  - `observability`
  - `system-config`
  - `database-admin`
  - `claude-pane`
- The visible `/app/admin/system/health` route intentionally uses the unified platform health page instead of the legacy multi-product health grid because the legacy page reports old product ports. This keeps the starter runtime at one API and one web app.
- The MCP admin page now calls unified `POST /api/admin/mcp`; there was no source Admin API module for this page, so a narrow JSON-RPC admin endpoint was added under the unified Admin module rather than adding an old `/mcp-api` proxy.
- The shared `OaiAppShell` Claude pane now receives `admin-api-url="/api"` from the unified shell, and the copied Claude pane API is served at `/api/admin/claude-pane`.

This slice now has the Admin app's user-facing screens moved into the unified runtime, plus the first non-Admin module surfaces:

- Compose/Agents was copied into `apps/api/src/agents` and `apps/web/src/modules/agents` for the visible simple-agent experience.
- Forge Legal Department was copied into `apps/api/src/workflows/legal-department`, `apps/api/src/workflows/shared`, and `apps/web/src/modules/workflows/views/legal-department`.
- Pulse ambient automation was copied into `apps/api/src/ambient` and `apps/web/src/modules/ambient`.
- Bridge external A2A was copied into `apps/api/src/secure-conversations` and `apps/web/src/modules/secure-conversations`.
- Visible product/module naming now uses the unified module language:
  - Compose -> Agents
  - Forge -> Workflows
  - Pulse -> Ambient
  - Bridge -> Secure Conversations
  Existing product slugs remain where they are data/entitlement compatibility keys.
- The unified Workflows route is `/app/workflows/legal-department`, with subroutes for Document Onboarding, Contract Review, Legal Research, Due Diligence, Adversarial Brief, Discovery Review, Compliance Audit, Portfolio Sentinel, Monte Carlo Trial, Matters, and Settings.
- The left nav now switches to Workflows-specific sections when the Forge/Workflows module is active.
- The unified Ambient route is `/app/ambient`, with subroutes for Listeners, Workflows, Triggers, Executions, Scenarios, Scenario Detail, and Event Stream.
- The left nav now switches to Ambient-specific sections when the Pulse/Ambient module is active.
- The unified Secure Conversations route is `/app/secure-conversations`, with subroutes for Registry, Inbound A2A, Outbound A2A, Security, Observability, Scenarios, Demo Mode, Protocol Matrix, Protocol Compare, and Settings.
- The left nav now switches to Secure Conversations-specific sections when the Bridge/Secure Conversations module is active.
- Secure Conversations copied web/API surfaces have been renamed at the visible boundary from Bridge to Secure Conversations, including settings, home, registry, outbound copy, well-known agent metadata, training copy, and demo content labels.

Remaining non-Admin product modules still need to be copied behind their modules in later Phase 4 slices.

## Branch And Worktree Notes

- Current branch during Phase 0: `main`
- Existing dirty work before this slice:
  - `docs/efforts/roadmap.md`
  - `docs/efforts/future/platform-monolith-consolidation/intention.md`
  - `docs/efforts/future/platform-monolith-consolidation/plan.md`
- Phase 0 added:
  - `docs/efforts/future/platform-monolith-consolidation/state.md`
  - `docs/efforts/future/platform-monolith-consolidation/migration-map.md`

The effort-doc changes and Phase 1 shell work now live on `codex/ai-platform-monolith-consolidation`.

## Key Decisions

- This effort remains intention-first. No PRD is required.
- Target runtime remains one deployable API app and one deployable web app:
  - `apps/api`
  - `apps/web`
- `secure-conversations` is the target module name for old Bridge/A2A behavior.
- A2A remains JSON-RPC 2.0 `invoke` from `@orchestratorai/transport-types`.
- `ExecutionContext` shape and whole-capsule flow are unchanged.
- No fallback proxies, compatibility shims, old-port wrappers, or silent degradation paths are allowed.
- Protocol Lab is classified as developer/demo-only outside the starter runtime for this consolidation unless a later explicit product decision creates a separate effort for it.
- Phase 2 moved platform scripts to explicit platform ports `6700` and `6701`. Port `6000` is browser-blocked by modern clients and was not retained.
- Phase 2 is copy-first. Working Auth API/RBAC code and Command web auth/dashboard code were copied into the unified apps and adapted at the boundary instead of rewritten wholesale.

## Last Inventory Commands

- `node -e "const p=require('./package.json'); console.log(JSON.stringify({name:p.name, packageManager:p.packageManager, workspaces:p.workspaces, scripts:p.scripts}, null, 2))"`
- `find apps/{auth/api,admin/api,forge/api,compose/api,ambient/pulse/api,ambient/bridge/api} -maxdepth 3 \( -name '*controller.ts' -o -name '*module.ts' -o -name '*service.ts' \) | sort`
- `find apps/{command/web,admin/web,forge/web,compose/web,ambient/pulse/web,ambient/bridge/web} -maxdepth 4 \( -path '*/src/router/*' -o -path '*/src/services/*' -o -path '*/src/views/*' -o -path '*/src/components/*' \) -type f | sort`
- `rg -n "6100|6101|6102|6200|6201|6300|6301|6500|6501|6600|6601|/forge|/compose|/pulse|/bridge" package.json apps scripts docs --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!docs/efforts/future/platform-monolith-consolidation/**'`
- `node -e "for (const f of ['apps/protocol-lab/package.json','apps/protocol-lab/frontend/package.json','apps/protocol-lab/apps/protocol-api/package.json']) { const p=require('./'+f); console.log(f); console.log(JSON.stringify({name:p.name,scripts:p.scripts},null,2)); }"`

## Latest Verification

See `verification-log.md` for command output details.

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `npm run dev:api` — served `http://127.0.0.1:6700/health`.
- `npm run dev:web` — served `http://127.0.0.1:6701/`.
- `curl -sS http://127.0.0.1:6701/api/health` — confirmed the web dev proxy reaches the unified API.
- `POST http://127.0.0.1:6701/api/auth/login` — returned an access token with integration credentials against local Supabase via `ENV_FILE`.
- `GET http://127.0.0.1:6701/api/auth/me` and `/api/auth/entitlements` — passed after adding the root `authz` grant migration.
- In-app browser login flow — passed: `/login` renders, login reaches `/dashboard`, one visible shell/nav, no console warnings or errors.

### 2026-07-15 — Phase 4 Forge Legal Workflow Execution Smoke

Ran the copied Forge Legal Department workflows one at a time against the unified API/web runtime on ports `6700` and `6701`.

Fixes made during execution smoke:

- `legal.agent_jobs.workflow_slug` is now populated by the copied jobs repository so local monolith schema requirements are met.
- Copied Legal workflow page contexts now use current valid `anthropic` / `claude-sonnet-4-6` defaults instead of old Ollama/Gemma model names.
- Copied Workflows route-name mismatches were fixed for due diligence comparison, Sentinel, and Matter dashboard navigation.
- Compliance framework seeding now reads the monolith module path under `apps/api/src/workflows/...`.
- Local RAG framework collections were created with the current monolith `complexity_type='comprehensive'` schema, then seeded with 43 copied framework markdown documents.
- Sentinel portfolio RAG collection creation now uses `comprehensive`, matching the current RAG collection constraint.
- Monte Carlo no longer overrides the ExecutionContext model with hardcoded `gemma4:26b`; copied UI now sends `metadata.jobType='monte-carlo-trial-simulator'` and the case record content shape expected by the worker.
- Matters create/update DTOs now match the copied web service flat payload, and matter document upload now persists the generated document id so facts/timeline inserts satisfy foreign keys.

Execution results:

- Document Onboarding: queued, reached HITL, approved, completed.
- Contract Review: queued, reached HITL, approved, completed.
- Legal Research: queued, reached HITL, approved, completed.
- Due Diligence Room: queued with two documents, reached HITL, approved through both gates, completed; document index and risk matrix endpoints returned data.
- Adversarial Brief: queued with one-round stress test, reached HITL, approved, completed.
- Discovery Review: queued with two documents, reached batch HITL, batch approved, completed.
- Compliance Audit: framework endpoint fixed; GDPR scan queued, reached HITL, approved, completed; scorecard and findings endpoints returned data.
- Portfolio Sentinel: sources/signals/portfolio/alerts endpoints loaded; poll-now ingest completed and produced a processed FTC signal.
- Monte Carlo Trial: one-simulation job completed and returned `monteCarloResult`.
- Matters: matter created, detail loaded, document upload queued facts/docs jobs; both completed after document-id fix; documents/entities/timeline endpoints returned data.
- Deal Memo from completed DD room: queued, reached HITL, approved, completed; finalized memo endpoint returned memo markdown and five citation sections.

Browser-visible route sweep:

- `/app/workflows/legal-department`
- `/app/workflows/legal-department/document-onboarding`
- `/app/workflows/legal-department/contract-review`
- `/app/workflows/legal-department/legal-research`
- `/app/workflows/legal-department/due-diligence`
- `/app/workflows/legal-department/adversarial-brief`
- `/app/workflows/legal-department/discovery-review`
- `/app/workflows/legal-department/compliance-audit`
- `/app/workflows/legal-department/sentinel`
- `/app/workflows/legal-department/monte-carlo`
- `/app/workflows/legal-department/matters`
- `/app/workflows/legal-department/settings`

All routes loaded in the in-app browser without visible failure text. Route-specific content was verified for Contract Review, Legal Research, Due Diligence, Adversarial Brief, Discovery Review, Compliance Audit, Portfolio Sentinel, Monte Carlo, Matters, Document Onboarding, and Settings.

Verification commands:

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `curl http://127.0.0.1:6700/health` — passed after restarting the API dev screen once following a stuck hot reload.

## Next Action

Continue Phase 4 consolidation with the next non-Admin app module:

1. Continue Phase 4 with the next app/module selected for consolidation.
2. Keep using the copy-first rule: move working code, adapt route/API boundaries, then harden copied no-fallback issues.
3. Before final cleanup, remove or rewrite copied best-effort/silent-degradation paths surfaced in Legal workflows and Ambient listeners, especially Sentinel trigger/RAG helpers, document storage warnings, and listener shutdown warnings.

### 2026-07-15 — Phase 4 Pulse To Ambient Copy

Copied the Pulse ambient automation stack into the unified Ambient module instead of rewriting it:

- Source `apps/ambient/pulse/api/src/ambient-database` -> target `apps/api/src/ambient/ambient-database`.
- Source `apps/ambient/pulse/api/src/automation-context` -> target `apps/api/src/ambient/automation-context`.
- Source `apps/ambient/pulse/api/src/event-bus`, `executions`, `listeners`, `scenarios`, `services`, `streaming`, `triggers`, `workflows`, `well-known`, and `invoke` -> target `apps/api/src/ambient`.
- Source `apps/ambient/pulse/web/src/views`, `stores`, and `composables` -> target `apps/web/src/modules/ambient`.
- Mounted copied API controllers under `/ambient/...`.
- Mounted copied web screens under `/app/ambient/...`.
- Added Ambient-specific left nav in the restored `OaiAppShell`.
- Changed the monolith product switcher display label from Pulse to Ambient while retaining the existing `pulse` entitlement slug for current auth data.

Adaptations made during the copy:

- Standalone Pulse bootstrap/auth/RBAC/health modules were not copied as deployables; unified API auth/RBAC/health remain authoritative.
- Copied Pulse guards were adapted to unified `JwtAuthGuard`, `RbacGuard`, and `RequirePermission`.
- Trigger execution no longer calls old Forge/Compose ports. It dispatches through the unified in-process Agents `InvokeDispatchService` using the JSON-RPC `invoke` data shape.
- System-triggered execution contexts now use `createSystemTriggeredContext()`.
- The Ambient repository was aligned to the current local `ambient.triggers` schema, which uses `trigger_kind`, `trigger_config`, `response_kind`, and `response_config` instead of the copied Pulse `product` discriminator.
- Existing current-schema triggers are normalized for copied UI/evaluator display at the repository boundary; no old `product='pulse'` column or compatibility read path was added.
- User-visible Pulse text in the copied Ambient pages and discovery endpoint was renamed to Ambient.

Verification:

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `curl http://127.0.0.1:6700/health` — passed.

### 2026-07-15 — Phase 4 Bridge To Secure Conversations Copy

Copied the Bridge external A2A stack into the unified Secure Conversations module instead of rewriting it:

- Source `apps/ambient/bridge/api/src/database`, `inbound`, `outbound`, `registry`, `security`, `messaging`, `protocol`, `streaming`, `training`, `well-known`, and `invoke` -> target `apps/api/src/secure-conversations`.
- Source `apps/ambient/bridge/web/src/components`, `composables`, `content`, `stores`, `types`, and `views` -> target `apps/web/src/modules/secure-conversations`.
- Mounted copied API controllers under `/secure-conversations/...`.
- Mounted copied web screens under `/app/secure-conversations/...`.
- Added Secure Conversations-specific left nav in the restored `OaiAppShell`.
- Changed the monolith product switcher display label from Bridge to Secure Conversations while retaining the existing `bridge` entitlement slug for current auth data.

Adaptations made during the copy:

- Standalone Bridge bootstrap/auth/health modules were not copied as deployables; unified API auth/health remain authoritative.
- Copied Bridge guards/decorators were adapted to unified `JwtAuthGuard` and `@Public`.
- Inbound A2A routing no longer calls old product ports. It dispatches through the unified in-process Agents `InvokeDispatchService` using the JSON-RPC `invoke` data shape.
- Bridge well-known metadata now uses the unified Secure Conversations base URL and `/secure-conversations/...` endpoints.
- Added local migration `20260715143000_create_secure_conversations_tables.sql` for copied `ambient.external_agents` and `ambient.a2a_messages` storage.
- The copied Bridge web stylesheet was restored from the existing built Bridge bundle because the unified web app does not run the old standalone Tailwind pipeline.
- `OaiAppShell` now adds a product slug class, and Secure Conversations scopes its copied dark Bridge canvas to `oai-app-shell--bridge` so the copied white-on-dark pages render correctly inside the unified shell.

Verification:

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- Authenticated endpoint smoke passed for registry, A2A messages, message stats, training scenarios, and stream status.
- Temporary registry create/list/delete smoke succeeded.
- In-app browser sweep passed for Secure Conversations overview, registry, inbound, outbound, security, observability, scenarios, demo, matrix, protocol compare, and settings.
- Browser-visible CSS verification passed on `/app/secure-conversations/settings` and `/app/secure-conversations/matrix`; copied cards, dark canvas, and white headings are now applied.
- Public discovery endpoint `GET /ambient/.well-known/agent.json` returned Ambient metadata and no old ports.
- Authenticated endpoint smoke returned:
  - `200 /ambient/listeners`
  - `200 /ambient/workflows`
  - `200 /ambient/triggers`
  - `200 /ambient/executions`
  - `200 /ambient/scenarios`
- Temporary Ambient trigger create/delete smoke succeeded; delete returned `204`.
- Listener simulation `POST /ambient/listeners/simulate/file` returned accepted.
- In-app browser route sweep passed for:
  - `/app/ambient`
  - `/app/ambient/listeners`
  - `/app/ambient/workflows`
  - `/app/ambient/triggers`
  - `/app/ambient/executions`
  - `/app/ambient/scenarios`
  - `/app/ambient/scenarios/scenario-db-change-trigger`
  - `/app/ambient/stream`
- The Event Stream page connected to `/api/ambient/streaming/events`.

## Run Log

### 2026-07-04 — Phase 1

Created the unified platform shells:

- `apps/api` NestJS shell with `health`, `auth`, `admin`, `agents`, `workflows`, `ambient`, `secure-conversations`, `rag`, `integrations`, and `invoke` modules.
- `apps/web` Vue/Ionic shell with capability routes for dashboard, agents, workflows, ambient, secure conversations, admin, RAG, and settings.
- Root scripts and workspaces for `apps/api` and `apps/web`.
- `verification-log.md`.

No product behavior was migrated in this phase.

### 2026-07-05 — Phase 2 Auth/Shell Proof Slice

Copied working code instead of rewriting the slice:

- Copied Auth API behavior from `apps/auth/api/src/auth` into `apps/api/src/auth`.
- Copied RBAC API behavior from `apps/auth/api/src/rbac` into `apps/api/src/rbac`.
- Wired `AuthModule`, `RbacModule`, `DatabaseModule`, and `ConfigProviderModule` into `apps/api`.
- Copied Command web auth/dashboard dependencies into `apps/web/src` and moved `DashboardPage.vue`, `LoginPage.vue`, and `AccessDeniedPage.vue` into `apps/web/src/modules/auth`.
- Converted capability entitlements to unified in-app routes instead of old product web URLs.
- Deleted copied unused files that still referenced old product ports.

Verification passed for builds and HTTP route serving. Browser-visible login/dashboard verification is still pending because standalone Playwright has no installed browser binary and the in-app browser kernel timed out during navigation.

Auth smoke also exposed a copied/planes issue: `SupabaseAuthService` logged `Identity link upsert failed (non-fatal for Supabase auth): Failed to upsert identity link: permission denied for schema authz`. The code now propagates that failure; protected auth calls fail with `401` and log `Failed to upsert identity link: permission denied for schema authz`. The remaining work is the database/schema permission root cause.

### 2026-07-07 — Phase 2 Closure

Closed the auth/schema and browser verification blockers:

- Added root Supabase migration `supabase/migrations/20260707090000_grant_authz_schema_access.sql`.
- Applied the migration to local Supabase and verified `authenticated` and `service_role` have `USAGE` on `authz` plus table privileges on `authz.auth_identity_links`.
- Changed planes auth imports to use `@orchestratorai/auth-client` directly instead of app-local alias shims.
- Removed copied auth re-export shim files from `apps/api/src/auth`.
- Removed copied frontend `useAuthStore` alias and the RBAC initialization pre-warm that swallowed initialization failures.
- Flattened unified web routing so platform routes render exactly one visible shell.

Verification:

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- API smoke through unified web proxy — login, `/auth/me`, and `/auth/entitlements` all returned 200.
- In-app browser smoke — `/login` rendered, submitted credentials, reached `/dashboard`, showed `Welcome, GolferGeek`, one visible shell, one visible capability nav, and no console warnings/errors.
- In-app route smoke — `/secure-conversations` route rendered with one visible shell/nav; extra cached Ionic DOM was zero-sized and not visible.

Phase 2 is complete. Next phase is frontend module consolidation.

### 2026-07-13 — Phase 3 Admin/RAG/Settings Route Surfaces

Copied working navigation structure instead of inventing a new module map:

- Source `apps/admin/web/src/components/AdminShell.vue` management entries -> target `apps/web/src/modules/admin/routes.ts`.
- Source `apps/admin/web/src/components/AdminShell.vue` RAG management entry -> target `apps/web/src/modules/rag/routes.ts`.
- Source `apps/admin/web/src/components/AdminShell.vue` LLM, Observability, System, and Data & Infrastructure entries -> target `apps/web/src/modules/settings/routes.ts`.
- Added `AdminModule.vue`, `RagModule.vue`, and `SettingsModule.vue` as unified module entry surfaces.
- Updated `PlatformShell.vue` to render those module components for Admin, RAG, and Settings capability routes.
- Updated the unified router to own subroutes such as `/admin/users`, `/rag/collections`, and `/settings/system/health`.

Verification:

- `npm run build:web` — passed.
- `npm run build:api` — passed.
- `curl http://127.0.0.1:6700/health` and `curl http://127.0.0.1:6701/api/health` — passed.
- `curl -I http://127.0.0.1:6701/admin` and `/settings/system/health` — returned `200`.
- In-app browser visible smoke — `/admin`, `/admin/users`, `/rag`, `/rag/collections`, `/settings`, and `/settings/system/health` each rendered one visible platform shell, one capability nav, and the expected module cards.
- Old-port/product-prefix grep over unified `apps/web/src` and `apps/api/src` — no hits.

Browser note:

- The browser automation tab without a persisted session logs the existing copied shell `401` path from `/auth/me`. API auth smoke through the web proxy still succeeds with demo credentials. The route-surface smoke verified visible rendering; authenticated browser route smoke needs either normal form automation support or a browser plugin path that can persist `authToken` in page storage.

### 2026-07-13 — Phase 3 System Health Page And Dev Proxy Fix

Copied/adapted the first live Settings page:

- Source `apps/admin/web/src/views/admin/SystemHealthPage.vue` -> target `apps/web/src/modules/settings/SystemHealthPage.vue`.
- Added `apps/web/src/modules/settings/services/systemHealthService.ts`.
- Wired `/settings/system/health` to render the live System Health page instead of the Settings card surface.
- Reused the shared platform API client and unified `/health` endpoint.

Root-cause fix:

- Browser verification showed the page fetch failing while `curl http://127.0.0.1:6701/api/health` passed.
- Root cause: `dev:web` injected `VITE_API_BASE_URL=http://127.0.0.1:6700` into browser code, bypassing the Vite `/api` proxy and causing a cross-origin fetch failure.
- Fixed `dev:web` to set `VITE_API_BASE_URL=/api` and `VITE_API_PROXY_TARGET=http://127.0.0.1:6700`.
- Tightened `apps/web/vite.config.ts` so the dev server requires `/api` as the browser base and a separate absolute proxy target.

Verification:

- Restarted `npm run dev:web`; Vite is serving on `http://localhost:6701/`.
- Served client code now exposes `VITE_API_BASE_URL=/api`.
- `curl http://127.0.0.1:6701/api/health` — passed.
- `npm run build:web` — passed.
- In-app browser visible smoke for `/settings/system/health` — rendered `System Health`, `HEALTHY`, `Platform API`, `Health endpoint returned ok.`, one visible shell, and one visible capability nav.

### 2026-07-13 — Phase 3 Shell Correction

Corrected frontend migration direction after user review:

- Restored the original Command shell model using `OaiAppShell` in `apps/web/src/shell/AppShellPage.vue`.
- Changed `apps/web/src/app/App.vue` back to a thin `IonRouterOutlet` wrapper to avoid nesting another `IonApp`.
- Reworked `apps/web/src/routes/index.ts` so `/app/...` child routes render inside the original shell.
- Removed the simplified `PlatformShell.vue`, `CapabilitySwitcher.vue`, and route registry introduced earlier.
- Removed the rewritten `OrganizationsPage.vue` and its frontend service so future Admin frontend work can be a literal copy of the existing Admin page.
- Reworked entitlements back to product-centric Command shell data while explicitly mapping unified capability entitlements to original product routes during the consolidation.
- Added `VITE_MONOLITH_MODE=true` to unified web dev/build scripts and updated `packages/ui/layout/OaiSidebar.vue` so the product switcher routes to `/app/...` module paths rather than old localhost app ports when monolith mode is enabled.

### 2026-07-15 — Phase 4 Forge Legal Department Workflows Copy

Copied the Forge Legal Department workflow stack into the unified Workflows module instead of rewriting it:

- Source `apps/forge/api/src/agents/legal-department` -> target `apps/api/src/workflows/legal-department`.
- Source `apps/forge/api/src/agents/shared` -> target `apps/api/src/workflows/shared`.
- Source `apps/forge/web/src/views/agents/legal-department` -> target `apps/web/src/modules/workflows/views/legal-department`.
- Source `apps/forge/web/src/types/monte-carlo.types.ts` -> target `apps/web/src/modules/types/monte-carlo.types.ts` and `apps/web/src/types/monte-carlo.types.ts`.
- Wired `LegalDepartmentModule`, `SharedServicesModule`, and `PersistenceModule` into `apps/api/src/workflows/workflows.module.ts`.
- Adapted copied Forge controllers from remote auth-client guards to unified `JwtAuthGuard`, `RbacGuard`, and `RequirePermission`.
- Added the copied Forge runtime dependencies to `apps/api/package.json` and refreshed `package-lock.json`.
- Replaced copied Forge UI app paths with `/app/workflows/legal-department/...` and unified API defaults with `/api`.
- Added direct Workflows routes and a Workflows-specific left nav in the restored `OaiAppShell`.

Verification:

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `curl http://127.0.0.1:6700/health` — passed.
- `curl http://127.0.0.1:6701/app/workflows/legal-department` — returned `200`.
- In-app browser verified `/app/workflows/legal-department` renders the copied Legal Department workspace, Workflows left nav, and existing legal jobs through the monolith API.
- In-app browser verified `/app/workflows/legal-department/contract-review` renders 10 existing Contract Review jobs.
- In-app browser verified `/app/workflows/legal-department/due-diligence`, `/sentinel`, `/monte-carlo`, and `/matters` render without load-failure text; Matters loads existing matter records.

Verification:

- `npm run build:web` — passed.
- `npm run build:api` — passed.
- Grep found no remaining imports of `PlatformShell`, `CapabilitySwitcher`, `routes/registry`, or `endpoint-registry` in `apps/web/src`.
- In-app browser visible smoke for `/app/dashboard` — one visible `OaiAppShell`, zero visible `.platform-layout`, and the original Command top shell rendered. The browser tab had a stale/expired auth token, so product cards were not used as final entitlement evidence in this check.
- Fresh API auth smoke through `http://127.0.0.1:6701/api` returned capability entitlements, and the frontend now maps them back to product shell entries.

### 2026-07-13 — Phase 3 Admin Organizations Screen

Copied the first Admin web screen using the corrected model:

- Source `apps/admin/web/src/views/admin/OrganizationsAdminPage.vue` -> target `apps/web/src/modules/admin/views/OrganizationsAdminPage.vue`.
- Source `apps/admin/web/src/services/auth-api.service.ts` -> target `apps/web/src/modules/admin/services/auth-api.service.ts`.
- Added a direct route for `/app/admin/organizations` to the copied Organizations page.
- Kept the copied page's table/modals/styles intact.
- Changed only the frontend boundary:
  - service import in the copied page points to module-local `../services/auth-api.service`;
  - copied service uses unified `VITE_API_BASE_URL=/api`;
  - copied service reads the existing unified `authToken` localStorage key.

Verification:

- `npm run build:web` — passed.
- `GET http://127.0.0.1:6701/api/admin/organizations` with a fresh token — returned `200` and real organization rows.
- In-app browser visible smoke for `/app/admin/organizations` — rendered `Organizations`, 7 visible table rows, headers `Slug`, `Name`, `Description`, `URL`, `Created`, `Actions`, one visible `OaiAppShell`, and zero visible `.platform-layout`.
- Browser-visible Playwright smoke for `/app/admin/roles` — rendered the copied `Roles & Permissions` page, showed Admin left nav labels, returned role rows from unified RBAC endpoints, and had zero `.platform-layout`.
- Browser-visible Playwright smoke for `/app/admin/users` — rendered the copied `User Management` page, showed real user rows, showed Admin left nav labels, had zero `.platform-layout`, and had no RBAC/user network failures.
- Browser-visible Playwright smoke for `/app/admin/entitlements` — rendered the copied `Entitlements` page, selected an organization, showed the product grid, showed Admin left nav labels, had zero `.platform-layout`, and had no entitlement/organization network failures.

### 2026-07-13 — Phase 3 Route-Aware Product Nav

Fixed shell behavior after user review:

- `AppShellPage.vue` now derives active product from the current `/app/...` route.
- `/app/admin/...` passes `product-slug="admin"` into `OaiAppShell`.
- `/app/admin/...` passes the copied Admin nav tree as `navItems`.
- Command/dashboard routes still use the entitlement-driven product launcher nav.

Verification:

- `npm run build:web` — passed.
- In-app browser visible smoke for `/app/admin/organizations` — product switcher label was `Admin`; left nav labels were `Organizations`, `Users`, `Roles`, `Entitlements`, `LLM Analytics`, `RAG Management`, `Agent Registry`, `Observability`, `System`, and `Data & Infrastructure`; Organizations page still rendered 7 data rows.

### 2026-07-16 — Marketing Swarm Backend Reclassified To Workflows

Moved Marketing Swarm execution code out of the unified Agents backend and into Workflows:

- Moved `apps/api/src/agents/marketing-swarm` -> `apps/api/src/workflows/marketing-swarm`.
- Removed `MarketingSwarmModule` from `apps/api/src/agents/agents.module.ts`.
- Added `MarketingSwarmModule` to `apps/api/src/workflows/workflows.module.ts`.
- Changed the controller prefix from `/marketing-swarm/...` to `/workflows/marketing-swarm/...`.
- Moved the copied Marketing Swarm web type from `apps/web/src/modules/agents/types/marketing-swarm.ts` to `apps/web/src/modules/workflows/types/marketing-swarm.ts`.
- Removed unused Marketing Swarm metadata fields from Agents conversation/message types.
- Kept the Agents catalog boundary explicit so workflow-owned slugs are not returned from `/invoke/agents`.

Verification:

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `GET http://127.0.0.1:6700/workflows/marketing-swarm/status/test-task` returned `401`, proving the workflow route is mounted behind auth.
- `GET http://127.0.0.1:6700/marketing-swarm/status/test-task` returned `404`, proving the old root route is removed.
- `rg "marketing-swarm|MarketingSwarm|marketingSwarm" apps/api/src/agents apps/web/src/modules/agents` found no Marketing Swarm implementation code under Agents; the only remaining backend reference is the catalog ownership exclusion.

### 2026-07-16 — Marketing Swarm Web Port And Run Verification

Copied and mounted the Marketing Swarm UI into the unified Workflows frontend:

- Source `apps/forge/web/src/views/agents/marketing-swarm/MarketingSwarmPage.vue` -> target `apps/web/src/modules/workflows/views/marketing-swarm/MarketingSwarmPage.vue`.
- Source `apps/forge/web/src/views/agents/marketing-swarm/components/*` -> target `apps/web/src/modules/workflows/views/marketing-swarm/components/*`.
- Source `apps/forge/web/src/stores/marketingSwarmStore.ts` -> target `apps/web/src/modules/workflows/stores/marketingSwarmStore.ts`.
- Source `apps/forge/web/src/services/marketingSwarmService.ts` -> target `apps/web/src/modules/workflows/services/marketingSwarmService.ts`.
- Added Workflows-local `llmService.ts` that reads unified `/invoke/providers-models` instead of copying the old Forge LLM service.
- Added route `/app/workflows/marketing-swarm` and Workflows left-nav entry `Marketing Swarm`.
- Removed the old Forge AgentDashboard deliverables/history dependency from the first Workflows mount.
- Changed Marketing Swarm execution start from `/invoke/stream` to `/workflows/marketing-swarm/execute`, since Marketing Swarm is no longer owned by the Agents dispatcher.
- Updated Grok provider validation to accept current Grok model names and added `grok-4.3` pricing metadata.

Verification:

- `npm run build:web` — passed.
- `npm run build:api` — passed.
- Browser verified `/app/workflows/marketing-swarm` renders inside the unified Workflows shell.
- Browser started the default Marketing Swarm run from the copied UI.
- Initial incorrect start path failed with `Agent not found: marketing-swarm`; fixed by routing execution to the Workflows API.
- Retested from the browser after the fix:
  - progress page rendered with live SSE updates;
  - queue contained 16 outputs;
  - generated content through Anthropic, OpenAI, xAI/Grok, and Ollama/Qwen defaults;
  - completed successfully with 16 outputs, 57 evaluations, 3 finalists, and final rankings;
  - browser console showed no errors during the completed run.
- API log recorded `Marketing Swarm completed: taskId=ae885fa7-74ed-4aba-b9b1-85d3f7de9d60, duration=623278ms`.
- Cleaned the local dev stack after the run so port `6700` is served by the rebuilt API process and `/health` returns `{"status":"ok","service":"platform-api"}`.

### 2026-07-16 — Marketing Swarm Workflow Boundary Cleanup

Cleaned follow-on leftovers after the Marketing Swarm workflow port:

- Removed unused copied `apps/web/src/modules/workflows/services/invoke-client.ts`, which still targeted `/invoke/stream`.
- Changed `MarketingSwarmController.execute()` to require the expected versioned deliverable output and fail loudly if the workflow completes without it.
- Renamed the Marketing Swarm module doc from agent ownership to workflow ownership.

Verification:

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `GET http://127.0.0.1:6700/marketing-swarm/status/test-task` returned `404`.
- `GET http://127.0.0.1:6700/workflows/marketing-swarm/status/test-task` returned `401`.

### 2026-07-16 — Workflows Visible Nav Cleanup

Tightened the unified Workflows module navigation after the Marketing Swarm move:

- Changed `/app/workflows` to redirect to `/app/workflows/marketing-swarm`.
- Reduced the Workflows left-nav to the visible workflow set:
  - Marketing Swarm
  - Document Onboarding
- Kept the copied Legal Department routes in place for follow-on testing without exposing the full old Forge workflow list in the module nav.

Verification:

- `npm run build:web` — passed.
- In-app browser verified `/app/workflows` redirects to `/app/workflows/marketing-swarm`.
- In-app browser DOM verified the Workflows nav candidates are `Marketing Swarm` and `Document Onboarding` only.

### 2026-07-16 — Legacy Deployable App Removal

Removed the old deployable app directories after their working code had been copied into the unified platform modules:

- Removed `apps/auth`.
- Removed `apps/admin`.
- Removed `apps/command`.
- Removed `apps/compose`.
- Removed `apps/forge`.
- Removed `apps/ambient`.
- Removed `apps/protocol-lab`.

The active `apps/` tree is now intentionally limited to:

- `apps/api`
- `apps/web`

Cleanup completed with the deletion:

- Root workspaces now reference only `apps/api`, `apps/web`, and shared packages.
- Root dev scripts now start/stop the unified platform API and web app only.
- Removed the old multi-product nginx and curl invoke scripts instead of keeping wrappers.
- Integration helpers/tests now target the unified platform API.
- Shared UI defaults no longer point at Command, Admin API, or Forge API ports.
- Remaining stale-reference scan across active `package.json`, `scripts`, `apps`, `packages`, and `tests` found no old deployable app paths or old product ports; the only `6100` match is part of a Supabase migration timestamp in a README path.

Verification:

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `bash -n scripts/dev-servers.sh && ./scripts/dev-servers.sh status` — passed; Supabase, Lightning, platform API `6700`, and platform web `6701` were running/healthy.
- `npm run test:integration:health` — passed.
- `npm run test:integration:auth` — passed.
- `npm run test:integration:admin` — passed; existing RAG collection creation warning remains tied to embedding configuration, but the admin suite passed all assertions.

### 2026-07-16 — Workflows Reduced To Marketing Swarm

Removed the copied Legal Department / Document Onboarding workflow stack from the unified platform for now:

- Removed the Legal Department workflow API tree from `apps/api/src/workflows/legal-department`.
- Removed the Legal Department workflow web tree from `apps/web/src/modules/workflows/views/legal-department`.
- Removed remaining unused Monte Carlo type artifacts from the web app.
- Removed Legal Department routes from the unified router.
- Reduced the Workflows left-nav to Marketing Swarm only.
- Removed workflow-owned Legal Department catalog handling from Agents so Marketing Swarm is the only workflow-owned slug excluded from Agents.
- Removed Legal Department model override coupling from the shared workflow LLM HTTP client.
- Updated shared examples/tests that referenced Legal Department to use Marketing Swarm examples instead.
- Fixed `scripts/dev-servers.sh` so `dev:all` starts platform API/web in detached `screen` sessions that remain running after the launcher exits.

Verification:

- Stale-reference scan across active `package.json`, `scripts`, `apps`, `packages`, and `tests` found no `legal-department`, `DocumentOnboarding`, `document-onboarding`, or Monte Carlo workflow references.
- `GET http://127.0.0.1:6700/legal-department/jobs` returned `404`.
- `GET http://127.0.0.1:6700/workflows/legal-department` returned `404`.
- `GET http://127.0.0.1:6700/workflows/document-onboarding` returned `404`.
- `GET http://127.0.0.1:6700/workflows/marketing-swarm/status/test-task` returned `401`, proving the Marketing Swarm route remains mounted behind auth.
- `./scripts/dev-servers.sh start` followed by a 25-second wait left Supabase, Lightning, platform API `6700`, and platform web `6701` healthy.
- In-app browser verified `/app/workflows/marketing-swarm` renders after login and visible workflow candidates are only `Workflows` and `Marketing Swarm`.
- `npm run build:api` — passed.
- `npm run build:web` — passed; existing `llm.store.ts` chunking warning remains.
- `npm run test:integration:health` — passed.

### 2026-07-16 — Active Stale Product Naming Cleanup

Cleaned active source paths and runtime-visible module names after the deployable app removal:

- Renamed copied Agents service code from `compose-api.service.ts` to `agents-api.service.ts`.
- Renamed the Agents pipeline page from `RunnerComposeView.vue` to `RunnerPipelineView.vue`.
- Changed the visible pipeline route from `/app/agents/compose` to `/app/agents/pipeline`.
- Renamed active Secure Conversations backend classes/files away from `Bridge*` naming:
  - database service/module/types
  - protocol service
  - invoke dispatch service
  - OpenClaw messaging/persistence services
- Changed Secure Conversations A2A routing to use current method prefixes:
  - `ambient.*`
  - `workflows.*`
  - `agents.*`
- Removed old `forge.`, `compose.`, and `pulse.` routing branches from Secure Conversations instead of leaving compatibility shims.
- Renamed active workflow shared types from `forge-types.ts` to `workflow-types.ts`.
- Removed the unused shared UI `forgeApiUrl` crawler-bubble prop.
- Updated copied examples/comments in active modules and packages to the current module names.

Intentional carry-forward:

- Persisted entitlement/data slugs such as `forge`, `compose`, `pulse`, and `bridge` remain in registry and entitlement code where they are database contracts. Those need a deliberate data migration rather than a source-only rename.
- Generic CSS animation names such as `pulse` were left alone where they are not product references.

Verification:

- Focused active-source scan across `apps/api/src`, `apps/web/src/modules`, `apps/web/src/routes`, `apps/web/src/shell`, `packages/transport-types`, `packages/planes`, and `packages/ui` found no stale active references to `RunnerComposeView`, `/app/agents/compose`, `ComposePipeline`, old A2A method prefixes, old signing env names, or old `Bridge`/`Compose`/`Forge`/`Pulse` product vocabulary. The only remaining focused hit is a generic `Pulse animation` comment in `OaiStatusDot`.
- `npm run build:api` — passed.
- `npm run build:web` — passed; existing `llm.store.ts` chunking warning remains.
- `npm run test:integration:health` — passed.
- `./scripts/dev-servers.sh stop && ./scripts/dev-servers.sh start && sleep 20 && ./scripts/dev-servers.sh status` — passed; Supabase, Lightning, platform API `6700`, and platform web `6701` were healthy.
- In-app browser verified `/app/agents/pipeline?verify=178420-cleanup` renders Build Custom Pipeline and the five copied runner types.
- In-app browser verified `/app/secure-conversations/settings?verify=178420-cleanup` renders with shell class `oai-app-shell--secure-conversations`, no console errors, and no visible `Bridge`, `Compose`, `Forge`, or `Pulse` product names.

### 2026-07-16 — Dead Legacy Shell Cleanup

Removed additional stale shell/navigation surfaces after confirming they are not used by the unified app:

- Removed dead shared UI shell files that predated `OaiAppShell`:
  - `packages/ui/layout/AppShell.vue`
  - `packages/ui/layout/SidebarNav.vue`
  - `packages/ui/layout/TopNav.vue`
  - `packages/ui/layout/StatusBar.vue`
- Removed dead copied Secure Conversations layout files:
  - `apps/web/src/modules/secure-conversations/components/layout/AppShell.vue`
  - `apps/web/src/modules/secure-conversations/components/layout/SidebarNav.vue`
  - `apps/web/src/modules/secure-conversations/components/layout/TopNav.vue`
- Renamed `BridgeJwtAuthGuard` source to `SecureConversationsJwtAuthGuard` in `packages/auth-client`.
- Updated remaining active-source comments/examples that referenced old product/module names.
- Clean-built `@orchestratorai/auth-client` so local `dist` no longer contains the old bridge guard artifact.

Verification:

- Active-source scan across `apps`, `packages`, `scripts`, `tests`, and root `package.json` found no stale old deployable app paths, old in-app product routes, old A2A method prefixes, old `BridgeJwt` names, or old product env names. Remaining matches are Docker Compose usage and generic CSS pulse animation terms.
- `npm run build:api` — passed.
- `npm run build:web` — passed; existing `llm.store.ts` chunking warning remains.
- `npm --workspace @orchestratorai/auth-client run clean && npm --workspace @orchestratorai/auth-client run build` — passed.
- `npm run test:integration:health` — passed.
- `./scripts/dev-servers.sh status` — passed; Supabase, Lightning, platform API `6700`, and platform web `6701` were healthy.
- In-app browser verified `/app/secure-conversations/settings?verify=dead-layout-cleanup` still renders through `oai-app-shell--secure-conversations`, with no console errors and no visible old product names.

### 2026-07-16 — Auth Client Folded Into Planes

Removed the extra `packages/auth-client` workspace and folded its working source into the auth plane:

- Moved auth guards, decorators, auth client service, stream token service, database provider module, and test helpers into `packages/planes/auth/client`.
- Exported the moved auth-client surface from `@orchestratorai/planes/auth`.
- Added `@orchestratorai/planes/auth/testing` as the testing helper entrypoint.
- Updated API and planes imports from `@orchestratorai/auth-client` to `@orchestratorai/planes/auth`.
- Removed `packages/auth-client` from root workspaces and `apps/api` dependencies.
- Removed `@orchestratorai/auth-client` from `apps/api/tsconfig.json` paths.
- Removed stale `packages/auth-client` lockfile entries and generated leftovers.

Runtime fix:

- `SupabaseAuthService` and `ExternalOidcAuthService` now import `InternalIdentityLinkService` directly from the moved client service path. Importing it through the auth barrel produced undefined Nest metadata at runtime.

Verification:

- Active-source scan found no remaining `@orchestratorai/auth-client`, `packages/auth-client`, `BridgeJwt`, old product method prefixes, or old product env names. Remaining focused match is the generic `Pulse animation` comment in `OaiStatusDot`.
- `npm run build:api` — passed.
- `npm --workspace @orchestratorai/planes run build` — passed.
- `npm run build:web` — passed; existing `llm.store.ts` chunking warning remains.
- `./scripts/dev-servers.sh stop && ./scripts/dev-servers.sh start && sleep 25 && ./scripts/dev-servers.sh status` — passed; Supabase, Lightning, platform API `6700`, and platform web `6701` were healthy.
- `npm run test:integration:health` — passed.
