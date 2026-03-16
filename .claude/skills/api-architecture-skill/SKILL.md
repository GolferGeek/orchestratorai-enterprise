---
name: api-architecture-skill
description: "Classify API files and validate against NestJS API application patterns. Use when working with controllers, services, modules, runners, DTOs, or any API application code."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# API Architecture Skill

Classify API files and validate against NestJS API application patterns, module/controller/service architecture, and agent runner patterns.

## Purpose

This skill enables agents to:
1. **Classify Files**: Identify file types (controller, service, module, runner, dto, interface)
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

### 2. Agent Runner Pattern

- Extend `BaseAgentRunner` abstract class
- Implement mode handlers (`handleConverse`, `handlePlan`, `handleBuild`, `handleHitl`)
- Register runner in `AgentRunnerRegistryService`
- Support mode routing (CONVERSE, PLAN, BUILD, HITL)

### 3. ExecutionContext Flow

- ExecutionContext created by frontend, flows through unchanged
- Backend can ONLY mutate: taskId, deliverableId, planId (when first created)
- Backend must VALIDATE: userId matches JWT auth
- ExecutionContext passed whole, never cherry-picked

### 4. A2A Protocol

- JSON-RPC 2.0 format
- Transport types match mode
- `.well-known/agent.json` discovery

## Provider Planes Integration

**All infrastructure access in the API MUST go through Provider Planes.** See `planes-architecture-skill` for full details.

### Plane Injection Rules

When writing any API service:

```typescript
// CORRECT: Symbol-based injection from planes
@Inject(DATABASE_SERVICE) private readonly db: DatabaseService
@Inject(LLM_SERVICE) private readonly llm: LLMServiceProvider
@Inject(MEDIA_STORAGE_PROVIDER) private readonly storage: MediaStorageProvider

// VIOLATION: Direct class injection bypasses provider selection
constructor(private readonly db: SupabaseDatabaseService)  // NO
constructor(private readonly llm: LLMService)              // NO - use @Inject(LLM_SERVICE)
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

### Runner Files
- **Location**: `src/agent2agent/services/[type]-agent-runner.service.ts`
- **Pattern**: `[type]-agent-runner.service.ts`
- **Structure**: Extends `BaseAgentRunner`, implements mode handlers
- **Responsibilities**: Agent execution, mode routing

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
- [ ] A2A calls use JSON-RPC 2.0 format (if applicable)
- [ ] NestJS decorators used correctly
- [ ] Dependency injection used correctly
- [ ] Runner extends BaseAgentRunner (if applicable)

## Critical Services

### LLM Service

**Purpose**: External API endpoint for LLM calls from LangGraph and other external systems.

**Key Features**:
- Provider routing and selection via planes
- PII processing and sanitization
- Observability event emission

**Usage**: External callers call `POST /llm/generate` with ExecutionContext.

### Observability Service

**Purpose**: Real-time monitoring and event streaming for all agent executions.

**Key Features**:
- SSE streaming endpoint (`GET /observability/stream`)
- In-memory event buffer (RxJS Subject)
- Database persistence for historical queries
- Non-blocking event sending

**Usage**: Services use `ObservabilityWebhookService.sendEvent()` with ExecutionContext.

## Related

- **`execution-context-skill/`**: ExecutionContext flow validation
- **`transport-types-skill/`**: A2A protocol compliance
- **`planes-architecture-skill/`**: Provider Planes patterns

## Notes

- Classification happens **before** writing code
- Validation happens **during and after** writing code
- Architecture compliance is **non-negotiable**
