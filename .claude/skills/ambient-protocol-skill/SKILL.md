---
name: ambient-protocol-skill
description: Pulse and Bridge event-driven patterns, A2A alignment with platform standard, SSE streaming, and observability plane integration. Use when working on Pulse or Bridge.
allowed-tools: Read, Grep, Glob
---

# Ambient Protocol Skill

## Purpose

This skill covers event-driven patterns for the Pulse and Bridge products in OrchestratorAI Enterprise. These two products form the **ambient layer** — Pulse watches internal systems and triggers automation, Bridge handles external agent communication.

## The Two Ambient Products

### Pulse: Internal Ambient Automation

**Pulse** watches internal databases, files, and systems, then triggers agent workflows when conditions are met.

- **Location**: `apps/pulse/`
- **Role**: Internal trigger engine
- **Monitors**: Databases, file systems, API endpoints, scheduled events
- **Triggers**: Agent workflows when conditions match
- **Example**: Watch for new rows in `orders` table → trigger fulfillment agent

### Bridge: External A2A Communication

**Bridge** handles inbound and outbound agent-to-agent (A2A) conversations with external systems and agents.

- **Location**: `apps/bridge/`
- **Role**: External communication gateway
- **Handles**: Inbound A2A calls from external agents, outbound A2A calls to external agents
- **Protocol**: Must align with platform A2A standard (JSON-RPC 2.0)
- **Example**: Receive A2A task from Slack agent → route to internal forge agent

## Shared Core Abstractions

Pulse and Bridge share foundational abstractions in `apps/ambient/core/`:

```
apps/ambient/core/
├── trigger/            # Abstract trigger definitions
├── event/              # Event bus and event types
├── workflow/           # Workflow invocation patterns
└── observability/      # Observability integration
```

**Key principle**: Both products extend shared abstractions rather than duplicating logic.

## CRITICAL: A2A Protocol Alignment

**Bridge's external A2A implementation MUST align with the platform A2A standard.**

The platform standard is defined in `packages/transport-types/`. Any A2A communication through Bridge must:

1. Use JSON-RPC 2.0 request/response format
2. Include `ExecutionContext` in all requests
3. Follow mode-specific payload structures (converse, plan, build, hitl)
4. Return proper JSON-RPC success/error responses

### Alignment Risk

Bridge may have developed its own A2A flavor based on the agent-communication pattern it was built from. Before deploying Bridge:

- Read `packages/transport-types/` carefully
- Compare Bridge's A2A request/response with the platform standard
- Reconcile any differences
- Update Bridge to match the platform transport types
- Do NOT create a custom A2A format for Bridge

### Correct A2A in Bridge

```typescript
// CORRECT: Bridge uses platform transport types for all A2A
import { A2ATaskRequest, A2ATaskSuccessResponse } from '@orchestratorai/transport-types';

// Inbound handler - validate incoming A2A requests
async handleInboundA2A(rawRequest: unknown): Promise<A2ATaskSuccessResponse> {
  if (!isA2ATaskRequest(rawRequest)) {
    throw new BadRequestException('Invalid A2A request format');
  }
  const request = rawRequest as A2ATaskRequest;
  // ... process with standard format
}

// Outbound call - use platform format
async callExternalAgent(agentUrl: string, request: A2ATaskRequest): Promise<A2ATaskSuccessResponse> {
  const response = await this.httpService.post(agentUrl, request);
  return response.data as A2ATaskSuccessResponse;
}
```

## SSE Streaming

Both Pulse and Bridge may stream events via SSE (Server-Sent Events).

**SSE must match the platform standard:**

```typescript
// CORRECT: Use platform SSE event types from transport-types
import { SSEEvent, SSEEventType } from '@orchestratorai/transport-types';

// In controller
@Get('stream')
stream(@Res() res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const subscription = this.eventBus.subscribe((event: SSEEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  res.on('close', () => subscription.unsubscribe());
}
```

**Do NOT invent custom SSE formats.** Use the platform types.

## Observability Plane Integration

Both Pulse and Bridge must integrate with the observability plane consistently.

**Pattern**: Use the same `ObservabilityService` as all other products:

```typescript
// In ambient event handler
async handleTrigger(trigger: AmbientTrigger, context: ExecutionContext): Promise<void> {
  await this.observability.emitStarted(
    context,
    context.taskId,
    `Ambient trigger: ${trigger.name}`,
  );

  try {
    await this.workflowService.invoke(trigger.workflow, context);
    await this.observability.emitCompleted(context, context.taskId, { trigger: trigger.name }, 0);
  } catch (error) {
    await this.observability.emitFailed(context, context.taskId, String(error), 0);
    throw error;
  }
}
```

## Demo Architecture Pattern

The ambient products support the platform demo flow:

```
Starter Agent (in Command)
  → sends trigger to Pulse
  → Pulse activates Ambient Trigger
  → Trigger invokes Agent Workflow (via A2A to Forge/Compose agent)
  → Agent Workflow produces Verifiable Outcome
  → Outcome displayed in Command shell
```

This demonstrates the full ambient automation loop for new users.

## Built-in Training Replaces Sandbox

Pulse and Bridge include built-in training/help content that replaces the old Sandbox product:

- Pulse: Includes example triggers and sample monitoring configurations
- Bridge: Includes example external agent configurations and test webhooks
- Help content is served from within the product, not a separate Sandbox app
- Users can explore and test ambient patterns directly in Pulse/Bridge UIs

## Trigger Pattern in Pulse

```typescript
// Trigger definition
export interface AmbientTrigger {
  id: string;
  name: string;
  type: 'database_watch' | 'file_watch' | 'schedule' | 'api_poll';
  condition: TriggerCondition;
  workflow: string;  // Agent slug or workflow ID to invoke
  orgSlug: string;
}

// Trigger evaluation
export class TriggerEvaluatorService {
  async evaluate(trigger: AmbientTrigger, event: SystemEvent): Promise<boolean> {
    // Check if event matches trigger condition
    return this.conditionMatcher.matches(trigger.condition, event);
  }
}
```

## Bridge Routing Pattern

```typescript
// Inbound message routing
export class BridgeRouterService {
  async route(inboundRequest: A2ATaskRequest): Promise<A2ATaskSuccessResponse> {
    const targetAgentSlug = this.resolveTarget(inboundRequest);

    // Route to internal agent via A2A
    const internalEndpoint = `${this.forgeApiUrl}/agent-to-agent/${inboundRequest.params.context.orgSlug}/${targetAgentSlug}/tasks`;

    const response = await this.httpService.post(internalEndpoint, inboundRequest);
    return response.data;
  }
}
```

## Related Skills

- **enterprise-architecture-skill** - Product structure and port assignments
- **transport-types-skill** - A2A protocol standard (CRITICAL for Bridge alignment)
- **execution-context-skill** - ExecutionContext must flow through ambient triggers
- **api-architecture-skill** - NestJS API patterns for Pulse and Bridge APIs
