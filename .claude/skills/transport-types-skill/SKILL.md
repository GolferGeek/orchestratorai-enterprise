---
name: transport-types-skill
description: Enforce A2A (Agent-to-Agent) protocol compliance and transport type contracts. All agent-to-agent calls MUST follow JSON-RPC 2.0 format with strict transport type adherence. Use when reviewing code that makes or handles agent calls, API endpoints for agents, or when ensuring A2A protocol compliance.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Transport Types & A2A Compliance Skill

This skill enforces **A2A (Agent-to-Agent) protocol compliance** and ensures all agent calls follow the strict transport type contracts defined in `@orchestratorai/transport-types`.

## Core Principle: Transport Types Are the Contract

**Transport types define the API contract between frontend and backend.** They MUST be followed exactly. Any deviation breaks A2A compliance and can cause system-wide failures.

### Critical Rules

1. **NEVER modify transport types** without updating both frontend and backend
2. **NEVER add custom fields** to transport type payloads
3. **NEVER skip required fields** in transport types
4. **ALWAYS use types from `@orchestratorai/transport-types`** package
5. **ALWAYS validate** transport types at API boundaries

## What Are Transport Types?

Transport types are **shared TypeScript types** in `packages/transport-types/` that define:
- JSON-RPC 2.0 request/response structure
- A2A task request/response structure
- Mode-specific payloads (plan, build, converse, hitl)
- ExecutionContext (the context capsule)
- SSE (Server-Sent Events) streaming types

**Package:** `@orchestratorai/transport-types`
**Location:** `packages/transport-types/`

## A2A Protocol Structure

All A2A requests are **JSON-RPC 2.0** format with A2A-specific params:

**Request:**
```typescript
{
  jsonrpc: "2.0",  // MUST be exactly "2.0"
  method: string,  // Maps to AgentTaskMode
  id: string | number | null,
  params: {
    context: ExecutionContext,  // REQUIRED
    mode: AgentTaskMode,  // REQUIRED
    payload: { action: string, ... },  // REQUIRED - mode-specific
    userMessage: string,  // REQUIRED (can be empty)
    messages?: TaskMessage[]
  }
}
```

**Success Response:**
```typescript
{
  jsonrpc: "2.0",
  id: string | number | null,
  result: {
    success: boolean,
    mode: string,
    payload: {
      content: any,
      metadata: Record<string, any>
    },
    context?: ExecutionContext
  }
}
```

**Error Response:**
```typescript
{
  jsonrpc: "2.0",
  id: string | number | null,
  error: {
    code: number,
    message: string,
    data?: any
  }
}
```

## Mode-Specific Payloads

Each mode has **specific payload structures** defined in transport types:

- **Plan Mode**: Actions `create`, `read`, `list`, `edit`, `rerun`, `set_current`, `delete_version`, `merge_versions`, `copy_version`, `delete`
- **Build Mode**: Same actions as Plan mode
- **Converse Mode**: No actions - just conversational interaction
- **HITL Mode**: Actions `resume`, `status`, `history`, `pending`

## When Transport Types Apply

### MUST Use Transport Types

- **All agent-to-agent calls** (frontend → backend agent endpoints)
- **All A2A protocol endpoints** (`/agent-to-agent/:orgSlug/:agentSlug/tasks`)
- **All mode-specific operations** (plan, build, converse, hitl)
- **All external agent calls** (calling other A2A-compatible agents)
- **All SSE streaming events** (task progress, agent chunks)

### DON'T Use Transport Types

- **Non-A2A endpoints** (e.g., `/api/conversations`, `/api/users` - regular REST endpoints)
- **Front-end data fetching** (e.g., getting conversation list, user profile)
- **Internal service-to-service calls** (within backend, not A2A protocol)
- **Database queries** (direct database access)

**Key Distinction:** If it's an **agent call** (converse, plan, build, hitl), it MUST use transport types. If it's just **data retrieval** for the UI, it can use regular REST.

## Common Violations to Find

When reviewing code, look for:

1. **Custom fields** in payloads not defined in transport types
2. **Missing required fields** in A2A requests/responses
3. **Wrong JSON-RPC structure** (missing `jsonrpc: "2.0"`, wrong field names)
4. **Missing ExecutionContext** in request params
5. **Using transport types for non-A2A endpoints** (regular REST endpoints)
6. **Modifying transport types** without coordinating with frontend/backend
7. **Type assertions** that bypass transport type validation
8. **Custom response formats** instead of JSON-RPC structure

## Quick Reference

**Import transport types:**
```typescript
import {
  A2ATaskRequest,
  A2ATaskSuccessResponse,
  AgentTaskMode,
  ExecutionContext,
  PlanCreatePayload,
  BuildCreatePayload,
  ConverseModePayload,
} from '@orchestratorai/transport-types';
```

**Validate requests:**
```typescript
import { isA2ATaskRequest, isExecutionContext } from '@orchestratorai/transport-types';

if (!isA2ATaskRequest(req.body)) {
  throw new BadRequestException('Invalid A2A request format');
}
```

## Integration with Other Skills

- **execution-context-skill**: Ensures ExecutionContext is always included in A2A requests
- **quality-gates-skill**: Validates transport types during PR review
- **codebase-hardening-skill**: Audits codebase for transport type violations

## Related Files

- **Transport Types Package**: `packages/transport-types/`
- **JSON-RPC Types**: `packages/transport-types/request/json-rpc.types.ts`
- **Task Request Types**: `packages/transport-types/request/task-request.types.ts`
- **Task Response Types**: `packages/transport-types/response/task-response.types.ts`
- **Mode Types**: `packages/transport-types/modes/*.types.ts`
