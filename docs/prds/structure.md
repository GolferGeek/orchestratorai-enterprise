# OrchestratorAI Enterprise — Structure PRD

## Overview

Build the directory structure for OrchestratorAI Enterprise — a production-grade, multi-product AI platform. This PRD covers the full lifecycle: directory structure, file cleanup, Claude Code tooling, parallel product specialization, integration, and final database consolidation.

**Current repo note:** The standalone Flow product (`apps/flow`) was removed from the monorepo. Task/productivity data may still live in the `orch_flow` schema for other consumers; this PRD still mentions historical migration steps where they clarify how the repo was split.

**Location**: `/Users/golfergeek/projects/golfergeek/orchestratorai/orchestratorai-enterprise/`

**Sibling**: The current Orchestrator AI v2 repo remains at `/Users/golfergeek/projects/golfergeek/orchestratorai/orchestrator-ai/` as reference material.

**NOTE**: The current repo must be moved from `orchestrator-ai/` (under `golfergeek/`) to `orchestratorai/orchestrator-ai/` (under the new parent org directory) before or during Phase 1.

---

## Brand & Products

**Company/Platform**: OrchestratorAI (no space)

| Product | Purpose | Has API | Has Web |
|---------|---------|---------|---------|
| **Command** | Navigation shell, routing to products based on entitlements | No | Yes (Vue) |
| **Auth** | Standalone auth service — login, logout, token refresh, permissions, entitlements. Every product calls Auth's HTTP endpoints. | Yes | No |
| **Admin** | Web UI for managing orgs, users, roles, entitlements, system config. Calls Auth API. | No | Yes (Vue) |
| **Forge** | Complex agent dashboards — marketing swarm, legal dept, finance, risk, predictor, CAD | Yes | Yes (Vue) |
| **Compose** | Simple composable agents — context, RAG, orchestrator composition | Yes | Yes (Vue) |
| **Pulse** | Internal ambient automation — event-driven, watches databases/files/systems. Includes built-in training/help and guided scenarios. | Yes | Yes (Vue) |
| **Bridge** | External A2A communication — inbound/outbound agent conversations. Includes built-in training/help and guided scenarios. | Yes | Yes (Vue) |
| **Assistant** | Personal AI assistant per employee — skills, cron jobs, personal automation. **Placeholder only** — being built separately (Obsidian, local files, RAG, OpenClaw). Code dropped in later. | TBD | TBD |

**NOTE**: Sandbox was removed as a separate product. Training, help documentation, guided scenarios, and learning modes are built directly into Pulse and Bridge. Every deployment is self-documenting.

**NOTE**: Auth is a standalone API service, not a library/package. Every product authenticates by calling Auth's HTTP endpoints. Admin is the web UI for managing what Auth serves. They share the 6100 port block (Auth API on 6100, Admin web on 6101).

**NOTE**: Inter-product communication uses A2A protocol. Products are mostly independent — they don't call each other directly. Exceptions: Assistant may need to reach multiple products on behalf of a user.

**NOTE**: Supabase is always local. No SaaS version.

**NOTE**: Monorepo uses Turborepo for build orchestration.

| Package | Purpose |
|---------|---------|
| **transport-types** | Shared types, ExecutionContext, A2A contracts, JSON-RPC 2.0 |
| **planes** | Provider planes — LLM, storage, multi-cloud abstraction |
| **ui** | Shared Vue component library — extracted from agent-communication frontend (sharper look). All products import from here for visual consistency. |

---

## Phase 1: Build the Directory Structure

### 1.1 Create the Parent Org Directory

```
mkdir -p /Users/golfergeek/projects/golfergeek/orchestratorai
```

Move the current repo under it:
```
mv /Users/golfergeek/projects/golfergeek/orchestrator-ai \
   /Users/golfergeek/projects/golfergeek/orchestratorai/orchestrator-ai
```

### 1.2 Create the Enterprise Directory Structure

```
orchestratorai-enterprise/
  apps/
    command/
      web/
    auth/
      api/                  # standalone auth service
    admin/
      web/                  # web UI for managing auth/org/users (calls Auth API)
    ambient/
      core/
      pulse/
        api/
        web/
      bridge/
        api/
        web/
    forge/
      api/
      web/
    compose/
      api/
      web/
    assistant/              # placeholder — code dropped in later
  packages/
    transport-types/
    planes/
    ui/                     # shared Vue component library (extracted from agent-communication)
```

### 1.3 Copy Strategy — What Goes Where

Each product starts as a copy of a working system, then gets specialized later (not in this phase).

#### Source: `apps/api` (NestJS backend)

The current monolith API gets copied into every product that needs a backend:

| Target | Copy `apps/api` to | Later specialization (not this phase) |
|--------|-------------------|---------------------------------------|
| Auth | `apps/auth/api/` | Strip to auth endpoints only — login, logout, token refresh, permissions, entitlements |
| Forge | `apps/forge/api/` | Strip to complex agent runners (marketing swarm, legal dept, CAD, risk, predictor) |
| Compose | `apps/compose/api/` | Strip to simple agent runners (context, RAG) + orchestrator composition |

#### Source: `apps/web` (Vue 3 + Ionic frontend)

The current monolith web app gets copied into products that need a frontend:

| Target | Copy `apps/web` to | Later specialization (not this phase) |
|--------|-------------------|---------------------------------------|
| Command | `apps/command/web/` | Strip to navigation shell, routing frame, entitlements-based menu |
| Admin | `apps/admin/web/` | Strip to admin views (org management, users, roles, config). Calls Auth API for all auth operations. |
| Forge | `apps/forge/web/` | Strip to complex agent dashboard views |
| Compose | `apps/compose/web/` | Strip to simple agent conversation/composition views |

#### Source: `apps/agent-communication` (Protocol playground)

The full agent-communication app (Vue SPA + 4 NestJS backends + shared-protocols) gets copied twice:

| Target | Copy `apps/agent-communication` to | Later specialization (not this phase) |
|--------|--------------------------------------|---------------------------------------|
| Pulse | `apps/ambient/pulse/` | Rewire to internal event sources, strip external-facing pieces, add built-in training/help |
| Bridge | `apps/ambient/bridge/` | Harden external A2A protocol, production security, add built-in training/help |

#### Source: `apps/agent-communication/shared-protocols` (or relevant shared code)

| Target | Copy shared protocol code to | Purpose |
|--------|------------------------------|---------|
| Core | `apps/ambient/core/` | Shared protocol abstractions, messaging patterns, security envelope, trust |

#### Source: `apps/transport-types`

| Target | Copy `apps/transport-types` to | Notes |
|--------|-------------------------------|-------|
| transport-types | `packages/transport-types/` | Move from apps/ to packages/ |

#### Source: Extract from `apps/api`

| Target | Extract from | Notes |
|--------|-------------|-------|
| planes | `apps/api/src/` (provider planes) | Shared LLM/storage abstraction |

#### Source: Extract from `apps/agent-communication` frontend

| Target | Extract from | Notes |
|--------|-------------|-------|
| ui | `apps/agent-communication/frontend/src/components/` | Shared Vue component library — sharper look than apps/web |

### 1.4 Port Assignments

All ports defined in the root `.env` file. Dev ports use 6xxx, production mirrors at 7xxx.

Each product gets a 100-block. API on the even hundred, web on +1.

| Product | API Port (dev) | Web Port (dev) | API Port (prod) | Web Port (prod) |
|---------|---------------|----------------|-----------------|-----------------|
| Command | — | 6000 | — | 7000 |
| Auth | 6100 | — | 7100 | — |
| Admin | — | 6101 | — | 7101 |
| Forge | 6200 | 6201 | 7200 | 7201 |
| Compose | 6300 | 6301 | 7300 | 7301 |
| Ambient Core | — | — | — | — |
| Pulse | 6500 | 6501 | 7500 | 7501 |
| Bridge | 6600 | 6601 | 7600 | 7601 |
| Assistant | 6800 | 6801 | 7800 | 7801 |

**Supabase**: REST (Kong) on **54321**, Postgres on **54322** (shared across all products; see root `supabase/config.toml`).

### 1.5 Environment Files

Environment configuration is split across multiple files. The Dockerfiles are cloud-agnostic — they just read env vars at runtime. What makes a deployment local vs Azure vs GCP is which env files you feed it.

#### File Layout

```
orchestratorai-enterprise/
  .env                    # local dev (6xxx ports, localhost URLs)
  .env.azure              # Azure deployment (7xxx ports, Azure URLs)
  .env.gcp                # GCP deployment (7xxx ports, GCP URLs)
  .env.secrets            # local secrets — API keys, JWT (gitignored)
  .env.secrets.azure      # Azure secrets (gitignored)
  .env.secrets.gcp        # GCP secrets (gitignored)
  .env.example            # template with placeholder values (committed)
```

All `.env.secrets*` files are gitignored. The `.env.example` is committed as a template.

#### .env (Local Development)

```env
# =============================================================================
# OrchestratorAI Enterprise — Local Development
# =============================================================================

# --- Database (shared Supabase) ---
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321

# --- Command (web only) ---
COMMAND_WEB_PORT=6000

# --- Auth (API only) ---
AUTH_API_PORT=6100
AUTH_API_URL=http://localhost:6100

# --- Admin (web only, calls Auth API) ---
ADMIN_WEB_PORT=6101

# --- Forge ---
FORGE_API_PORT=6200
FORGE_WEB_PORT=6201
FORGE_API_URL=http://localhost:6200

# --- Compose ---
COMPOSE_API_PORT=6300
COMPOSE_WEB_PORT=6301
COMPOSE_API_URL=http://localhost:6300

# --- Pulse (Ambient Internal) ---
PULSE_API_PORT=6500
PULSE_WEB_PORT=6501
PULSE_API_URL=http://localhost:6500

# --- Bridge (Ambient External) ---
BRIDGE_API_PORT=6600
BRIDGE_WEB_PORT=6601
BRIDGE_API_URL=http://localhost:6600

# --- Assistant (Personal) ---
ASSISTANT_API_PORT=6800
ASSISTANT_WEB_PORT=6801
ASSISTANT_API_URL=http://localhost:6800

# --- Auth (all products call these endpoints) ---
JWT_EXPIRATION=3600
```

#### .env.secrets (Local — gitignored)

```env
# =============================================================================
# OrchestratorAI Enterprise — Local Secrets (GITIGNORED)
# =============================================================================

SUPABASE_ANON_KEY=<key>
SUPABASE_SERVICE_ROLE_KEY=<key>
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>
OPENROUTER_API_KEY=<key>
JWT_SECRET=<secret>
STRIPE_SECRET_KEY=<key>
STRIPE_WEBHOOK_SECRET=<key>
```

#### .env.azure (Azure Deployment)

```env
# =============================================================================
# OrchestratorAI Enterprise — Azure Deployment
# =============================================================================

# --- Database ---
DATABASE_URL=postgresql://<user>:<pass>@<azure-db-host>:5432/orchestratorai
SUPABASE_URL=https://supabase.orchestratorai.io

# --- Product URLs (Azure endpoints) ---
COMMAND_WEB_PORT=7000
AUTH_API_PORT=7100
AUTH_API_URL=https://auth-api.orchestratorai.io
ADMIN_WEB_PORT=7101
FORGE_API_PORT=7200
FORGE_WEB_PORT=7201
FORGE_API_URL=https://forge-api.orchestratorai.io
COMPOSE_API_PORT=7300
COMPOSE_WEB_PORT=7301
COMPOSE_API_URL=https://compose-api.orchestratorai.io
PULSE_API_PORT=7500
PULSE_WEB_PORT=7501
PULSE_API_URL=https://pulse-api.orchestratorai.io
BRIDGE_API_PORT=7600
BRIDGE_WEB_PORT=7601
BRIDGE_API_URL=https://bridge-api.orchestratorai.io
ASSISTANT_API_PORT=7800
ASSISTANT_WEB_PORT=7801
ASSISTANT_API_URL=https://assistant-api.orchestratorai.io

JWT_EXPIRATION=3600
```

#### .env.gcp (GCP Deployment)

Same structure as `.env.azure` but with GCP URLs and endpoints.

#### Docker Usage

```bash
# Local full-stack testing
docker compose --env-file .env --env-file .env.secrets up

# Azure deployment
docker compose --env-file .env.azure --env-file .env.secrets.azure up

# GCP deployment
docker compose --env-file .env.gcp --env-file .env.secrets.gcp up
```

### 1.6 Docker Configuration

Each product gets one cloud-agnostic Dockerfile. The Dockerfile does NOT know about Azure, GCP, or local — it just builds the app and reads env vars at runtime.

#### Dockerfile Per Product

```
apps/
  command/
    web/Dockerfile
  auth/
    api/Dockerfile
  admin/
    web/Dockerfile
  ambient/
    pulse/
      api/Dockerfile
      web/Dockerfile
    bridge/
      api/Dockerfile
      web/Dockerfile
  forge/
    api/Dockerfile
    web/Dockerfile
  compose/
    api/Dockerfile
    web/Dockerfile
  assistant/
    api/Dockerfile
    web/Dockerfile
```

#### Root Docker Compose

A single `docker-compose.yml` at the repo root defines all services:

```yaml
# docker-compose.yml — all products + Supabase
services:
  # --- Command ---
  command-web:
    build: ./apps/command/web
    ports: ["${COMMAND_WEB_PORT}:${COMMAND_WEB_PORT}"]

  # --- Auth ---
  auth-api:
    build: ./apps/auth/api
    ports: ["${AUTH_API_PORT}:${AUTH_API_PORT}"]

  # --- Admin ---
  admin-web:
    build: ./apps/admin/web
    ports: ["${ADMIN_WEB_PORT}:${ADMIN_WEB_PORT}"]

  # --- Forge ---
  forge-api:
    build: ./apps/forge/api
    ports: ["${FORGE_API_PORT}:${FORGE_API_PORT}"]
  forge-web:
    build: ./apps/forge/web
    ports: ["${FORGE_WEB_PORT}:${FORGE_WEB_PORT}"]

  # --- Compose ---
  compose-api:
    build: ./apps/compose/api
    ports: ["${COMPOSE_API_PORT}:${COMPOSE_API_PORT}"]
  compose-web:
    build: ./apps/compose/web
    ports: ["${COMPOSE_WEB_PORT}:${COMPOSE_WEB_PORT}"]

  # --- Pulse ---
  pulse-api:
    build: ./apps/ambient/pulse/api
    ports: ["${PULSE_API_PORT}:${PULSE_API_PORT}"]
  pulse-web:
    build: ./apps/ambient/pulse/web
    ports: ["${PULSE_WEB_PORT}:${PULSE_WEB_PORT}"]

  # --- Bridge ---
  bridge-api:
    build: ./apps/ambient/bridge/api
    ports: ["${BRIDGE_API_PORT}:${BRIDGE_API_PORT}"]
  bridge-web:
    build: ./apps/ambient/bridge/web
    ports: ["${BRIDGE_WEB_PORT}:${BRIDGE_WEB_PORT}"]

  # --- Assistant ---
  assistant-api:
    build: ./apps/assistant/api
    ports: ["${ASSISTANT_API_PORT}:${ASSISTANT_API_PORT}"]
  assistant-web:
    build: ./apps/assistant/web
    ports: ["${ASSISTANT_WEB_PORT}:${ASSISTANT_WEB_PORT}"]
```

The env file you pass in determines the ports and URLs. Same compose file, different env files = different deployment targets.

### 1.7 Root Configuration Files

Copy from the current repo and adapt:

| File | Source | Notes |
|------|--------|-------|
| `package.json` | Current repo | Update name to `orchestratorai-enterprise`, update workspace paths |
| `tsconfig.json` | Current repo | Update paths for new structure |
| `nx.json` or workspace config | Current repo if exists | Update project references |
| `.gitignore` | Current repo | Adapt as needed |
| `.prettierrc` | Current repo | Copy as-is |
| `.eslintrc` | Current repo | Copy as-is |
| `CLAUDE.md` | Current repo | Update for new structure |

### 1.8 Execution Steps (Phase 1)

1. Create parent org directory: `orchestratorai/`
2. Move current repo: `orchestrator-ai/` → `orchestratorai/orchestrator-ai/`
3. Create `orchestratorai-enterprise/` with full directory tree
4. Copy `apps/api` → into each product API directory (Auth, Forge, Compose)
5. Copy `apps/web` → into each product web directory (Command, Admin, Forge, Compose)
6. Copy `apps/agent-communication` → into Pulse and Bridge
7. Extract shared-protocols → into `apps/ambient/core/`
8. Copy `apps/transport-types` → into `packages/transport-types/`
9. Extract provider planes from `apps/api` → into `packages/planes/`
10. Extract Vue components from `apps/agent-communication` frontend → into `packages/ui/`
11. Create root `.env` (local dev), `.env.azure`, `.env.gcp` with all port assignments and URLs
12. Create root `.env.secrets` template (gitignored)
13. Create root `.env.example` (committed, placeholder values)
14. Create root `docker-compose.yml` with all services
15. Create Dockerfile in each product's api/ and web/ directories
16. Copy and adapt root config files (package.json, tsconfig, etc.)
17. Add `.env.secrets*` to `.gitignore`
18. Verify the directory tree matches the spec

**Do NOT**: Initialize git, remove code, rename internal references, or update imports. That comes later.

---

## Phase 2: Clean Start Audit

After Phase 1 is complete, audit the entire file tree for a clean enterprise starting point.

### 2.1 Files to Evaluate for Removal

Walk every file in `orchestratorai-enterprise/` and categorize:

| Category | Action | Examples |
|----------|--------|---------|
| **Test files** | Evaluate — many will be irrelevant after specialization | `*.spec.ts`, `*.test.ts`, `__tests__/` |
| **PRDs** | Remove — these belong to the old repo | `docs/PRDs/` (except this enterprise folder) |
| **Plans** | Remove — old plans don't apply | `docs/plans/`, `*.plan.json` |
| **Scripts** | Evaluate individually — keep useful ones, remove old automation | `scripts/`, `*.sh` |
| **Docs** | Evaluate — remove stale docs, keep relevant architecture docs | `docs/` |
| **Intentions** | Remove — old unattended work items | `.intentions/` |
| **Monitoring artifacts** | Remove — will be regenerated | `monitoring/`, `*.report.json` |
| **Temp/generated files** | Remove | `dist/`, `node_modules/`, `.cache/`, coverage reports |
| **Docker files** | Evaluate — will need rewriting for new port scheme | `Dockerfile`, `docker-compose.yml` |
| **CI/CD** | Evaluate — will need rewriting | `.github/`, `.gitlab-ci.yml` |
| **Memory/Claude config** | Remove — new project, new context | `.claude/` project-specific files |

### 2.2 Scripts Audit

For every script file found, determine:
1. **What does it do?** — One-line description
2. **Is it still relevant?** — Does it apply to the new structure?
3. **Keep, adapt, or remove?**

### 2.3 Root-Level File Inventory

Every file at the root of `orchestratorai-enterprise/` must be intentional:

**Expected root files:**
- `.env` — environment configuration
- `.env.example` — template (no secrets)
- `.gitignore`
- `.prettierrc`
- `.eslintrc.js`
- `package.json`
- `tsconfig.json`
- `CLAUDE.md` — updated for new structure
- `README.md` — product overview

**Nothing else at root** unless explicitly justified.

### 2.4 Execution Steps (Phase 2)

1. Generate full file tree of `orchestratorai-enterprise/`
2. Walk every directory and file, categorize per the table above
3. Present findings for approval before deleting anything
4. Remove approved files
5. Verify each product's directory contains only relevant code
6. Create `.env.example` from `.env` (with placeholder values)
7. Update root `package.json` with correct workspace references
8. Verify the tree is clean and intentional

---

## Phase 3: Claude Code Rebuild

Build specialized Claude Code tooling for the new enterprise structure. Each product gets its own agent with dedicated skills and context.

### 3.1 Archive Existing Claude Code

1. Move everything in `.claude/` to `.claude/archive/`
2. Start fresh with a new `.claude/` structure
3. Pull forward only what's relevant to the new enterprise products

### 3.2 Specialized Agents Per Product

Each product gets at minimum:

| Product | Vue Agent | NestJS Agent | Domain Agent |
|---------|-----------|--------------|--------------|
| Command | command-web-agent | — | — |
| Auth | — | auth-api-agent | auth-entitlements-agent |
| Admin | admin-web-agent | — | — |
| Forge | forge-web-agent | forge-api-agent | forge-dashboard-agent |
| Compose | compose-web-agent | compose-api-agent | compose-orchestration-agent |
| Pulse | pulse-web-agent | pulse-api-agent | pulse-triggers-agent |
| Bridge | bridge-web-agent | bridge-api-agent | bridge-protocol-agent |
| Assistant | — (placeholder) | — (placeholder) | — (placeholder) |

### 3.3 Shared Skills

Cross-cutting skills that all agents use:

| Skill | Purpose |
|-------|---------|
| execution-context-skill | ExecutionContext capsule pattern (carried forward) |
| transport-types-skill | A2A protocol compliance (carried forward) |
| auth-skill | Shared auth/entitlements patterns (new) |
| planes-skill | Provider planes patterns (carried forward) |
| enterprise-architecture-skill | Overall monorepo conventions (new) |

### 3.4 Shared Commands

| Command | Purpose |
|---------|---------|
| `/commit` | Commit with quality checks (adapted for new structure) |
| `/test` | Run tests for a specific product |
| `/scan-errors` | Scan a specific product for errors |
| `/fix-errors` | Fix errors in a specific product |

### 3.5 Product-Level CLAUDE.md

Each product directory gets its own `CLAUDE.md` that defines:
- What the product does
- What files belong to it
- Its port assignments
- Its architecture pattern
- What to keep vs what to strip (for Phase 4)

### 3.6 Execution Steps (Phase 3)

1. Archive existing `.claude/` → `.claude/archive/`
2. Create new `.claude/` structure with `agents/`, `skills/`, `commands/`
3. Build shared skills (execution-context, transport-types, auth, planes, enterprise-architecture)
4. Build shared commands (commit, test, scan-errors, fix-errors)
5. Build specialized agents for each product (web + api + domain)
6. Write product-level `CLAUDE.md` for each of the 9 products
7. Write root `CLAUDE.md` for the enterprise monorepo
8. Verify each agent can be invoked and has correct context

---

## Phase 4: Parallel Specialization

9 agents run simultaneously, each carving their product down from the full copy to only what that product needs.

### 4.1 Agent Assignments

Each product agent receives:
- Its product's `CLAUDE.md` (what to keep, what to strip)
- Its port assignments
- Its domain context (what this product does)

Each agent executes:
1. Read the product CLAUDE.md for strip/keep guidance
2. Remove modules, components, routes, and services that don't belong
3. Update `package.json` name and dependencies
4. Update port references to use the product's assigned ports
5. Update import paths for shared packages (auth, transport-types, planes, ui)
6. Ensure the product builds cleanly (`npm run build`)
7. Ensure the product starts on its assigned port
8. Run any remaining relevant tests

### 4.2 Product-Specific Specialization Notes

| Product | Key Stripping Work |
|---------|-------------------|
| **Command** | Strip all business logic, keep only navigation shell + routing + entitlements check (calls Auth API). Loads other product UIs. |
| **Auth** | Strip everything except auth endpoints — login, logout, token refresh, permissions, entitlements. Sector/sector_id must remain in org model for demos. |
| **Admin** | Strip all API code (web only). Keep org/user/role management views. All operations call Auth API. |
| **Forge** | Keep `agents/` directory (all LangGraph workflows). Move risk runner and prediction runner INTO `agents/` as LangGraph graphs. Strip all simple runners (those go to Compose). Keep conversation/task/ExecutionContext infrastructure. Dashboards can be coded differently but MUST use planes correctly (LLM, database, observability). **CRITICAL**: (1) Every LangGraph agent MUST have an A2A endpoint — some older dashboards call LangGraph directly without A2A wrappers. Fix all of them. (2) Every agent MUST use the observability plane consistently — older agents may have custom logging or skip observability entirely. All LLM calls, agent executions, and token usage must flow through the observability plane for consistent tracing. (3) Strip all auth logic (login, logout, user/org CRUD) — those moved to Auth service. Token validation only, by calling Auth API. |
| **Compose** | Keep 5 runner types ONLY: context, RAG, API, external, image/media. Strip `agents/` directory entirely (those go to Forge). Keep conversation/task/ExecutionContext infrastructure. Orchestrator composition layer chains runners together. Clean boundary: if it needs a LangGraph graph, it goes to Forge. Strip all auth logic — token validation only, by calling Auth API. |
| **Pulse** | Rewire agent-communication to internal event sources, strip external protocols, add built-in training/help. **CRITICAL**: Agent-communication apps don't use SSE or the observability plane the same way as the main API. Must align: (1) SSE streaming for agent responses, (2) observability plane for consistent tracing, (3) ensure A2A implementation matches platform standard, not a parallel implementation. |
| **Bridge** | Harden external A2A, strip internal automation, production security, add built-in training/help. **Same alignment as Pulse**: SSE streaming, observability plane, platform-standard A2A. |
| **Assistant** | Placeholder — skip in Phase 4. Code dropped in later from separate project. |

### 4.3 Pulse & Bridge Demo Architecture

Both Pulse (internal) and Bridge (external) follow the same four-step live demo pattern:

**Step 1 — Starter Agent**: A specialized agent that kicks off the scenario
- Inserts a database row
- Drops a file in a watched folder
- Sends an A2A message
- Hits an external API

**Step 2 — Ambient Trigger**: Detects the event and fires a workflow
- Database watcher catches the new row
- File watcher catches the new document
- A2A listener catches the inbound message

**Step 3 — Agent Workflow**: Does real work
- Processes the data, makes decisions
- Calls real services (Stripe, Lightning, external APIs)

**Step 4 — Verifiable Outcome**: Proves real work happened with receipts
- Stripe charge or invoice created (show the receipt)
- Lightning payment sent/received from crypto vault (show the transaction hash)
- File placed in a specific location (show the file)
- Database row updated with results (show the row)

**This is not a simulation.** The demo runs real services, real money moves, real files are created. The verification step is what differentiates OrchestratorAI from every other AI platform demo.

### 4.4 Execution Steps (Phase 4)

1. Launch 7 parallel agents (one per product)
2. Each agent strips its product per the CLAUDE.md guidance
3. Each agent verifies build + start on correct ports
4. Collect results — which products build clean, which need fixes
5. Fix any cross-product issues (shared package imports, etc.)
6. Verify all 8 products can start simultaneously without port conflicts

---

## Phase 5: Integration

Wire everything together so the products work as a cohesive suite.

### 5.1 Auth + Entitlements

1. Auth API (`apps/auth/api/`) is the single auth service — all products call its HTTP endpoints
2. Admin web (`apps/admin/web/`) provides the UI for managing orgs, users, roles, entitlements
3. Command reads entitlements from Auth API to show/hide product navigation
4. All product APIs validate tokens by calling Auth API endpoints
5. SSO — single login works across all products (shared JWT/cookie issued by Auth)

### 5.2 Transport Types + A2A Compliance Audit

1. `packages/transport-types/` is the single source of truth for all inter-product communication
2. **AUDIT FIRST**: Do not assume existing A2A implementations are fully compliant. Before wiring products together, audit every A2A endpoint across all products against the JSON-RPC 2.0 spec and transport types contract:
   - Request format: `{ jsonrpc: "2.0", id, method: "mode.action", params: { context, mode, userMessage, payload } }`
   - Response format: `{ jsonrpc: "2.0", id, result: { success, mode, payload: { content, metadata }, context } }`
   - ExecutionContext passed whole, never destructured
   - Metadata + payload separation (content = business result, metadata = observability)
   - SSE streaming compliance where applicable
3. Fix any non-compliant endpoints before integration
4. The agent-communication protocol playground may have its own A2A flavor — reconcile with platform standard

### 5.3 Provider Planes

1. `packages/planes/` provides LLM and storage abstraction for all products
2. Each product API imports planes for LLM access
3. Single configuration point in root `.env`

### 5.4 Command Shell Integration

1. Command web loads other product UIs (micro-frontend or lazy routes)
2. Each product web can also run standalone on its own port
3. Navigation reflects entitlements — users only see products they have access to

### 5.5 Execution Steps (Phase 5)

1. Verify Auth API endpoints work and all products can authenticate against them
2. Verify `packages/transport-types/` imports resolve in all products
3. Verify `packages/planes/` imports resolve in all products
4. Wire Command shell to load product UIs
5. Test SSO flow — login once, access multiple products
6. Test entitlements — restrict product access per org
7. Test A2A communication between products (e.g., Forge agent calls Compose agent)
8. Full integration smoke test — start all 9 products + Supabase, verify end-to-end

---

## Phase 6: Supabase Pristine

After all products are working and integrated, create the definitive database schema.

### 6.1 Schema Consolidation

1. Audit all Supabase schemas used across products: `public`, `prediction`, `crawler`, `risk`, `marketing`, `orch_flow`
2. Determine which schemas belong to which products
3. Add new schemas/tables as needed (e.g., `entitlements` table for Auth)
4. Remove unused tables from the old monolith

### 6.2 Seed File

Create a single, comprehensive seed file:

1. **Schema creation** — all tables, indexes, RLS policies, functions
2. **Reference data** — roles, default entitlements, system configuration
3. **Development seed data** — sample org, users, agents for local development

### 6.3 Migration Strategy

1. Document the migration path from old schema to new
2. Create migration scripts for existing deployments
3. Verify seed file creates a working database from scratch

### 6.4 Execution Steps (Phase 6)

1. Audit all existing migrations and schema files across products
2. Consolidate into a single `supabase/` directory at the repo root
3. Create `supabase/schema.sql` — the complete schema definition
4. Create `supabase/seed.sql` — reference + development data
5. Test: drop database, run schema.sql, run seed.sql, start all products
6. Verify every product can read/write its data correctly
7. Document per-product schema ownership (which product owns which tables)

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Parent org directory exists at `orchestratorai/`
- [ ] Current repo moved to `orchestratorai/orchestrator-ai/`
- [ ] Enterprise repo exists at `orchestratorai/orchestratorai-enterprise/`
- [ ] All 8 products have their directories with copied source code
- [ ] All 3 packages have their directories with extracted/copied code (transport-types, planes, ui)
- [ ] `apps/ambient/core/` contains shared protocol abstractions
- [ ] Root `.env` exists with all port assignments (6xxx dev, 7xxx prod)
- [ ] Root config files (package.json, tsconfig, etc.) are present and adapted
- [ ] Directory tree matches the spec exactly

### Phase 2 Complete When:
- [ ] Every file in the repo has been audited
- [ ] Test files evaluated — irrelevant ones removed
- [ ] Old PRDs, plans, intentions removed
- [ ] Scripts audited — each one explicitly kept or removed
- [ ] Root-level files are clean and intentional
- [ ] `.env.example` exists with placeholder values
- [ ] No stale docs, monitoring artifacts, or generated files remain
- [ ] The repo feels like a fresh, intentional enterprise product — not a fork of an old project

### Phase 3 Complete When:
- [ ] Existing `.claude/` archived
- [ ] New `.claude/` structure with agents, skills, commands
- [ ] Shared skills built (execution-context, transport-types, auth, planes, enterprise-architecture)
- [ ] Shared commands built (commit, test, scan-errors, fix-errors)
- [ ] Each product has specialized agents (web + api + domain)
- [ ] Each product has its own `CLAUDE.md` with strip/keep guidance
- [ ] Root `CLAUDE.md` updated for enterprise monorepo
- [ ] All agents can be invoked and have correct context

### Phase 4 Complete When:
- [ ] All 8 products have been stripped to their specialized code
- [ ] Each product's `package.json` has correct name and dependencies
- [ ] Each product uses its assigned ports
- [ ] Each product imports shared packages correctly
- [ ] Each product builds cleanly (`npm run build`)
- [ ] Each product starts on its assigned port
- [ ] All 8 products can run simultaneously without port conflicts

### Phase 5 Complete When:
- [ ] Auth API service works and all products can authenticate against it
- [ ] `packages/transport-types/` imports resolve everywhere
- [ ] `packages/planes/` imports resolve everywhere
- [ ] Command shell loads product UIs via micro-frontend or lazy routes
- [ ] SSO works — single login across all products
- [ ] Entitlements work — product access restricted per org
- [ ] A2A communication works between products
- [ ] Full smoke test passes — all 8 products + Supabase running end-to-end

### Phase 6 Complete When:
- [ ] All schemas audited and ownership assigned per product
- [ ] Single `supabase/schema.sql` defines the complete database
- [ ] Single `supabase/seed.sql` provides reference + development data
- [ ] Fresh database (drop, schema, seed) works with all products
- [ ] Every product reads/writes its data correctly
- [ ] Migration path documented for existing deployments
- [ ] Per-product schema ownership documented
