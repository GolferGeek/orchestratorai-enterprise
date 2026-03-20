---
name: ambient-protocol-skill
description: Pulse and Bridge event-driven patterns, A2A alignment with platform invoke contract, SSE streaming, and observability plane integration. Use when working on Pulse or Bridge.
allowed-tools: Read, Grep, Glob
---

# Ambient Protocol Skill

## Purpose

This skill covers event-driven patterns for the Pulse and Bridge products in OrchestratorAI Enterprise. These two products form the **ambient layer** — Pulse watches internal systems and triggers automation, Bridge handles external agent communication.

## The Two Ambient Products

### Pulse: Internal Ambient Automation

**Pulse** watches internal databases, files, and systems, then triggers agent workflows when conditions are met.

- **Location**: `apps/pulse/`
- **Role**: Internal trigger engine, event-driven automation
- **Monitors**: Databases, file systems, API endpoints, scheduled events
- **Triggers**: Agent workflows when conditions match
- **EC Exception**: Pulse is the ONLY backend that constructs ExecutionContext via `createSystemTriggeredContext()`, because system-triggered automation has no frontend user
- **A2A Edge**: Thin A2A edge — Pulse invokes other products via the standard `POST /invoke` contract
- **Example**: Watch for new rows in `orders` table → trigger fulfillment agent via invoke

### Bridge: External A2A Communication

**Bridge** handles inbound and outbound agent-to-agent (A2A) conversations with external systems and agents.

- **Location**: `apps/bridge/`
- **Role**: External communication gateway, protocol translation
- **Handles**: Inbound A2A calls from external agents, outbound A2A calls to external agents
- **Protocol**: Translates between external protocols and the platform invoke contract
- **Metadata Rule**: External protocol metadata goes in the `metadata` field of the invoke contract, NOT in ExecutionContext
- **Example**: Receive A2A task from Slack agent → translate to invoke request → route to internal agent

## CRITICAL: Invoke Contract Alignment

**Both Pulse and Bridge MUST use the platform invoke contract** for all A2A communication.

The platform standard is defined in `packages/transport-types/`. All communication must:

1. Use JSON-RPC 2.0 request/response format with `method: "invoke"`
2. Include `ExecutionContext` in all requests
3. Use `InvokeData` for request payloads and `InvokeOutput` for responses
4. Return proper JSON-RPC success/error responses

### Bridge: Protocol Translation

Bridge translates external protocols into the platform invoke contract. External metadata (protocol headers, source identifiers, etc.) goes in the `metadata` field:

```typescript
// CORRECT: Bridge translates external format to platform invoke contract
import { ExecutionContext, InvokeData, InvokeOutput } from '@orchestrator-ai/transport-types';

// Inbound handler — translate external protocol to invoke
async handleInbound(externalRequest: unknown): Promise<InvokeOutput> {
  const invokeData: InvokeData = {
    content: this.extractContent(externalRequest),
    contentType: 'text',
  };

  const context = this.buildContextFromExternal(externalRequest);

  // Metadata from external protocol goes in metadata, NOT context
  const metadata = {
    sourceProtocol: 'slack',
    sourceAgentId: externalRequest.agentId,
  };

  return this.invokeService.invoke(context, invokeData, metadata);
}

// Outbound call — use platform invoke format
async callExternalAgent(agentUrl: string, context: ExecutionContext, data: InvokeData): Promise<InvokeOutput> {
  const request = {
    jsonrpc: "2.0",
    method: "invoke",
    id: generateId(),
    params: { context, data },
  };
  const response = await this.httpService.post(agentUrl, request);
  return response.data.result.output;
}
```

### Pulse: System-Triggered Invocation

Pulse constructs ExecutionContext for system-triggered automation using `createSystemTriggeredContext()`:

```typescript
// Pulse trigger handler — system-initiated, no frontend user
async handleTrigger(trigger: AmbientTrigger): Promise<void> {
  // Pulse is the ONLY backend that constructs EC
  const context = createSystemTriggeredContext({
    orgSlug: trigger.orgSlug,
    agentSlug: trigger.agentSlug,
    agentType: 'automation',
    provider: 'system',
    model: 'system',
  });

  const data: InvokeData = {
    content: { trigger: trigger.name, event: trigger.lastEvent },
    contentType: 'json',
  };

  // Invoke target agent via standard contract
  await this.invokeService.invoke(context, data);
}
```

## SSE Streaming

Both Pulse and Bridge may stream events via SSE (Server-Sent Events).

**SSE must use the platform StreamEvent types:**

```typescript
// CORRECT: Use platform stream event types from transport-types
import { StreamEvent } from '@orchestrator-ai/transport-types';

// In controller
@Get('stream')
stream(@Res() res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const subscription = this.eventBus.subscribe((event: StreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  res.on('close', () => subscription.unsubscribe());
}
```

StreamEvent types: `started`, `chunk`, `progress`, `output`, `completed`, `error`.

**Do NOT invent custom SSE formats.** Use the platform types.

## Observability Plane Integration

Both Pulse and Bridge must integrate with the observability plane via `OBSERVABILITY_SERVICE`:

```typescript
// In ambient event handler
@Inject(OBSERVABILITY_SERVICE) private readonly observability: ObservabilityService

async handleTrigger(trigger: AmbientTrigger, context: ExecutionContext): Promise<void> {
  await this.observability.emitStarted(context, `Ambient trigger: ${trigger.name}`);

  try {
    await this.invokeService.invoke(context, data);
    await this.observability.emitCompleted(context, { trigger: trigger.name });
  } catch (error) {
    await this.observability.emitFailed(context, String(error));
    throw error;
  }
}
```

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
  async route(context: ExecutionContext, data: InvokeData, metadata?: Record<string, unknown>): Promise<InvokeOutput> {
    const targetAgentSlug = this.resolveTarget(context, metadata);

    // Route to internal agent via standard invoke contract
    const internalEndpoint = `${this.getProductUrl(targetAgentSlug)}/invoke`;

    const request = {
      jsonrpc: "2.0",
      method: "invoke",
      id: generateId(),
      params: { context, data, metadata },
    };

    const response = await this.httpService.post(internalEndpoint, request);
    return response.data.result.output;
  }
}
```

## Related Skills

- **enterprise-architecture-skill** — Product structure and port assignments
- **transport-types-skill** — Invoke protocol standard (CRITICAL for Bridge alignment)
- **execution-context-skill** — ExecutionContext must flow through ambient triggers; Pulse exception documented there
- **api-architecture-skill** — NestJS API patterns for Pulse and Bridge APIs
- **planes-architecture-skill** — OBSERVABILITY_SERVICE injection for ambient products
