---
name: planes-architecture-skill
description: "Validate Provider Planes patterns: symbol-based injection, @Global factory modules, env-var provider selection, and multi-cloud portability. Use when working with planes/, injecting DATABASE_SERVICE, LLM_SERVICE, MEDIA_STORAGE_PROVIDER, OBSERVABILITY_SERVICE, or any provider plane code. Keywords: planes, provider, DATABASE_SERVICE, LLM_SERVICE, MEDIA_STORAGE_PROVIDER, CONFIG_PROVIDER_SERVICE, RAG_STORAGE_SERVICE, WORK_TASK_SINK, AUTH_SERVICE, OBSERVABILITY_SERVICE, multi-cloud, factory module."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Provider Planes Architecture Skill

## Purpose

This skill enforces the Provider Planes abstraction layer — the architecture that enables multi-cloud deployment (Supabase, Azure, GCP) by swapping a single environment variable per infrastructure concern.

**Every service in the API must use plane symbols for infrastructure access. Direct provider imports (e.g., importing `SupabaseDatabaseService` directly) are VIOLATIONS.**

## The Provider Planes

| Plane | Symbol Token | Interface | Location |
|-------|-------------|-----------|----------|
| **Database** | `DATABASE_SERVICE` | `DatabaseService` | `planes/database/` |
| **Storage** | `MEDIA_STORAGE_PROVIDER` | `MediaStorageProvider` | `planes/storage/` |
| **Auth** | `AUTH_SERVICE` | `AuthServiceProvider` | `planes/auth/` |
| **Config** | `CONFIG_PROVIDER_SERVICE` | `ConfigProviderService` | `planes/config/` |
| **Work Routing** | `WORK_TASK_SINK` | `WorkTaskSink` | `planes/work-routing/` |
| **RAG** | `RAG_STORAGE_SERVICE` | `RagStorageService` | `planes/rag/` |
| **LLM** | `LLM_SERVICE` | `LLMServiceProvider` | `planes/llm/` |
| **Observability** | `OBSERVABILITY_SERVICE` | `ObservabilityService` | `planes/observability/` |
| **Supabase Core** | — | — | `planes/supabase-core/` |

### Observability Plane

The observability plane provides:
- **Invocation lifecycle tracking** — started, completed, failed events
- **LLM usage monitoring** — token counts, provider/model, latency
- **Stream correlation** — linking stream events to invocations

All products inject via `@Inject(OBSERVABILITY_SERVICE)` and emit events with full ExecutionContext.

## Core Pattern

### 1. Symbol-Based Injection (MANDATORY)

Services MUST inject infrastructure via Symbol tokens, never via class references:

```typescript
// CORRECT: Symbol injection — works with any provider
@Inject(DATABASE_SERVICE) private readonly db: DatabaseService
@Inject(LLM_SERVICE) private readonly llm: LLMServiceProvider
@Inject(MEDIA_STORAGE_PROVIDER) private readonly storage: MediaStorageProvider
@Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProviderService
@Inject(RAG_STORAGE_SERVICE) private readonly rag: RagStorageService
@Inject(OBSERVABILITY_SERVICE) private readonly observability: ObservabilityService

// VIOLATION: Direct class injection — breaks multi-cloud
constructor(private readonly db: SupabaseDatabaseService)  // NO
constructor(private readonly llm: LLMService)              // NO — use LLM_SERVICE symbol
constructor(private readonly storage: SupabaseMediaStorageService)  // NO
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
- Only the Symbol token is exported

### 3. Interface Definition Pattern

Each plane defines its contract in an interface file:

```typescript
// planes/[plane]/[plane].interface.ts
export const SYMBOL_NAME = Symbol('SymbolName');

export interface ServiceInterface {
  // Methods that ALL implementations must provide
}
```

### 4. Implementation Pattern

Each provider implementation is a standalone `@Injectable()` service:

```typescript
// planes/[plane]/[provider]-[plane].service.ts
@Injectable()
export class ProviderPlaneService implements ServiceInterface {
  constructor(/* provider-specific deps */) {}

  // Implement all interface methods
}
```

### 5. Import Pattern

Consumers import from the plane directory, never from specific implementations:

```typescript
// CORRECT: Import symbol and interface from plane
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm';
import { DATABASE_SERVICE, DatabaseService } from '@/planes/database';
import { MEDIA_STORAGE_PROVIDER, MediaStorageProvider } from '@/planes/storage';
import { OBSERVABILITY_SERVICE, ObservabilityService } from '@/planes/observability';

// VIOLATION: Import specific implementation
import { SupabaseDatabaseService } from '@/planes/database/supabase-database.service';  // NO
import { AzureFoundryLLMService } from '@/planes/llm/azure-foundry';  // NO
```

### 6. Re-export Chain

```
planes/[plane]/[plane].interface.ts   (defines Symbol + Interface)
    |
planes/[plane]/index.ts               (re-exports Symbol, Interface, Types, Module)
    |
planes/index.ts                        (re-exports Modules only)
    |
app.module.ts                          (imports Modules)
```

## Validation Checklist

When reviewing or writing code that uses infrastructure:

- [ ] Uses Symbol token injection (`@Inject(DATABASE_SERVICE)`) not class injection
- [ ] Imports from plane directory (`@/planes/llm`) not implementation files
- [ ] Does NOT import specific provider classes (no `SupabaseDatabaseService` in business logic)
- [ ] Does NOT construct provider instances directly
- [ ] Does NOT read provider env vars outside factory modules (no `process.env.DB_PROVIDER` in services)
- [ ] Factory modules throw on unsupported provider values (no fallback/default providers)
- [ ] New plane implementations follow `@Injectable()` + interface pattern
- [ ] New plane modules are `@Global()` with factory `useFactory`
- [ ] Plane modules export only the Symbol token
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
import { SupabaseMediaStorageService } from '../planes/storage/supabase-media-storage.service';

// FIX
import { MEDIA_STORAGE_PROVIDER, MediaStorageProvider } from '../planes/storage';
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
const provider = process.env.LLM_PROVIDER || 'fine_control';
try { return impl1; } catch { return impl2; }  // NO

// CORRECT — throw on unknown, single selection
switch (provider) {
  case 'fine_control': return impl1;
  case 'simplified': return impl2;
  default: throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
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
constructor(@Inject(OBSERVABILITY_SERVICE) private readonly obs: ObservabilityService) {}
```

## LangGraph Agents and Planes

LangGraph agents access infrastructure through `SharedServicesModule`:

- `SharedServicesModule` provides HTTP proxies to API endpoints (LLM, observability)
- LangGraph agents do NOT directly inject plane symbols
- LangGraph agents call API's `/llm/generate` endpoint via `LLMHttpClientService`
- The API's LLM controller uses `@Inject(LLM_SERVICE)` internally

**The boundary:** LangGraph -> HTTP -> API Controller -> `@Inject(LLM_SERVICE)` -> Selected Provider

LangGraph code should NEVER import from `@/planes/` directly.

## LLM Plane Details

The LLM plane has 4 provider modes:

| Mode | Class | Routing |
|------|-------|---------|
| `fine_control` | `LLMService` (existing) | Full provider routing, PII, sovereign mode |
| `simplified` | `SimplifiedLLMService` | ModelRouter -> OpenRouter (commercial) or Ollama Cloud (open-source) |
| `azure_foundry` | `AzureFoundryLLMService` | Azure AI Foundry MaaS endpoint |
| `vertex_ai` | `VertexAILLMService` | Google Vertex AI (Gemini, Imagen) |

`fine_control` is the default and wraps the existing `LLMService` via `useExisting`.

## Adding a New Plane Implementation

When adding a new provider to an existing plane:

1. Create `planes/[plane]/[new-provider]-[plane].service.ts`
2. Implement the plane's interface
3. Add the service to the module's `providers` array
4. Add a `case` to the factory `switch` statement
5. Add the class to the factory's `inject` array
6. Update env var documentation
7. Write tests for the new implementation

## Adding a New Plane

When creating an entirely new infrastructure plane:

1. Create `planes/[new-plane]/` directory
2. Define interface + symbol in `[new-plane].interface.ts`
3. Create `@Global()` factory module in `[new-plane].module.ts`
4. Implement at least one provider service
5. Create `index.ts` with re-exports
6. Add module re-export to `planes/index.ts`
7. Import module in `app.module.ts`
8. Update this skill document

## Related

- **`execution-context-skill/`** — ExecutionContext flows through plane-injected services
- **`transport-types-skill/`** — Invoke contract types
- **`api-architecture-skill/`** — API patterns that consume planes
