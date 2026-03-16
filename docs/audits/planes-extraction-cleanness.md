# Planes Extraction Cleanness Audit

Generated: 2026-03-16 | Plan step: step-6-0

## Summary

| Plane | In packages/planes/ | Multi-product | No app-local deps | Clean? |
|-------|:---:|:---:|:---:|:---:|
| database | Yes | Yes (all 7) | Yes | CLEAN |
| config | Yes | Yes (all 7) | Yes | CLEAN |
| supabase-core | Yes | Yes (all 7) | Yes | CLEAN |
| storage | Yes | Yes (3: compose, forge, pulse) | Yes | CLEAN |
| llm | Yes | Yes (3: compose, forge, pulse) | Has @/observability import | NEEDS FIX |
| rag | Yes | Yes (3: compose, forge, pulse) | Yes | CLEAN |
| auth | Yes | Yes (5: compose, forge, pulse, auth, flow) | Has app-specific imports | NOT YET CLEAN |
| work-routing | Yes | Yes (4: compose, forge, pulse, flow) | Yes | CLEAN |
| observability | Yes (new in Phase 2) | Not yet adopted | Yes | CLEAN (new) |

## Detailed Findings

### database — CLEAN
- Located: `packages/planes/database/`
- Providers: Supabase, PostgreSQL, SQL Server
- Used by: All 7 products
- No app-local dependencies
- Ready for adoption

### config — CLEAN
- Located: `packages/planes/config/`
- Providers: Local env, Azure KeyVault, GCP Secret Manager, Supabase Vault
- Used by: All 7 products
- No app-local dependencies

### supabase-core — CLEAN
- Located: `packages/planes/supabase-core/`
- Provides: Supabase client initialization, schema utilities
- Used by: All 7 products
- No app-local dependencies

### storage — CLEAN
- Located: `packages/planes/storage/`
- Providers: Supabase, Azure Blob, GCS
- Used by: Compose, Forge, Pulse
- No app-local dependencies

### llm — NEEDS FIX
- Located: `packages/planes/llm/`
- Providers: fine_control, simplified (OpenRouter/Ollama), Azure Foundry, Vertex AI
- Used by: Compose, Forge, Pulse
- **Issue**: `llm.module.ts` imports `ObservabilityModule` from `@/observability/observability.module` (product-local)
- **Fix**: Should import from `packages/planes/observability` once adopted
- **Issue**: LLM interface imports from `@/llms/services/llm-interfaces` (product-local)
- These are step 2-2b concerns — the LLM plane needs to use OBSERVABILITY_SERVICE

### rag — CLEAN
- Located: `packages/planes/rag/`
- Providers: Supabase, PostgreSQL, SQL Server
- Used by: Compose, Forge, Pulse
- No app-local dependencies

### auth — NOT YET CLEAN
- Located: `packages/planes/auth/`
- **Issue**: Has app-specific imports (SupabaseModule, RbacModule)
- **Note**: Plan explicitly allows Auth to remain app-local where not yet clean
- Do not force into shared plane yet

### work-routing — CLEAN
- Located: `packages/planes/work-routing/`
- Providers: ADO, Slack, Flow/Supabase
- Used by: Compose, Forge, Pulse, Flow
- No app-local dependencies

### observability — CLEAN (new)
- Located: `packages/planes/observability/`
- Providers: Supabase, Console
- Created in Phase 2 of this implementation
- Not yet adopted by any product (adoption happens when products wire to OBSERVABILITY_SERVICE)

## Bridge Gap

Bridge (`apps/ambient/bridge/api/`) has **no planes directory** at all.
- All database access uses direct `createClient()` (see violations inventory)
- Must create planes directory and wire to shared planes during Bridge alignment

## Adoption Readiness

### Safe to adopt now (6 planes):
- database, config, supabase-core, storage, rag, work-routing, observability

### Needs fix before adoption (1 plane):
- llm (product-local observability import)

### Not yet extractable (1 plane):
- auth (app-specific imports)
