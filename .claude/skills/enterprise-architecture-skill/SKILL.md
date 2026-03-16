---
name: enterprise-architecture-skill
description: OrchestratorAI Enterprise monorepo conventions, product boundaries, port assignments, and shared package imports. Use when working across products or setting up new product code.
allowed-tools: Read, Grep, Glob
---

# Enterprise Architecture Skill

## Purpose

This skill covers the OrchestratorAI Enterprise monorepo structure, product boundaries, port assignments, and shared package conventions. Use it when working across multiple products, setting up new product code, or understanding how products relate to each other.

## HARD STRUCTURAL CONSTRAINTS — THESE OVERRIDE ALL OTHER GUIDANCE

### Rule 1: Products Contain ZERO Infrastructure Code
Products do NOT have these directories:
- **NO `llms/` directory** — LLM access is via `LLM_SERVICE` from `@orchestratorai/planes/llm`
- **NO `observability/` directory** — observability is via `OBSERVABILITY_SERVICE` from `@orchestratorai/planes/observability`
- **NO `planes/` directory** — all planes live in `packages/planes/`
- **NO `supabase-core/` directory** — Supabase is an internal detail of the database plane
- **NO `agent2agent/` directory** — `invoke/` is the entry point
- **NO `agent-platform/` directory** — agent definitions come from the database

If you find yourself creating any of these directories in a product, **STOP. You are wrong.**

### Rule 2: Infrastructure Lives in packages/planes/ ONLY
All infrastructure abstractions with multi-cloud implementations:
- `packages/planes/database/` — DATABASE_SERVICE (Supabase, PostgreSQL, SQL Server)
- `packages/planes/llm/` — LLM_SERVICE (fine-control, simplified, Azure Foundry, Vertex AI)
- `packages/planes/observability/` — OBSERVABILITY_SERVICE (Supabase, Console)
- `packages/planes/storage/` — MEDIA_STORAGE_PROVIDER (Supabase, Azure Blob, GCS)
- `packages/planes/config/` — CONFIG_PROVIDER_SERVICE (local, Azure KeyVault, GCP Secret Manager)
- `packages/planes/rag/` — RAG_STORAGE_SERVICE (Supabase, PostgreSQL, SQL Server)
- `packages/planes/auth/` — AUTH_SERVICE (Supabase, Azure OIDC, Google OIDC)

Products inject these via Symbol tokens. Products **never** import provider-specific code.

### Rule 3: Product API Directory Structure is FIXED
```
apps/{product}/api/src/
  invoke/          <- Entry point (controller, dispatch, module)
  auth/            <- JWT validation (calls Auth API)
  health/          <- Health check endpoint
  {product-specific-modules}/  <- Business logic ONLY
  main.ts, app.module.ts
```

### Rule 4: ExecutionContext Shape is FROZEN
`orgSlug, userId, conversationId, agentSlug, agentType, provider, model, sovereignMode?`
NO other fields. No `taskId`, `planId`, or `deliverableId` in the shared context.

### Rule 5: Transport Contract Shape is FROZEN
Method: `invoke`. Params: `{ context, data, metadata? }`. Result: `{ success, output, metadata?, context? }`. No mode/action matrix.

---

## The 9 Products

Each product is an independent application in the `apps/` directory:

| Product | Directory | Purpose |
|---------|-----------|---------|
| **command** | `apps/command/` | The shell — navigation, entitlements, product launcher |
| **auth** | `apps/auth/` | Single auth service — token issuance, validation, SSO |
| **admin** | `apps/admin/` | Admin UI — manage orgs, users, entitlements |
| **forge** | `apps/forge/` | Module-first capability host — CapabilityHandler interface, capability registry |
| **compose** | `apps/compose/` | Single-action agents — 5 families (context, rag, api, external, media), conversation-centric persistence, typed outputs |
| **pulse** | `apps/pulse/` | Internal ambient automation — event-driven watchers, system-triggered EC, thin A2A edge |
| **bridge** | `apps/bridge/` | External A2A — protocol translation, metadata in metadata field not context |
| **assistant** | `apps/assistant/` | Personal AI assistant |
| **flow** | `apps/flow/` | Productivity — SyncFocus, team tasks/notes/sprints |

## Port Assignments

### Dev Ports (6xxx)

| Product | Web | API | LangGraph |
|---------|-----|-----|-----------|
| **Supabase** | — | 6012 | — |
| **command** | 6000 | 6001 | — |
| **auth** | 6100 | 6101 | — |
| **admin** | 6200 | 6201 | — |
| **forge** | 6300 | 6301 | 6302 |
| **compose** | 6400 | 6401 | 6402 |
| **pulse** | 6500 | 6501 | 6502 |
| **bridge** | 6600 | 6601 | 6602 |
| **assistant** | 6700 | 6701 | 6702 |
| **flow** | 6800 | 6801 | 6802 |

### Prod Ports (7xxx)

Same structure as dev but with 7xxx prefix (e.g., command web = 7000, auth API = 7101).

## Shared Packages

Three shared packages live under `packages/`:

| Package | Directory | Import |
|---------|-----------|--------|
| **transport-types** | `packages/transport-types/` | `@orchestrator-ai/transport-types` |
| **planes** | `packages/planes/` | `@orchestrator-ai/planes` |
| **ui** | `packages/ui/` | `@orchestrator-ai/ui` |

### Import Patterns

```typescript
// Transport types — ExecutionContext, invoke contract, stream events
import { ExecutionContext, InvokeData, InvokeOutput } from '@orchestrator-ai/transport-types';

// Planes — Provider plane symbols and interfaces
import { DATABASE_SERVICE, DatabaseService } from '@orchestrator-ai/planes';

// UI — Shared Vue components
import { OrchestratorButton, OrchestratorCard } from '@orchestrator-ai/ui';
```

**NEVER import shared packages with relative paths.** Always use the package name.

## Invoke Contract

All products expose a `POST /invoke` endpoint using the same JSON-RPC 2.0 contract:

```typescript
// Request
{
  jsonrpc: "2.0",
  method: "invoke",
  id: string,
  params: {
    context: ExecutionContext,
    data: InvokeData,       // { content, contentType? }
    metadata?: Record<string, unknown>
  }
}

// Response
{
  jsonrpc: "2.0",
  id: string,
  result: {
    success: true,
    output: InvokeOutput,   // { content, outputType, metadata? }
    metadata?: Record<string, unknown>,
    context?: ExecutionContext
  }
}
```

There is no mode/action matrix. The single `invoke` method is the transport primitive.

## Product Boundaries

### Independence Rules

Each product is **fully independent**:
- Has its own web app (Vue 3), API (NestJS), and optionally LangGraph
- Has its own `package.json` with its own name
- Runs on its own assigned port
- Has its own CLAUDE.md for product-specific guidance
- Communicates with other products via A2A protocol only

### Communication Between Products

Products communicate via:
1. **A2A protocol** — JSON-RPC 2.0 invoke calls
2. **Auth API** — All products call Auth for token validation
3. **Shared Supabase** — Products share the database on port 6012

### Product Isolation

Products do NOT:
- Import code directly from other product directories
- Share runtime state except through database
- Make direct function calls to other product code

## Auth Service: The Single Auth Provider

**Auth is special** — it is the only authentication source:

- **All products** call Auth API to validate JWT tokens
- **SSO**: Single JWT/cookie issued by Auth, accepted by all products
- **Entitlements**: Auth manages which orgs can access which products
- **Command shell** reads entitlements from Auth to show/hide product navigation
- **Admin web** provides UI for managing what Auth serves

**Pattern in each product's API:**
```typescript
// Product validates token by calling Auth API
// NOT by running auth logic locally
const validation = await authApiClient.validateToken(bearerToken);
if (!validation.valid) throw new UnauthorizedException();
```

## Supabase: Shared Database

- Supabase runs on port **6012** (dev) / **7012** (prod)
- Shared across all products
- Each product may use different schemas or tables
- All products connect to the same Supabase instance

## Turborepo Build Orchestration

The monorepo uses Turborepo:

```bash
# Build all products
turbo run build

# Build specific product
turbo run build --filter=@orchestratorai/forge

# Dev all products
turbo run dev

# Dev specific product
turbo run dev --filter=@orchestratorai/forge-web
```

**Build order**: `transport-types` → `planes` → `ui` → all products (products build after packages)

## Product Directory Structure

Each product follows this pattern:
```
apps/<product>/
├── CLAUDE.md           # Product-specific guidance and context
├── web/                # Vue 3 frontend
│   ├── src/
│   ├── package.json    # name: @orchestratorai/<product>-web
│   └── vite.config.ts  # port: 6X00
├── api/                # NestJS backend
│   ├── src/
│   ├── package.json    # name: @orchestratorai/<product>-api
│   └── ...             # port: 6X01
└── langgraph/          # LangGraph (if applicable)
    ├── src/
    ├── package.json    # name: @orchestratorai/<product>-langgraph
    └── ...             # port: 6X02
```

## Environment Configuration

Each product reads from the root `.env` file. Key variables per product:

```bash
# Example for forge product
FORGE_WEB_PORT=6300
FORGE_API_PORT=6301
FORGE_LANGGRAPH_PORT=6302

# Auth API (all products need this)
AUTH_API_URL=http://localhost:6101

# Supabase (shared)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Related Skills

- **transport-types-skill** — Invoke protocol for inter-product communication
- **planes-architecture-skill** — Shared infrastructure provider planes
- **execution-context-skill** — ExecutionContext capsule pattern
- **ambient-protocol-skill** — Pulse and Bridge event-driven patterns
