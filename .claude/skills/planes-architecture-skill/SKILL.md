---
name: planes-architecture-skill
description: "Validate Provider Planes patterns: symbol-based injection, @Global factory modules, env-var provider selection, and multi-cloud portability. Use when working with planes/, injecting DATABASE_SERVICE, LLM_SERVICE, MEDIA_STORAGE_PROVIDER, OBSERVABILITY_SERVICE, or any provider plane code. Keywords: planes, provider, DATABASE_SERVICE, LLM_SERVICE, MEDIA_STORAGE_PROVIDER, CONFIG_PROVIDER_SERVICE, RAG_STORAGE_SERVICE, WORK_TASK_SINK, AUTH_SERVICE, OBSERVABILITY_SERVICE, multi-cloud, factory module."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Provider Planes Architecture Skill

## Purpose

This skill enforces the Provider Planes abstraction layer — the architecture that enables multi-cloud deployment (Supabase, Azure, GCP) by swapping a single environment variable per infrastructure concern. All planes live in `packages/planes/` and are consumed as `@orchestratorai/planes/<plane>`.

**Every service in the API must use plane symbols for infrastructure access. Direct provider imports (e.g., importing `SupabaseDatabaseService` directly) are VIOLATIONS.**

## The Provider Planes

| Plane | Symbol Token | Interface | Env var → values | Location |
|-------|-------------|-----------|------------------|----------|
| **Database** | `DATABASE_SERVICE` (+ `DATABASE_CHANGE_STREAM_SERVICE`) | `DatabaseService` | `DB_PROVIDER` → `supabase`, `supabase_pg`, `postgresql`, `sqlserver` | `packages/planes/database/` |
| **Storage** | `MEDIA_STORAGE_PROVIDER` | `MediaStorageProvider` | `STORAGE_PROVIDER` → `supabase_storage`, `azure_blob`, `gcs` | `packages/planes/storage/` |
| **Auth** | `AUTH_SERVICE`, `IDENTITY_PROVIDER` | `AuthServiceProvider`, `IdentityProvider` | `AUTH_PROVIDER` → `supabase`, `auth0`, `azure_oidc`, `google_oidc` | `packages/planes/auth/` |
| **Config** | `CONFIG_PROVIDER_SERVICE` | `ConfigProvider` | `CONFIG_PROVIDER` → `local`, `supabase_vault`, `azure_keyvault`, `gcp_secret_manager` | `packages/planes/config/` |
| **Work Routing** | `WORK_TASK_SINK` | `WorkTaskSink` | `WORK_PROVIDER` → `flow`, `slack`, `ado` | `packages/planes/work-routing/` |
| **RAG** | `RAG_STORAGE_SERVICE` (+ `EMBEDDING_SERVICE`) | `RagStorageService` | `RAG_PROVIDER` / `DB_PROVIDER` → `supabase`, `supabase_pg`, `postgresql`, `sqlserver` | `packages/planes/rag/` |
| **LLM** | `LLM_SERVICE` | `LLMServiceProvider` | `LLM_PROVIDER` → `fine_control` only (see below) | `packages/planes/llm/` |
| **Observability** | `OBSERVABILITY_SERVICE` | `ObservabilityServiceProvider` | `OBSERVABILITY_PROVIDER` → `database_events`, `console` | `packages/planes/observability/` |
| **Machine Identity** | `MACHINE_IDENTITY_PROVIDER` | `MachineIdentityProvider` | `MACHINE_IDENTITY_PROVIDER` → `tailscale` | `packages/planes/machine-identity/` |
| **Extractors** | `DOCUMENT_EXTRACTION_ROUTER` | — | not env-selected (routes by file type) | `packages/planes/extractors/` |

### Observability Plane

The observability plane provides:
- **Invocation lifecycle tracking** — started, completed, failed events
- **LLM usage monitoring** — token counts, provider/model, latency
- **Stream correlation** — linking stream events to invocations

All products inject via `@Inject(OBSERVABILITY_SERVICE)` (typed `ObservabilityServiceProvider`) and emit events with full ExecutionContext.

## HARD STRUCTURAL CONSTRAINT: Products Contain ZERO Infrastructure Code

Products do NOT have these directories:
- **NO `llms/` directory** — LLM access is via `LLM_SERVICE` from `@orchestratorai/planes/llm`
- **NO `observability/` directory** — observability is via `OBSERVABILITY_SERVICE` from `@orchestratorai/planes/observability`
- **NO `planes/` directory** — all planes live in `packages/planes/`
- **NO Supabase client code** — Supabase is an internal detail of the database plane

If you find yourself creating any of these directories in a product, **STOP. You are wrong.** All infrastructure abstractions with multi-cloud implementations live in `packages/planes/` and ONLY in `packages/planes/`. Products consume them via Symbol token injection.

---

## Core Pattern

### 1. Symbol-Based Injection (MANDATORY)

Services MUST inject infrastructure via Symbol tokens, never via class references:

```typescript
// CORRECT: Symbol injection — works with any provider
@Inject(DATABASE_SERVICE) private readonly db: DatabaseService
@Inject(LLM_SERVICE) private readonly llm: LLMServiceProvider
@Inject(MEDIA_STORAGE_PROVIDER) private readonly storage: MediaStorageProvider
@Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider
@Inject(RAG_STORAGE_SERVICE) private readonly rag: RagStorageService
@Inject(OBSERVABILITY_SERVICE) private readonly observability: ObservabilityServiceProvider

// VIOLATION: Direct class injection — breaks multi-cloud
constructor(private readonly db: SupabaseDatabaseService)  // NO
constructor(private readonly llm: LLMService)              // NO — use LLM_SERVICE symbol
constructor(private readonly storage: AzureBlobMediaStorageService)  // NO
```

### 2. @Global Factory Modules

Each plane is a `@Global()` module with a factory provider:

```typescript
@Global()
@Module({
  providers: [
    AllImplementations...,  // All provider implementations are instantiated
    {
      provide: SYMBOL_TOKEN,
      useFactory: (impl1, impl2, impl3) => {
        const provider = process.env.ENV_VAR || 'default';
        switch (provider) {
          case 'option1': return impl1;
          case 'option2': return impl2;
          case 'option3': return impl3;
          default: throw new Error(`Unsupported provider: ${provider}`);
        }
      },
      inject: [Impl1, Impl2, Impl3],
    },
  ],
  exports: [SYMBOL_TOKEN],
})
```

**Key rules:**
- `@Global()` — available everywhere without explicit imports
- Factory throws on unsupported env var values (NO FALLBACKS)
- All implementations are NestJS `@Injectable()` services
- Export the Symbol token; never export per-provider implementation classes

### 3. Interface Definition Pattern

Each plane defines its contract in an interface file:

```typescript
// packages/planes/[plane]/[plane].interface.ts  (e.g. llm/llm.interface.ts, storage/media-storage-provider.interface.ts)
export const SYMBOL_NAME = Symbol('SymbolName');

export interface ServiceInterface {
  // Methods that ALL implementations must provide
}
```

### 4. Implementation Pattern

Each provider implementation is a standalone `@Injectable()` service:

```typescript
// packages/planes/[plane]/[provider]-[plane].service.ts
@Injectable()
export class ProviderPlaneService implements ServiceInterface {
  constructor(/* provider-specific deps */) {}

  // Implement all interface methods
}
```

### 5. Import Pattern

Consumers import from the plane entry point (`@orchestratorai/planes/<plane>`, mapped in `tsconfig.json` / `apps/api/tsconfig.json`), never from specific implementations:

```typescript
// CORRECT: Import symbol and interface from plane
import { LLM_SERVICE, type LLMServiceProvider } from '@orchestratorai/planes/llm';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestratorai/planes/database';
import { MEDIA_STORAGE_PROVIDER, type MediaStorageProvider } from '@orchestratorai/planes/storage';
import { OBSERVABILITY_SERVICE, type ObservabilityServiceProvider } from '@orchestratorai/planes/observability';

// VIOLATION: Import specific implementation
import { SupabaseDatabaseService } from '@orchestratorai/planes/database/supabase-database.service';  // NO
import { AzureFoundryLLMService } from '@orchestratorai/planes/llm/azure-foundry/azure-foundry-llm.service';  // NO
```

### 6. Re-export Chain

```
packages/planes/[plane]/[plane].interface.ts   (defines Symbol + Interface)
    |
packages/planes/[plane]/index.ts               (re-exports Symbol, Interface, Types, Module)
    |
packages/planes/index.ts                        (re-exports Modules)
    |
apps/api/src/app.module.ts                     (imports Modules from @orchestratorai/planes/<plane>)
```

## Database plane: two rules that bite

- **Lists are `jsonb`, never `text[]`.** The query builder JSON-encodes every
  array and object it writes, and Postgres rejects that for an array column
  ("malformed array literal"). This took the enterprise API down once (a boot
  sync writing `text[]`). The workflows integration spec asserts the
  `workflows` schema has no array columns.
- **Several writes that must land together go in `db.transaction(tx => …)`**
  and use `tx` for every query inside. No raw SQL in app code for this.

## Validation Checklist

When reviewing or writing code that uses infrastructure:

- [ ] Uses Symbol token injection (`@Inject(DATABASE_SERVICE)`) not class injection
- [ ] Imports from plane entry (`@orchestratorai/planes/llm`) not implementation files
- [ ] Does NOT import specific provider classes (no `SupabaseDatabaseService` in business logic)
- [ ] Does NOT construct provider instances directly
- [ ] Does NOT read provider env vars outside factory modules (no `process.env.DB_PROVIDER` in services)
- [ ] Factory modules throw on unsupported provider values (no fallback/default providers)
- [ ] New plane implementations follow `@Injectable()` + interface pattern
- [ ] New plane modules are `@Global()` with factory `useFactory`
- [ ] Plane modules export the Symbol token, not provider implementation classes
- [ ] Observability events use `@Inject(OBSERVABILITY_SERVICE)` with full ExecutionContext

## Common Violations

### V1: Direct Provider Class Injection
```typescript
// VIOLATION
constructor(private readonly db: SupabaseDatabaseService) {}

// FIX
constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}
```

### V2: Importing Implementation Instead of Interface
```typescript
// VIOLATION
import { AzureBlobMediaStorageService } from '@orchestratorai/planes/storage';

// FIX
import { MEDIA_STORAGE_PROVIDER, type MediaStorageProvider } from '@orchestratorai/planes/storage';
```

### V3: Checking Provider Type in Business Logic
```typescript
// VIOLATION — business logic should not care about provider
if (process.env.DB_PROVIDER === 'supabase') {
  await this.db.supabaseSpecificMethod();
}

// FIX — use the interface methods that all providers implement
await this.db.from('public', 'table').select('*').execute();
```

### V4: Adding Fallback Providers
```typescript
// VIOLATION — NO FALLBACKS
const provider = process.env.DB_PROVIDER || 'supabase';
try { return impl1; } catch { return impl2; }  // NO

// CORRECT — throw on unknown, single selection
switch (provider) {
  case 'supabase': return supabaseImpl;
  case 'postgresql': return postgresImpl;
  default: throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
}
```

### V5: Missing @Global Decorator
```typescript
// VIOLATION
@Module({ providers: [...], exports: [SYMBOL] })
export class NewPlaneModule {}

// FIX
@Global()
@Module({ providers: [...], exports: [SYMBOL] })
export class NewPlaneModule {}
```

### V6: Exporting Implementation Classes from Module
```typescript
// VIOLATION — leaks implementation detail
@Module({ exports: [SupabaseDatabaseService, DATABASE_SERVICE] })

// FIX — only export the symbol
@Module({ exports: [DATABASE_SERVICE] })
```

### V7: Using Observability Without Symbol Injection
```typescript
// VIOLATION — direct class reference
constructor(private readonly obs: ObservabilityWebhookService) {}

// FIX — use plane symbol
constructor(@Inject(OBSERVABILITY_SERVICE) private readonly obs: ObservabilityServiceProvider) {}
```

## LangGraph Workflows and Planes

LangGraph workflows run in-process in `apps/api/src/workflows/` and follow the same rules as any other API code:

- Shared helpers come from `SharedServicesModule` (`apps/api/src/workflows/shared/services/shared-services.module.ts`)
- `LLMHttpClientService` is a legacy name: it wraps `@Inject(LLM_SERVICE)` in-process, not an HTTP call
- Workflow tools inject plane symbols directly (e.g. `DATABASE_SERVICE` in `workflows/shared/tools/data/database/`)

## LLM Plane Details

`LLM_PROVIDER` must be `fine_control`. That path (`LLMService` in `packages/planes/llm/fine-control/`) is the only one with the PII before/after layer (pseudonymization, redaction) and `llm_usage` recording. The factory in `packages/planes/llm/llm.module.ts` deliberately **throws** for `openrouter`, `azure_foundry`, `vertex_ai` and `simplified`; read `docs/architecture/llm-boundary.md` before adding a case.

Vendors are **backends under `fine_control`**, chosen per request by `ExecutionContext.provider` and instantiated by `LLMServiceFactory` (`fine-control/services/llm-service-factory.ts`):

| `ExecutionContext.provider` | Backend |
|-----------------------------|---------|
| `openai` | `OpenAILLMService` |
| `anthropic` | `AnthropicLLMService` |
| `google` | `GoogleLLMService` |
| `openrouter` | `OpenRouterBackendService` |
| `azure_foundry` | `AzureFoundryBackendService` |
| `vertex_ai` | `VertexAIBackendService` |
| `ollama` (alias `ollama-cloud`) | `OllamaLLMService` (cloud mode when `OLLAMA_CLOUD_API_KEY` is set) |
| `xai` | `GrokLLMService` |

To add a vendor, add a `BaseLLMService` backend and a `case` in `LLMServiceFactory` — not a new `LLM_PROVIDER` value.

## Adding a New Plane Implementation

When adding a new provider to an existing plane (for LLM vendors, see above instead):

1. Create `packages/planes/[plane]/[new-provider]-[plane].service.ts`
2. Implement the plane's interface
3. Add the service to the module's `providers` array
4. Add a `case` to the factory `switch` statement
5. Add the class to the factory's `inject` array
6. Update env var documentation
7. Write tests for the new implementation

## Adding a New Plane

When creating an entirely new infrastructure plane:

1. Create `packages/planes/[new-plane]/` directory
2. Define interface + symbol in `[new-plane].interface.ts`
3. Create `@Global()` factory module in `[new-plane].module.ts`
4. Implement at least one provider service
5. Create `index.ts` with re-exports
6. Add module re-export to `packages/planes/index.ts` and a subpath export in `packages/planes/package.json`
7. Import module in `apps/api/src/app.module.ts`
8. Update this skill document

## Related

- **`execution-context-skill/`** — ExecutionContext flows through plane-injected services
- **`transport-types-skill/`** — Invoke contract types
