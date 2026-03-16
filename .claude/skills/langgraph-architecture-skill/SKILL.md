---
name: langgraph-architecture-skill
description: Classify LangGraph files and validate against LangGraph workflow patterns. Use when working with workflows, state machines, nodes, tools, HITL, checkpoints, or any LangGraph code.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# LangGraph Architecture Skill

## Purpose

This skill enables agents to:
1. **Classify Files**: Identify file types (workflow, state, node, tool, service, controller, module)
2. **Validate Patterns**: Check compliance with LangGraph-specific patterns
3. **Check Architecture**: Ensure workflow/state/node architecture is followed
4. **Validate Decisions**: Check compliance with architectural decisions

## When to Use

- **Classifying Files**: When determining what type of file you're working with
- **Validating Patterns**: When checking if code follows LangGraph patterns
- **Architecture Compliance**: When ensuring workflow/state/node architecture is maintained
- **Code Review**: When reviewing LangGraph code for compliance

## Core Principles

### 1. LangGraph Workflow Pattern

**Workflow Graph** (`*.graph.ts`):
- StateGraph with nodes and edges
- State annotation with ExecutionContext
- Checkpointing for state persistence
- Observability events for progress tracking

**State Annotation** (`*.state.ts`):
- Extends `BaseStateAnnotation` for ExecutionContext fields
- Defines workflow-specific state fields
- Uses `Annotation.Root()` from LangGraph

**Node Functions**:
- Async functions that receive state and return partial state
- Access ExecutionContext from state
- Emit observability events
- Call LLM service when needed

### 2. ExecutionContext in Workflows

- ExecutionContext stored in state annotation
- ExecutionContext flows through all nodes
- ExecutionContext passed to LLM service calls
- ExecutionContext passed to observability events
- Never create ExecutionContext - only receive and pass through

### 3. LLM Service Integration

- LangGraph calls LLM service via HTTP to API endpoint
- Use `LLMHttpClientService` for all LLM calls
- Pass full ExecutionContext in request
- Automatic usage tracking, costing, and PII processing

### 4. Observability Integration

- LangGraph sends observability events via HTTP to API endpoint
- Use `ObservabilityService` for all observability events
- Pass full ExecutionContext in event
- Non-blocking - failures don't break workflow

## Provider Planes Boundary

LangGraph agents do NOT directly access Provider Planes. There is a strict boundary:

**LangGraph -> HTTP -> API Controller -> `@Inject(LLM_SERVICE)` -> Selected Provider**

### Rules for LangGraph Code

- **NEVER** import from `@/planes/` in LangGraph workflow code
- **NEVER** inject `DATABASE_SERVICE`, `LLM_SERVICE`, or other plane symbols directly
- **ALWAYS** use `LLMHttpClientService` to call the API's `/llm/generate` endpoint
- **ALWAYS** use `ObservabilityService` to send events via the API's `/webhooks/status` endpoint
- Infrastructure access flows through `SharedServicesModule` HTTP proxies

### Why This Boundary Exists

Provider Planes select implementations at NestJS bootstrap time via factory modules. LangGraph workflows run as graph executions within the API process but use HTTP-based service access for:
- Clean separation of concerns
- Observability of all LLM calls through a single entry point
- Future ability to run LangGraph externally

### What SharedServicesModule Provides

| Service | What It Does | Plane It Routes Through |
|---------|-------------|------------------------|
| `LLMHttpClientService` | HTTP calls to `/llm/generate` | LLM plane (`LLM_SERVICE`) |
| `ObservabilityService` | HTTP calls to `/webhooks/status` | N/A (direct API service) |
| `PostgresCheckpointerService` | Checkpoint persistence | Database plane (`DATABASE_SERVICE`) |

## File Classification

### Graph Files
- **Location**: `src/agents/[agent-name]/[agent-name].graph.ts`
- **Pattern**: `[agent-name].graph.ts`
- **Structure**: StateGraph builder, nodes, edges, compile
- **Responsibilities**: Workflow orchestration

### State Files
- **Location**: `src/agents/[agent-name]/[agent-name].state.ts`
- **Pattern**: `[agent-name].state.ts`
- **Structure**: `Annotation.Root()` with state fields
- **Responsibilities**: State shape definition

### Service Files
- **Location**: `src/agents/[agent-name]/[agent-name].service.ts`
- **Pattern**: `[agent-name].service.ts`
- **Structure**: `@Injectable`, graph invocation, HITL handling
- **Responsibilities**: Graph lifecycle management

### Tool Files
- **Location**: `src/tools/[tool-name].tool.ts`
- **Pattern**: `[tool-name].tool.ts`
- **Structure**: `@Injectable`, tool methods
- **Responsibilities**: Specific tool operations

## Related Skills

- **execution-context-skill** - ExecutionContext validation (MANDATORY)
- **transport-types-skill** - A2A protocol validation (MANDATORY)
- **planes-architecture-skill** - Provider Planes patterns (LangGraph boundary rules)
- **langgraph-development-skill** - Prescriptive LangGraph building patterns
