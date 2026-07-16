# Platform Monolith Consolidation — Migration Map

**Last updated**: 2026-07-15  
**Source**: `intention.md` and Phase 0 repo inventory  
**Status**: Phase 4 non-Admin consolidation in progress; Admin copied, Compose/Agents partially copied, Forge Legal Department copied into Workflows, Pulse copied into Ambient, Bridge copied into Secure Conversations, visible module names normalized

## Target Runtime

```text
apps/
  api/
  web/

packages/
  transport-types/
  planes/
  ui/
```

Target API module names:

- `auth`
- `admin`
- `agents`
- `workflows`
- `ambient`
- `secure-conversations`
- `rag`
- `integrations`
- `invoke`
- `health`

Target web module names:

- `auth`
- `admin`
- `agents`
- `workflows`
- `ambient`
- `secure-conversations`
- `rag`
- `integrations`
- `settings`

## Root Package Inventory

Current root package:

- Name: `orchestratorai-enterprise`
- Package manager: `npm@10.2.4`

Current workspace entries that must be consolidated or removed from starter runtime:

- `apps/auth/api` -> `apps/api/src/auth`, `apps/api/src/admin`, `apps/api/src/health`, shared auth/RBAC services
- `apps/admin/api` -> `apps/api/src/admin`, `apps/api/src/rag`, `apps/api/src/health`
- `apps/admin/web` -> `apps/web/src/modules/admin`, `apps/web/src/modules/rag`, `apps/web/src/modules/settings`
- `apps/command/web` -> `apps/web/src/shell`, `apps/web/src/app`, `apps/web/src/modules/auth`
- `apps/forge/api` -> `apps/api/src/workflows`, `apps/api/src/invoke`, `apps/api/src/agents`, `apps/api/src/rag`, `apps/api/src/integrations`
- `apps/forge/web` -> `apps/web/src/modules/workflows`, with settings surfaces into `apps/web/src/modules/settings`
- `apps/compose/api` -> `apps/api/src/agents`, `apps/api/src/invoke`, `apps/api/src/rag`, `apps/api/src/integrations`
- `apps/compose/web` -> `apps/web/src/modules/agents`, with RAG surfaces into `apps/web/src/modules/rag`
- `apps/ambient/pulse`, `apps/ambient/pulse/api`, `apps/ambient/pulse/web` -> `apps/api/src/ambient`, `apps/web/src/modules/ambient`
- `apps/ambient/bridge`, `apps/ambient/bridge/api`, `apps/ambient/bridge/web` -> `apps/api/src/secure-conversations`, `apps/web/src/modules/secure-conversations`
- `apps/protocol-lab`, `apps/protocol-lab/packages/shared-types`, `apps/protocol-lab/packages/shared-protocols` -> developer/demo-only outside starter runtime; remove from starter workspaces after explicit archival or separate-effort handoff
- `packages/transport-types` -> keep authoritative
- `packages/planes` -> keep authoritative
- `packages/ui` -> keep shared UI package
- `packages/auth-client` -> review during auth consolidation; likely fold use into unified API/web auth boundaries or keep only if it remains a shared library with one clear consumer contract

Current root scripts that target old deployables:

- Keep temporarily until replacement shells verify: `dev:all`, `dev:all:gateway`, `dev:all:prod`, `dev:stop`, `dev:stop:gateway`, `dev:stop:prod`
- Replace with primary starter scripts: `dev:api`, `dev:web`, `build:api`, `build:web`
- Remove after migration: `dev:auth`, `dev:admin:api`, `dev:admin:web`, `dev:forge:api`, `dev:forge:web`, `dev:compose:api`, `dev:compose:web`, `dev:pulse:api`, `dev:pulse:web`, `dev:bridge:api`, `dev:bridge:web`, `dev:command`
- Remove from starter runtime after Protocol Lab disposition is applied: `dev:protocol-lab`, `dev:protocol-lab:web`, `dev:protocol-lab:api`
- Retarget integration scripts after unified API exists: `test:integration:auth`, `test:integration:health`, `test:integration:forge`, `test:integration:compose`, `test:integration:admin`, `test:integration:pulse`, `test:integration:bridge`

Phase 2 platform script update:

- `dev:api` now runs `apps/api` on platform port `6700`.
- `dev:web` now runs `apps/web` on platform port `6701`.
- `build:api` and `build:web` target the unified apps.
- Ports `6700` and `6701` are new platform ports, not old product compatibility wrappers.

Phase 2 copied-code ledger:

- Source `apps/auth/api/src/auth` -> target `apps/api/src/auth`.
- Source `apps/auth/api/src/rbac` -> target `apps/api/src/rbac`.
- Source `apps/command/web/src/views/DashboardPage.vue` -> target `apps/web/src/modules/auth/DashboardPage.vue`.
- Source `apps/command/web/src/views/LoginPage.vue` -> target `apps/web/src/modules/auth/LoginPage.vue`.
- Source `apps/command/web/src/views/AccessDeniedPage.vue` -> target `apps/web/src/modules/auth/AccessDeniedPage.vue`.
- Source `apps/command/web/src/{composables,directives,services,stores,types,utils}` -> target `apps/web/src/{composables,directives,services,stores,types,utils}`.

Phase 2 adaptation notes:

- Entitlements now describe platform capabilities and unified in-app routes, not old product web URLs.
- `secure-conversations` replaces old Bridge naming in route/capability slugs.
- Visible module naming uses the unified platform language: Compose -> Agents, Forge -> Workflows, Pulse -> Ambient, Bridge -> Secure Conversations. Existing legacy product slugs remain only where they are entitlement/data keys during migration.
- Copied unused files with stale old-port references were removed from the unified web slice.
- Phase 2 removed copied auth re-export shims and direct old app aliases from the unified auth path.
- Root Supabase migration now owns the `authz` schema grants required by unified auth.

Phase 3 copied-code ledger:

- Source `apps/admin/web/src/components/AdminShell.vue` management navigation -> target `apps/web/src/modules/admin/routes.ts`.
- Source `apps/admin/web/src/components/AdminShell.vue` management navigation -> target `apps/web/src/modules/admin/AdminModule.vue` card surface.
- Source `apps/admin/web/src/components/AdminShell.vue` RAG management navigation -> target `apps/web/src/modules/rag/routes.ts`.
- Source `apps/admin/web/src/components/AdminShell.vue` RAG management navigation -> target `apps/web/src/modules/rag/RagModule.vue` card surface.
- Source `apps/admin/web/src/components/AdminShell.vue` LLM, Observability, System, and Data & Infrastructure navigation -> target `apps/web/src/modules/settings/routes.ts`.
- Source `apps/admin/web/src/components/AdminShell.vue` LLM, Observability, System, and Data & Infrastructure navigation -> target `apps/web/src/modules/settings/SettingsModule.vue` card surface.
- Source `apps/admin/web/src/views/admin/SystemHealthPage.vue` -> target `apps/web/src/modules/settings/SystemHealthPage.vue`.
- Target route wiring added in `apps/web/src/routes/index.ts` for `/admin/...`, `/rag/...`, and `/settings/...` subroutes.

Phase 3 adaptation notes:

- Old `/app/admin/...` paths are represented as unified in-app `/admin/...`, `/rag/...`, and `/settings/...` paths.
- API prefixes are unified API-relative prefixes, not product web base URLs.
- `SystemHealthPage.vue` is the first copied live page behind these route surfaces. It uses the shared platform API client and unified `/health` endpoint instead of the legacy Admin API health aggregator.
- Dev browser API routing is explicit: `VITE_API_BASE_URL=/api` for browser code and `VITE_API_PROXY_TARGET=http://127.0.0.1:6700` for Vite proxying.
- This slice does not claim full Admin/RAG/Settings page migration. Remaining legacy page components, stores, and API-backed workflows still need to be copied behind these route surfaces.
- No old product-port proxies, compatibility wrappers, or fallback route paths were added.

Phase 3 shell correction:

- Main frontend shell must remain the copied Command `OaiAppShell` frontend, not a new platform capability-list shell.
- Removed simplified `PlatformShell`, `CapabilitySwitcher`, and the rewritten Organizations frontend page from `apps/web`.
- Unified product navigation uses original product concepts in the shell and maps them to in-app module routes:
  - Compose -> `/app/agents`
  - Forge -> `/app/workflows`
  - Pulse -> `/app/ambient`
  - Bridge -> `/app/secure-conversations`
  - Admin -> `/app/admin/organizations`
  - Protocol Lab -> `/app/protocol-lab`
- `VITE_MONOLITH_MODE=true` makes `packages/ui` product switching use those in-app routes instead of old localhost product ports.
- Future frontend work should copy product app folders/pages literally first, then adapt imports, in-app routes, and `/api` calls.

Phase 3 Admin Organizations copied-code ledger:

- Source `apps/auth/api/src/admin/organizations/organizations.controller.ts` -> target `apps/api/src/admin/organizations/organizations.controller.ts`.
- Source `apps/auth/api/src/admin/organizations/organizations.service.ts` -> target `apps/api/src/admin/organizations/organizations.service.ts`.
- Source `apps/auth/api/src/admin/organizations/organizations.module.ts` -> target `apps/api/src/admin/organizations/organizations.module.ts`.
- Source `apps/admin/web/src/views/admin/OrganizationsAdminPage.vue` -> target `apps/web/src/modules/admin/views/OrganizationsAdminPage.vue`.
- Source `apps/admin/web/src/services/auth-api.service.ts` -> target `apps/web/src/modules/admin/services/auth-api.service.ts`.
- Source `apps/admin/web/src/views/admin/UserManagementPage.vue` -> target `apps/web/src/modules/admin/views/UserManagementPage.vue`.
- Source `apps/admin/web/src/services/userManagementService.ts` -> target `apps/web/src/modules/admin/services/userManagementService.ts`.
- Source `apps/admin/web/src/views/admin/RoleManagementPage.vue` -> target `apps/web/src/modules/admin/views/RoleManagementPage.vue`.
- Source `apps/admin/web/src/views/admin/EntitlementsAdminPage.vue` -> target `apps/web/src/modules/admin/views/EntitlementsAdminPage.vue`.
- Source `apps/admin/web/src/stores/orgs.store.ts` -> target `apps/web/src/modules/admin/stores/orgs.store.ts`.
- Source `apps/auth/api/src/entitlements/entitlements.controller.ts` -> target `apps/api/src/auth/entitlements/entitlements.controller.ts`.
- Source `apps/auth/api/src/entitlements/entitlements.service.ts` -> target `apps/api/src/auth/entitlements/entitlements.service.ts`.
- Source `apps/auth/api/src/entitlements/entitlements.module.ts` -> target `apps/api/src/auth/entitlements/entitlements.module.ts`.

Phase 3 Admin Organizations adaptation notes:

- Backend import adaptation uses `@orchestratorai/planes/database` directly through the existing global database plane.
- Backend delete organization now propagates the agent-dependency check failure instead of logging and continuing.
- Frontend service uses unified `VITE_API_BASE_URL=/api`.
- Frontend service reads the existing unified `authToken` localStorage key for the copied Axios interceptor.
- `/app/admin/organizations` renders the copied page inside the restored Command shell.
- `/app/admin/users` renders the copied User Management page inside the restored Command shell.
- `/app/admin/roles` renders the copied Roles & Permissions page inside the restored Command shell.
- `/app/admin/entitlements` renders the copied Entitlements page inside the restored Command shell.
- The copied Roles page uses the existing copied unified RBAC store/service and calls the unified RBAC API module through the platform web `/api` proxy.
- The copied Users service preserves the Admin app method contract but uses a module-local Axios client pointed at unified `VITE_API_BASE_URL=/api`.
- The visible Users password-reset action is backed by `POST /auth/password-reset` in the unified Auth controller.
- Root migration `supabase/migrations/20260713150000_grant_demo_user_global_admin.sql` aligns local demo data with Admin UI expectations by granting `demo-user@orchestratorai.io` global `super-admin`.
- The copied Entitlements API lives under the unified Auth module at the same route shape: `/auth/admin/organizations/:orgSlug/entitlements`.
- The Entitlements backend import was adapted from the old app-local database alias to `@orchestratorai/planes/database`.

Phase 3 Admin remaining screens copied-code ledger:

- Source `apps/admin/web/src/views/admin/LlmUsagePage.vue` -> target `apps/web/src/modules/admin/views/LlmUsagePage.vue`.
- Source `apps/admin/web/src/views/admin/LlmModelsPage.vue` -> target `apps/web/src/modules/admin/views/LlmModelsPage.vue`.
- Source `apps/admin/web/src/views/admin/LlmCostsPage.vue` -> target `apps/web/src/modules/admin/views/LlmCostsPage.vue`.
- Source `apps/admin/web/src/views/admin/RagCollectionsPage.vue` -> target `apps/web/src/modules/admin/views/RagCollectionsPage.vue`.
- Source `apps/admin/web/src/views/admin/RagCollectionDetailPage.vue` -> target `apps/web/src/modules/admin/views/RagCollectionDetailPage.vue`.
- Source `apps/admin/web/src/views/admin/AgentRegistryPage.vue` -> target `apps/web/src/modules/admin/views/AgentRegistryPage.vue`.
- Source `apps/admin/web/src/views/admin/AgentDetailPage.vue` -> target `apps/web/src/modules/admin/views/AgentDetailPage.vue`.
- Source `apps/admin/web/src/views/admin/ObservabilityDashboardPage.vue` -> target `apps/web/src/modules/admin/views/ObservabilityDashboardPage.vue`.
- Source `apps/admin/web/src/views/admin/ObservabilityEventsPage.vue` -> target `apps/web/src/modules/admin/views/ObservabilityEventsPage.vue`.
- Source `apps/admin/web/src/views/admin/SystemConfigPage.vue` -> target `apps/web/src/modules/admin/views/SystemConfigPage.vue`.
- Source `apps/admin/web/src/views/admin/McpAdminPage.vue` -> target `apps/web/src/modules/admin/views/McpAdminPage.vue`.
- Source `apps/admin/web/src/views/admin/DatabaseAdminPage.vue` -> target `apps/web/src/modules/admin/views/DatabaseAdminPage.vue`.
- Source `apps/admin/web/src/services/admin-api.service.ts` -> target `apps/web/src/modules/admin/services/admin-api.service.ts`.
- Source `apps/admin/web/src/stores/llm-analytics.store.ts` -> target `apps/web/src/modules/admin/stores/llm-analytics.store.ts`.
- Source `apps/admin/web/src/stores/rag.store.ts` -> target `apps/web/src/modules/admin/stores/rag.store.ts`.
- Source `apps/admin/web/src/stores/agents-admin.store.ts` -> target `apps/web/src/modules/admin/stores/agents-admin.store.ts`.
- Source `apps/admin/web/src/stores/observability.store.ts` -> target `apps/web/src/modules/admin/stores/observability.store.ts`.
- Source `apps/admin/web/src/components/rag/FolderTreeSelector.vue` -> target `apps/web/src/modules/admin/components/rag/FolderTreeSelector.vue`.
- Source `apps/admin/web/src/components/rag/FolderTreeNode.vue` -> target `apps/web/src/modules/admin/components/rag/FolderTreeNode.vue`.
- Source `apps/admin/api/src/llm-analytics/*` -> target `apps/api/src/admin/llm-analytics/*`.
- Source `apps/admin/api/src/rag-management/*` -> target `apps/api/src/admin/rag-management/*`.
- Source `apps/admin/api/src/agent-registry/*` -> target `apps/api/src/admin/agent-registry/*`.
- Source `apps/admin/api/src/observability/*` -> target `apps/api/src/admin/observability/*`.
- Source `apps/auth/api/src/admin/system-config/*` -> target `apps/api/src/admin/system-config/*`.
- Source `apps/admin/api/src/database-admin/*` -> target `apps/api/src/admin/database-admin/*`.
- Source `apps/admin/api/src/claude-pane/*` -> target `apps/api/src/admin/claude-pane/*`.

Phase 3 Admin remaining screens adaptation notes:

- Frontend copied service `admin-api.service.ts` now points at `${VITE_API_BASE_URL || '/api'}/admin` and uses the unified `authToken` storage key.
- Copied Admin pages now use module-local relative imports instead of Admin app aliases.
- Copied Admin API controllers now use the unified `JwtAuthGuard`, `RbacGuard`, and `RequirePermission` decorator.
- Copied Admin API services inject `DATABASE_SERVICE` from `@orchestratorai/planes/database`.
- `RagManagementModule` imports `ExtractorsModule` from `@orchestratorai/planes/extractors`; this fixed the copied `DocumentProcessorService` dependency root cause without adding a fallback.
- `McpAdminPage.vue` now points at unified `/api/admin/mcp`. The original Admin API did not include a matching backend module, so the unified API owns a narrow JSON-RPC MCP admin endpoint instead of retaining `/mcp-api`.
- `/app/admin/system/health` intentionally routes to the unified single-platform health page. The literal legacy Admin health page reports old product ports and is not part of the starter runtime route surface.
- `OaiAppShell` receives `admin-api-url="/api"` from the unified shell so the copied Claude pane API is used through `/api/admin/claude-pane` instead of old port `6150`.
- Direct routes now exist for `/app/admin/llm/usage`, `/app/admin/llm/models`, `/app/admin/llm/costs`, `/app/admin/rag`, `/app/admin/rag/:id`, `/app/admin/agents`, `/app/admin/agents/:slug`, `/app/admin/observability`, `/app/admin/observability/events`, `/app/admin/system`, `/app/admin/system/health`, `/app/admin/mcp`, and `/app/admin/database`.

Phase 4 Forge Legal Department copied-code ledger:

- Source `apps/forge/api/src/agents/legal-department/*` -> target `apps/api/src/workflows/legal-department/*`.
- Source `apps/forge/api/src/agents/shared/*` -> target `apps/api/src/workflows/shared/*`.
- Source `apps/forge/web/src/views/agents/legal-department/*` -> target `apps/web/src/modules/workflows/views/legal-department/*`.
- Source `apps/forge/web/src/types/monte-carlo.types.ts` -> target `apps/web/src/modules/types/monte-carlo.types.ts` and `apps/web/src/types/monte-carlo.types.ts`.

Phase 4 Forge Legal Department adaptation notes:

- Copied controllers use unified `JwtAuthGuard`, `RbacGuard`, and `RequirePermission` from `apps/api/src/auth` and `apps/api/src/rbac`.
- Copied shared workflow services are imported through `SharedServicesModule` and `PersistenceModule` in the unified `WorkflowsModule`.
- The copied Legal Department API route shape remains `/legal-department/...` inside the single unified API. This is not an old-port proxy; it is the copied controller mounted in `apps/api`.
- Copied Workflows UI uses `/app/workflows/legal-department/...` in-app routes instead of old `/app/agents/legal-department/...` and `/forge/agents/legal-department/...` paths.
- Copied Workflows UI uses the unified `/api` base instead of `/api/forge`.
- The restored `OaiAppShell` now shows Workflows-specific left nav entries when active route starts with `/app/workflows`.
- `legal-department` remains hidden from the Compose/Agents catalog; it is now represented as the Workflows/Forge module.
- Copied job enqueue now writes `workflow_slug` because the local monolith `legal.agent_jobs` schema requires it.
- Copied Legal workflow ExecutionContext defaults were updated from old Ollama/Gemma names to current `anthropic` / `claude-sonnet-4-6`.
- Copied route-name references were aligned with the unified router for Due Diligence comparison, Sentinel, and Matters.
- Copied Compliance Audit framework seeding now points at `src/workflows/legal-department/workflows/compliance-audit/framework-sources`.
- Copied framework collections from Forge were applied to local RAG using the current monolith `complexity_type='comprehensive'`, then seeded with 43 framework markdown documents.
- Copied Sentinel portfolio RAG collection creation now uses `comprehensive` to match the current RAG schema.
- Copied Monte Carlo UI/API contract now sends `metadata.jobType='monte-carlo-trial-simulator'` and case-record JSON content directly; backend no longer overrides the context model with hardcoded `gemma4:26b`.
- Copied Matters API DTOs now match the copied web service's flat payload shape, and matter document upload persists the generated document id used by facts/docs ingest jobs.

Phase 4 Forge Legal Department execution-smoke ledger:

- Document Onboarding, Contract Review, Legal Research, Due Diligence, Adversarial Brief, Discovery Review, Compliance Audit, Portfolio Sentinel, Monte Carlo Trial, Matters, and Deal Memo were run through the unified API.
- HITL resume paths were verified for Document Onboarding, Contract Review, Legal Research, Due Diligence, Adversarial Brief, Discovery Review batch review, Compliance Audit, and Deal Memo.
- Browser-visible route sweep passed for all copied Workflows routes under `/app/workflows/legal-department`.

Phase 4 Pulse/Ambient copied-code ledger:

- Source `apps/ambient/pulse/api/src/ambient-database/*` -> target `apps/api/src/ambient/ambient-database/*`.
- Source `apps/ambient/pulse/api/src/automation-context/*` -> target `apps/api/src/ambient/automation-context/*`.
- Source `apps/ambient/pulse/api/src/event-bus/*` -> target `apps/api/src/ambient/event-bus/*`.
- Source `apps/ambient/pulse/api/src/executions/*` -> target `apps/api/src/ambient/executions/*`.
- Source `apps/ambient/pulse/api/src/invoke/*` -> target `apps/api/src/ambient/invoke/*`.
- Source `apps/ambient/pulse/api/src/listeners/*` -> target `apps/api/src/ambient/listeners/*`.
- Source `apps/ambient/pulse/api/src/scenarios/*` -> target `apps/api/src/ambient/scenarios/*`.
- Source `apps/ambient/pulse/api/src/services/*` -> target `apps/api/src/ambient/services/*`.
- Source `apps/ambient/pulse/api/src/streaming/*` -> target `apps/api/src/ambient/streaming/*`.
- Source `apps/ambient/pulse/api/src/triggers/*` -> target `apps/api/src/ambient/triggers/*`.
- Source `apps/ambient/pulse/api/src/workflows/*` -> target `apps/api/src/ambient/workflows/*`.
- Source `apps/ambient/pulse/api/src/well-known/*` -> target `apps/api/src/ambient/well-known/*`.
- Source `apps/ambient/pulse/web/src/views/*` -> target `apps/web/src/modules/ambient/views/*`.
- Source `apps/ambient/pulse/web/src/stores/*` -> target `apps/web/src/modules/ambient/stores/*`.
- Source `apps/ambient/pulse/web/src/composables/*` -> target `apps/web/src/modules/ambient/composables/*`.

Phase 4 Pulse/Ambient adaptation notes:

- Old standalone Pulse app bootstrap, auth, RBAC, and health modules were not copied into the unified API.
- Copied Ambient controllers are mounted under `/ambient/...`.
- Copied Ambient web views are mounted under `/app/ambient/...`.
- Copied frontend API/SSE clients now call `/api/ambient/...`.
- The shared monolith product switcher still uses the existing `pulse` entitlement slug, but displays the product as Ambient and routes to `/app/ambient`.
- Copied trigger execution was changed from old Forge/Compose port calls to unified in-process `InvokeDispatchService`.
- Copied system-triggered execution now uses `createSystemTriggeredContext()`.
- Copied trigger repository now normalizes the current `ambient.triggers` schema (`trigger_kind`, `trigger_config`, `response_kind`, `response_config`) into the copied module shape. No old `product='pulse'` discriminator was added.
- The public discovery card is now `/ambient/.well-known/agent.json` and returns Ambient metadata without old ports.

Phase 4 Pulse/Ambient verification ledger:

- `npm run build:api` — passed.
- `npm run build:web` — passed.
- Authenticated Ambient endpoint smoke passed for listeners, workflows, triggers, executions, and scenarios.
- Temporary Ambient trigger create/delete smoke passed.
- File listener simulation endpoint returned accepted.
- In-app browser route sweep passed for Ambient Dashboard, Listeners, Workflows, Triggers, Executions, Scenarios, Scenario Detail, and Event Stream.
- Event Stream connected to `/api/ambient/streaming/events`.

## API App Inventory

### Auth API

Source: `apps/auth/api`

Current notable modules/controllers:

- `auth` — login, signup, logout, refresh, `me`, token validation, entitlements, permissions, authorization checks, admin user endpoints
- `admin/organizations` — organization CRUD and stats
- `admin/system-config` — system config endpoints
- `entitlements` — organization entitlement grant/revoke
- `rbac` — roles, permissions, role assignment, permission checks, audit
- `teams` — team and membership management
- `super-admin` — command execution and health tools
- `system` — health, analytics, global model config, planes
- `config` — feature flags and sovereign routing
- `health` — health, DB, Supabase, DB config checks
- `database` — current product-local database access to review against `packages/planes`

Target mapping:

- `apps/api/src/auth`: auth/session/token/RBAC guard surface, organizations under auth where user-context related, teams
- `apps/api/src/admin`: super-admin, admin organizations, system config, user/role administration surfaces
- `apps/api/src/health`: health endpoints
- `apps/api/src/settings`: no API module in target; settings behavior should live under `admin`, `auth`, or `integrations` depending on ownership
- `packages/planes`: any provider-specific database/config/auth access must be behind planes or an accepted shared package boundary

### Admin API

Source: `apps/admin/api`

Current notable modules/controllers:

- `agent-registry` -> agent catalog/admin registry
- `claude-pane` -> admin command/skill execution
- `database-admin` -> database health/config/tables/migrations
- `llm-analytics` -> usage, reasoning, model, cost endpoints
- `observability` -> metrics and events
- `rag-management` -> RAG collections/documents/chunks management
- `system-config` -> admin system config and health
- `health`
- `common/product-client.service.ts` -> likely old product API client; must not become fallback proxy glue
- `database`, `observability` directories -> product-local infrastructure risk to remove or route through planes

Target mapping:

- `apps/api/src/admin`: agent registry, database admin, LLM analytics, observability admin, system config, command pane if retained
- `apps/api/src/rag`: RAG management collections/documents/chunks
- `apps/api/src/health`: health
- Delete or rewrite `common/product-client.service.ts` as direct module service calls; do not retain product API proxying

### Forge API

Source: `apps/forge/api`

Current notable modules/controllers:

- `agents/legal-department` — legal workflows, job lifecycle, SSE events, document onboarding, contract review, research, due diligence, discovery, compliance audit, sentinel, matters, monte carlo, deal memo
- `agents/marketing-swarm` — Marketing Swarm workflow; target is `apps/api/src/workflows/marketing-swarm`, not the unified Agents module
- `agents/cad-agent`, `agents/data-analyst`, `agents/extended-post-writer`, `agents/business-automation-advisor`
- `invoke` — capability registry, discovery, invoke
- `agent-registry`
- `analytics`
- `assets`
- `customer-service`
- `engineering`
- `marketing`
- `rag`
- `rbac`
- `system`
- `webhooks`
- `health`

Target mapping:

- `apps/api/src/workflows`: LangGraph and HITL workflow modules, legal department workflows, job/event surfaces
- `apps/api/src/agents`: non-workflow agent registry and agent metadata where not tied to LangGraph job execution
- `apps/api/src/invoke`: unified invoke endpoint and capability dispatch
- `apps/api/src/rag`: RAG controllers/services
- `apps/api/src/integrations`: webhooks, customer-service integrations, external adapters
- `apps/api/src/admin`: analytics/system model config if admin-owned
- `apps/api/src/health`: health

Contract requirements:

- Preserve `ExecutionContext` whole through every LLM/service call.
- Keep `@orchestratorai/transport-types` as the source for invoke and output types.
- Keep infrastructure behind `packages/planes`; do not migrate product-local provider imports into the unified app.

### Compose API

Source: `apps/compose/api`

Current notable modules/controllers:

- `invoke` — providers/models, agents, conversations, messages, invoke, stream
- `runners` and `invoke/runners` — simple runner families
- `rag` and `rag-storage` — collections, documents, query, QA, internal query
- `crawler`
- `mcp`
- `speech`
- `assets`
- `analytics`
- `customer-service`
- `auth`, `rbac`, `system`, `config`, `health`

Target mapping:

- `apps/api/src/agents`: simple agents, runner families, conversations
- `apps/api/src/invoke`: shared `invoke` and streaming invoke transport
- `apps/api/src/rag`: RAG collections/documents/query/QA/crawler storage where RAG-owned
- `apps/api/src/integrations`: MCP, speech, crawler source integrations, assets if not RAG-owned
- `apps/api/src/admin`: analytics/system config where admin-owned
- `apps/api/src/auth`: duplicated product auth/RBAC behavior should be removed in favor of unified auth module
- `apps/api/src/health`: health

### Pulse API

Source: `apps/ambient/pulse/api`

Current notable modules/controllers:

- `automation-context`
- `event-bus`
- `executions`
- `listeners`
- `services` — trigger evaluator/executor
- `triggers`
- `workflows`
- `scenarios`
- `streaming`
- `well-known`
- `invoke`
- `auth`, `rbac`, `config`, `health`
- `ambient-database` and `database` — infrastructure review required

Target mapping:

- `apps/api/src/ambient`: automation context, event bus, listeners, triggers, executions, ambient workflow registry/executor, scenarios, streaming
- `apps/api/src/invoke`: Pulse invoke dispatch if still exposed through platform invoke
- `apps/api/src/auth`: remove duplicated auth/RBAC controllers or route them to unified auth ownership
- `apps/api/src/health`: health
- `packages/planes`: database/provider access

### Bridge API

Source: `apps/ambient/bridge/api`

Current notable modules/controllers:

- `inbound` — A2A receiver, messages, router, validator
- `outbound` — A2A sender and broadcast
- `registry` — external agent registry
- `security` — origin validation, rate limit, signing
- `messaging` — router, persistence, OpenClaw, Telegram and WhatsApp webhooks
- `protocol`
- `streaming`
- `training`
- `well-known`
- `invoke`
- `database`
- `health`

Target mapping:

- `apps/api/src/secure-conversations`: inbound/outbound A2A, registry, security, messaging, protocol, streaming, training, well-known agent metadata
- `apps/api/src/invoke`: bridge dispatch through unified invoke only where needed
- `apps/api/src/integrations`: Telegram/WhatsApp webhooks and other external channel adapters
- `apps/api/src/health`: health
- `packages/transport-types`: JSON-RPC 2.0 `invoke` and A2A contract types remain authoritative

Naming rule:

- Customer/runtime module name is `secure-conversations`.
- A2A remains transport/protocol language inside the module, not the product/app name.

## Web App Inventory

### Command Web

Source: `apps/command/web`

Current notable routes/components/services:

- Public routes: `/`, `/features`, `/pricing`, `/about`, `/whats-possible`, `/login`
- Authenticated routes: `/app`, `/app/dashboard`
- Product prefixes currently treated as separate apps: `/forge/`, `/compose/`, `/pulse/`, `/bridge/`, `/admin/`, `/protocol-lab/`
- `components/product-launcher/ProductLauncher.vue`
- `components/navigation/AppNavigation.vue`
- Auth/RBAC/entitlements services and stores

Target mapping:

- `apps/web/src/app`: app bootstrap
- `apps/web/src/shell`: shell layout, navigation, capability switcher, dashboard
- `apps/web/src/modules/auth`: login and auth-facing views
- `apps/web/src/shared`: shared auth/RBAC/token utilities and API client integration

Required change:

- Replace forced product-prefix full-page navigation with in-app capability routes.

### Admin Web

Source: `apps/admin/web`

Current notable routes:

- `/app/admin/organizations`
- `/app/admin/users`
- `/app/admin/roles`
- `/app/admin/entitlements`
- `/app/admin/system`
- `/app/admin/llm/usage`
- `/app/admin/llm/models`
- `/app/admin/llm/costs`
- `/app/admin/rag`
- `/app/admin/rag/:id`
- `/app/admin/agents`
- `/app/admin/agents/:slug`
- `/app/admin/observability`
- `/app/admin/observability/events`
- `/app/admin/mcp`
- `/app/admin/database`
- `/app/admin/system/health`

Target mapping:

- `apps/web/src/modules/admin`: organizations, users, roles, entitlements, system config, LLM analytics, observability, database, MCP, agent registry
- `apps/web/src/modules/rag`: RAG collection detail and document management surfaces
- `apps/web/src/modules/settings`: system/model/settings surfaces if moved out of admin navigation
- `apps/web/src/shared`: common components, auth utilities, token storage

### Compose Web

Source: `apps/compose/web`

Current notable routes/components/services:

- `/app/agents`
- `/app/agents/:agentSlug/conversation`
- `/app/compose`
- `/app/home`
- `/app/welcome`
- `/app/organization`
- Agent list/chat/conversation components
- Runner selector and pipeline components
- RAG components
- LLM selector, speech, deliverables, conversation services
- Existing `agent2AgentConversationsService.ts` and `agent2agent/legacy-types.ts` need secure-conversations review

Target mapping:

- `apps/web/src/modules/agents`: agent list, conversation, runners, chat, deliverables
- `apps/web/src/modules/rag`: RAG sources/document viewer and RAG admin-facing user surfaces
- `apps/web/src/modules/settings`: LLM selector/model preferences where platform-wide
- `apps/web/src/modules/secure-conversations`: anything truly A2A/secure-conversation-specific after contract review
- `apps/web/src/shared`: shared API client, auth, token, common components

### Forge Web

Source: `apps/forge/web`

Current notable routes/components:

- `/app/agents`
- `/app/agents/marketing-swarm` -> `/app/workflows/marketing-swarm`
- `/app/agents/:orgSlug/marketing-swarm` -> `/app/workflows/marketing-swarm`
- `/app/agents/:orgSlug/marketing-swarm/tasks/:taskId` -> `/app/workflows/marketing-swarm/tasks/:taskId`
- `/app/agents/legal-department`
- `/app/agents/legal-department/document-onboarding`
- `/app/agents/legal-department/contract-review`
- `/app/agents/legal-department/legal-research`
- `/app/agents/legal-department/due-diligence`
- `/app/agents/legal-department/compare`
- `/app/agents/legal-department/dd/:parentJobId/memo/:memoJobId`
- `/app/agents/legal-department/adversarial-brief`
- `/app/agents/legal-department/discovery-review`
- `/app/agents/legal-department/compliance-audit`
- `/app/agents/legal-department/sentinel`
- `/app/agents/legal-department/monte-carlo`
- `/app/agents/legal-department/matters`
- `/app/agents/legal-department/matters/:matterId`
- `/app/agents/legal-department/settings`
- `/app/agents/cad-agent`
- `/app/agents/:orgSlug/cad-agent`

Target mapping:

- `apps/web/src/modules/workflows`: legal department workflow workspaces, marketing swarm, CAD, data analyst, HITL/job/SSE components, workflow dashboard route entries
- `apps/web/src/modules/settings`: legal model/settings pages where platform settings-owned
- `apps/web/src/modules/agents`: agent index if it becomes the shared capability catalog rather than workflow-specific
- `apps/web/src/shared`: charts, common components, LLM controls, auth/RBAC utilities

### Pulse Web

Source: `apps/ambient/pulse/web`

Current routes:

- `/`
- `/triggers`
- `/executions`
- `/listeners`
- `/workflows`
- `/scenarios`
- `/scenarios/:id`
- `/stream`

Target mapping:

- `apps/web/src/modules/ambient`: dashboard, triggers, executions, listeners, ambient workflows, scenarios, stream
- `apps/web/src/shared`: common shell integrations and API client

### Bridge Web

Source: `apps/ambient/bridge/web`

Current routes:

- `/login`
- `/`
- `/registry`
- `/registry/agents/:id`
- `/inbound`
- `/outbound`
- `/security`
- `/observability`
- `/observability/topology`
- `/observability/timeline`
- `/observability/metrics`
- `/observability/audit`
- `/scenarios`
- `/demo`
- `/matrix`
- `/protocol-compare`
- `/settings`

Target mapping:

- `apps/web/src/modules/secure-conversations`: home, registry, inbound, outbound, security, observability, scenarios, demo/training, matrix/protocol compare when retained as in-product education, module settings
- `apps/web/src/modules/auth`: remove Bridge-local login in favor of unified auth
- `apps/web/src/shared`: shared auth/token and API client

## Protocol Lab Disposition

Current source: `apps/protocol-lab`

Current shape:

- Root package: `@orchestratorai/protocol-lab`
- Frontend package: `@agent-communication/frontend`
- Protocol API package: `@agent-communication/protocol-api`
- Multiple demo apps: research hub, market pulse, content forge, agent consumer, Prairie Ridge, Buildwell
- Local scripts include a many-service demo runtime and optional Lightning demo infrastructure

Disposition for this effort:

- Developer/demo-only outside starter runtime.
- Do not migrate Protocol Lab into `apps/web` or `apps/api` during the starter-platform consolidation.
- Do not silently keep Protocol Lab root scripts/workspaces in the starter runtime.
- Preserve or archive it through an explicit later action:
  - archive under docs/demo material,
  - move to a separate workspace outside starter runtime,
  - or create a future Protocol Lab effort if product decides to retain it.

Rationale:

- The intention requires one deployable web app and one deployable API app for the starter platform.
- Protocol Lab currently models a multi-service communication playground and demo suite, which conflicts with the starter runtime unless intentionally scoped as developer tooling.

## Old Ports And Route Prefixes

Current old ports:

- `6100` Auth API
- `6101` Admin Web
- `6102` Command Web
- `6200` Forge API
- `6201` Forge Web
- `6300` Compose API
- `6301` Compose Web
- `6500` Pulse API
- `6501` Pulse Web
- `6600` Bridge API
- `6601` Bridge Web

Primary old-port owners:

- `scripts/dev-servers.sh` loads all old ports and old gateway prefixes.
- Root `package.json` exposes product-specific dev scripts.
- Product package configs and Vite/Nest configs may define per-app defaults.
- Integration tests under `tests/integration` use product-specific port helpers.
- Product-local testing docs and scripts contain hard-coded old ports.

Current old route prefixes:

- Gateway/product prefixes: `/forge`, `/compose`, `/pulse`, `/bridge`, `/admin`, `/protocol-lab`
- Product-local app routes commonly begin with `/app/...`
- API prefixes vary by product and controller, including `auth`, `api/rbac`, `api/rag`, `admin/*`, `invoke`, `a2a`, `registry`, `triggers`, `workflows`, `legal-department`, and agent-specific prefixes.

Target routing direction:

- Web capability routes:
  - `/dashboard`
  - `/agents`
  - `/workflows`
  - `/ambient`
  - `/secure-conversations`
  - `/admin`
  - `/rag`
  - `/settings`
- API module prefixes should align to capability ownership:
  - `/auth`
  - `/admin`
  - `/agents`
  - `/workflows`
  - `/ambient`
  - `/secure-conversations`
  - `/rag`
  - `/integrations`
  - `/invoke`
  - `/health`

Old ports and product prefixes must be removed from starter code/docs after unified verification. Do not add old-port wrappers.

## Tests Inventory

Root integration tests:

- `tests/integration/00-prerequisites.spec.ts`
- `tests/integration/01-auth.spec.ts`
- `tests/integration/02-health.spec.ts`
- `tests/integration/03-forge.spec.ts`
- `tests/integration/04-compose.spec.ts`
- `tests/integration/06-admin.spec.ts`
- `tests/integration/07-pulse.spec.ts`
- `tests/integration/08-bridge.spec.ts`
- `tests/integration/helpers/ports.ts`

Target mapping:

- Rewrite integration helpers around unified API/web runtime.
- Preserve behavioral coverage by capability, but rename test groups to target modules as they migrate:
  - auth
  - health
  - workflows
  - agents
  - admin
  - ambient
  - secure-conversations
  - rag

Product-local tests:

- Keep relevant unit tests with migrated modules.
- Delete or archive tests that only prove old deployable wiring after replacement tests exist.
- Retarget browser/e2e tests to unified `apps/web`.

## Structural Risks Found In Inventory

- Product-local infrastructure directories exist today, including `database`, `observability`, `ambient-database`, and related provider-specific code. Migration must route infrastructure through `packages/planes`.
- Multiple products duplicate auth/RBAC controllers and guards. Unified auth must remove duplication rather than proxy between products.
- Command router currently forces full-page navigation for product prefixes. This must become in-app capability routing.
- Product web apps each own token/auth/API clients. Migration needs one shared API client and one auth/session source in `apps/web/src/shared`.
- Bridge web has its own login/token check. This must fold into unified auth.
- Admin API has a `product-client.service.ts`, which is a likely old-product boundary/proxy point. It must be removed or rewritten as direct module service composition.
- Existing code contains known timeout/fallback-style comments in router/auth areas. Future implementation must root-cause these rather than carrying fallback behavior into the unified shell.

## Phase 1 Inputs

Create shells without moving full behavior:

- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/health`
- Placeholder API modules for auth/admin/agents/workflows/ambient/secure-conversations/rag/integrations/invoke
- `apps/web/src/app`
- `apps/web/src/shell`
- `apps/web/src/modules/*`
- `apps/web/src/shared/services/api-client.ts`
- Capability route registry and endpoint registry
- Placeholder routes for dashboard, agents, workflows, ambient, secure conversations, admin, rag, settings

Do not remove old deployables until Phase 7 after unified verification.

## Phase 4 RAG Module Promotion

Copied-code ledger:

- Source `apps/api/src/admin/rag-management/*` -> target `apps/api/src/rag/*`.
- Source `apps/web/src/modules/admin/views/RagCollectionsPage.vue` -> target `apps/web/src/modules/rag/views/RagCollectionsPage.vue`.
- Source `apps/web/src/modules/admin/views/RagCollectionDetailPage.vue` -> target `apps/web/src/modules/rag/views/RagCollectionDetailPage.vue`.
- Source `apps/web/src/modules/admin/stores/rag.store.ts` -> target `apps/web/src/modules/rag/stores/rag.store.ts`.
- Source `apps/web/src/modules/admin/components/rag/*` -> target `apps/web/src/modules/rag/components/rag/*`.
- New module-local web service: `apps/web/src/modules/rag/services/rag-api.service.ts`.

Adaptation notes:

- RAG backend route ownership moved from `/admin/rag/...` to `/rag/...`.
- `apps/api/src/rag/rag.module.ts` imports `RagStorageModule` from `@orchestratorai/planes/rag`; the RAG plane remains authoritative.
- The duplicate Admin RAG backend module was removed after `/rag/...` was verified.
- Admin no longer owns RAG frontend pages, store, folder upload components, or RAG API methods.
- Admin navigation links to `/app/rag/collections`, and stale `/app/admin/rag` routes redirect into the RAG module.
- The RAG module owns `/app/rag/collections` and `/app/rag/collections/:id`.
- Agents-side RAG helper reads collections, documents, and chunks through `/api/rag/...`.

## Phase 4 Settings Web Ownership

Copied-code ledger:

- Source `apps/web/src/modules/admin/views/LlmUsagePage.vue` -> target `apps/web/src/modules/settings/views/LlmUsagePage.vue`.
- Source `apps/web/src/modules/admin/views/LlmModelsPage.vue` -> target `apps/web/src/modules/settings/views/LlmModelsPage.vue`.
- Source `apps/web/src/modules/admin/views/LlmCostsPage.vue` -> target `apps/web/src/modules/settings/views/LlmCostsPage.vue`.
- Source `apps/web/src/modules/admin/views/ObservabilityDashboardPage.vue` -> target `apps/web/src/modules/settings/views/ObservabilityDashboardPage.vue`.
- Source `apps/web/src/modules/admin/views/ObservabilityEventsPage.vue` -> target `apps/web/src/modules/settings/views/ObservabilityEventsPage.vue`.
- Source `apps/web/src/modules/admin/views/SystemConfigPage.vue` -> target `apps/web/src/modules/settings/views/SystemConfigPage.vue`.
- Source `apps/web/src/modules/admin/views/McpAdminPage.vue` -> target `apps/web/src/modules/settings/views/McpAdminPage.vue`.
- Source `apps/web/src/modules/admin/views/DatabaseAdminPage.vue` -> target `apps/web/src/modules/settings/views/DatabaseAdminPage.vue`.
- Source `apps/web/src/modules/admin/stores/llm-analytics.store.ts` -> target `apps/web/src/modules/settings/stores/llm-analytics.store.ts`.
- Source `apps/web/src/modules/admin/stores/observability.store.ts` -> target `apps/web/src/modules/settings/stores/observability.store.ts`.
- Source `apps/web/src/modules/admin/services/admin-api.service.ts` -> target `apps/web/src/modules/settings/services/settings-api.service.ts`.

Adaptation notes:

- Settings web routes now own the operational screens under `/app/settings/...`.
- Old Admin operational routes redirect into Settings.
- Admin web service now owns only the remaining Agent Registry methods.
- Settings service still calls guarded `/api/admin/...` endpoints where the backend capability is administrative by nature.
- The dead legacy Admin multi-product health page and store were removed; visible health remains the unified platform health page.
