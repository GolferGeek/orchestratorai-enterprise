---
name: api-architecture-skill
description: "Classify API files and validate against NestJS API application patterns. Use when working with controllers, services, modules, capability handlers, DTOs, or any API application code."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# API Architecture Skill

Classify API files and validate against NestJS API application patterns, module/controller/service architecture, and product-specific handler patterns.

## Purpose

This skill enables agents to:
1. **Classify Files**: Identify file types (controller, service, module, handler, dto, interface)
2. **Validate Patterns**: Check compliance with API-specific patterns
3. **Check Architecture**: Ensure module/controller/service architecture is followed
4. **Validate Decisions**: Check compliance with architectural decisions

## When to Use

- **Classifying Files**: When determining what type of file you're working with
- **Validating Patterns**: When checking if code follows API patterns
- **Architecture Compliance**: When ensuring module/controller/service architecture is maintained
- **Code Review**: When reviewing API code for compliance

## Core Principles

### 1. NestJS Module/Controller/Service Pattern

**Module** (`*.module.ts`):
- Dependency injection configuration
- Imports, controllers, providers, exports
- Uses `@Module` decorator

**Controller** (`*.controller.ts`):
- HTTP request/response handling
- Uses `@Controller`, `@Get`, `@Post`, `@Put`, `@Delete` decorators
- Delegates to services for business logic

**Service** (`*.service.ts`):
- Business logic
- Uses `@Injectable` decorator
- Dependency injection via constructor

### 2. Invoke Endpoint Pattern

All products expose a `POST /invoke` endpoint that accepts the JSON-RPC 2.0 invoke contract:

```typescript
@Post('invoke')
async handleInvoke(
  @Body() body: InvokeRequest,
  @CurrentUser() currentUser: SupabaseAuthUserDto,
): Promise<InvokeResponse> {
  // Validate context matches auth
  const context = body.params.context;
  if (context.userId !== currentUser.id) {
    throw new UnauthorizedException('userId mismatch');
  }

  // Delegate to service
  return this.service.invoke(context, body.params.data);
}
```

There is no mode/action routing matrix. The single `invoke` method is the transport primitive. Product-specific logic determines what happens with the invocation internally.

### 3. Product-Specific Handler Patterns

**Forge** uses `CapabilityHandler` interface with a capability registry:
```typescript
export interface CapabilityHandler {
  handle(context: ExecutionContext, data: InvokeData): Promise<InvokeOutput>;
}
```

**Compose** uses single-action agent runners organized into 5 families (context, rag, api, external, media).

Each product implements its own internal routing after receiving the invoke request.

### 4. ExecutionContext Flow

- ExecutionContext created by frontend, flows through unchanged
- Backend must VALIDATE: userId matches JWT auth
- ExecutionContext passed whole, never cherry-picked
- Pulse system automation is the ONLY exception (uses `createSystemTriggeredContext()`)

### 5. A2A Protocol

- JSON-RPC 2.0 format with `invoke` method
- Transport types from `@orchestrator-ai/transport-types`
- `/.well-known/agent.json` discovery via CapabilityCard

## Provider Planes Integration

**All infrastructure access in the API MUST go through Provider Planes.** See `planes-architecture-skill` for full details.

### Plane Injection Rules

When writing any API service:

```typescript
// CORRECT: Symbol-based injection from planes
@Inject(DATABASE_SERVICE) private readonly db: DatabaseService
@Inject(LLM_SERVICE) private readonly llm: LLMServiceProvider
@Inject(MEDIA_STORAGE_PROVIDER) private readonly storage: MediaStorageProvider
@Inject(OBSERVABILITY_SERVICE) private readonly observability: ObservabilityService

// VIOLATION: Direct class injection bypasses provider selection
constructor(private readonly db: SupabaseDatabaseService)  // NO
constructor(private readonly llm: LLMService)              // NO — use @Inject(LLM_SERVICE)
```

### Plane Validation Checklist

- [ ] Service uses `@Inject(SYMBOL)` for all infrastructure access
- [ ] Imports from `@/planes/[plane]` not from implementation files
- [ ] No direct provider class references in business logic
- [ ] No `process.env.*_PROVIDER` reads outside factory modules

## File Classification

### Controller Files
- **Location**: `src/[feature]/[name].controller.ts`
- **Pattern**: `[name].controller.ts`
- **Structure**: `@Controller`, HTTP method decorators, constructor injection
- **Responsibilities**: HTTP request/response handling, validation, delegation to services

### Service Files
- **Location**: `src/[feature]/[name].service.ts`
- **Pattern**: `[name].service.ts`
- **Structure**: `@Injectable`, constructor injection, business logic methods
- **Responsibilities**: Business logic, data processing, service coordination

### Module Files
- **Location**: `src/[feature]/[name].module.ts`
- **Pattern**: `[name].module.ts`
- **Structure**: `@Module`, imports, controllers, providers, exports
- **Responsibilities**: Dependency injection configuration

### Handler Files (Forge)
- **Location**: `src/capabilities/[name].handler.ts`
- **Pattern**: `[name].handler.ts`
- **Structure**: Implements `CapabilityHandler` interface
- **Responsibilities**: Capability execution within Forge's registry

### DTO Files
- **Location**: `src/[feature]/dto/[name].dto.ts`
- **Pattern**: `[name].dto.ts`
- **Structure**: Class with validation decorators
- **Responsibilities**: Data transfer object definitions

### Interface Files
- **Location**: `src/[feature]/[name].interface.ts` or `interfaces/[name].interface.ts`
- **Pattern**: `[name].interface.ts`
- **Structure**: TypeScript interface definitions
- **Responsibilities**: Type definitions

## Validation Checklist

When validating API code:

- [ ] File is in correct location
- [ ] File follows naming convention
- [ ] Module/controller/service architecture is maintained
- [ ] ExecutionContext flows correctly (if applicable)
- [ ] Invoke endpoint uses JSON-RPC 2.0 format (if applicable)
- [ ] NestJS decorators used correctly
- [ ] Dependency injection used correctly
- [ ] Plane symbols used for infrastructure access

## Critical Services

### LLM Service

**Purpose**: External API endpoint for LLM calls from LangGraph and other external systems.

**Key Features**:
- Provider routing and selection via planes
- PII processing and sanitization
- Observability event emission

**Usage**: External callers call `POST /llm/generate` with ExecutionContext.

### Observability Service

**Purpose**: Real-time monitoring and event streaming for all invocations.

**Key Features**:
- Invocation lifecycle tracking
- LLM usage monitoring
- Stream correlation
- Injected via `OBSERVABILITY_SERVICE` symbol

**Usage**: Services use `@Inject(OBSERVABILITY_SERVICE)` and emit events with full ExecutionContext.

## Related

- **`execution-context-skill/`**: ExecutionContext flow validation
- **`transport-types-skill/`**: Invoke protocol compliance
- **`planes-architecture-skill/`**: Provider Planes patterns

## Notes

- Classification happens **before** writing code
- Validation happens **during and after** writing code
- Architecture compliance is **non-negotiable**
