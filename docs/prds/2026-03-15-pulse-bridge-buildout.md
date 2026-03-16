---
created: 2026-03-15
status: draft
project: Pulse & Bridge Buildout
products: [pulse, bridge]
---

# PRD: Pulse & Bridge Ambient Products — Full Buildout

## Summary

Flesh out the two ambient products — **Pulse** (internal automation) and **Bridge** (external A2A gateway) — from their current stub-with-framework state to production-ready applications. Both apps have working architecture, controllers, services, and Vue frontends, but the actual event sources, workflow execution, database persistence, and ExecutionContext integration are stubbed or missing.

This PRD connects the wiring: real Supabase Realtime subscriptions, real file watchers, real internal A2A bus, real workflow step execution through the planes, database-backed registries, and the protocol factory from the reference implementation.

## Problem

Both Pulse and Bridge exist as apps in `apps/ambient/` with well-structured NestJS APIs and Vue 3 frontends, but:

1. **Pulse listeners are simulated** — db-watcher sends heartbeats, file-watcher and internal-a2a are simulation-only. No real events flow.
2. **Workflow step execution is a no-op** — steps are marked "completed" without doing anything. No LLM calls, no A2A calls, no real actions.
3. **Everything is in-memory** — workflow definitions, listener state, run history. A restart loses everything.
4. **No ExecutionContext flow** — LLM calls don't go through `@orchestratorai/planes`, so no observability or cost attribution.
5. **Bridge's A2A registry is ephemeral** — external agents, trust scores, and message logs disappear on restart.
6. **No connection between Pulse and Bridge** — Pulse should fire A2A calls that Bridge can route externally, but they're disconnected.
7. **No ambient triggers module** — the architecture from the Ambient Triggers PRD (adapters, event bus, rule evaluator, trigger executor) isn't implemented.

## Architecture Principle

**One direct trigger exists: the A2A call. Everything else is ambient.**

Pulse watches internal sources. When it detects something, it makes an A2A call. Bridge receives A2A calls from external agents and routes them to internal agents. The execution pipeline (runners, ExecutionContext, observability, HITL) remains unchanged. Pulse and Bridge are new front doors, not new execution engines.

```
PULSE (Internal)                          BRIDGE (External)
─────────────────                         ─────────────────
DB change detected                        External agent POST /a2a/tasks
File arrives                       ┌──→   Validate signature + origin
Cron fires                         │      Rate limit check
Internal A2A event                 │      Route to Forge or Compose
  ↓                                │        ↓
Normalized AmbientEvent            │      Internal agent executes
  ↓                                │        ↓
Rule Evaluator (conditions)        │      Response signed & returned
  ↓                                │
Trigger Executor                   │      Bridge can also SEND outbound:
  ↓                                │      Internal trigger
Builds ExecutionContext            │        → Sign request
  ↓                                │        → POST to external agent
A2A call to agent ─────────────────┘        → Track trust score
  ↓
Normal pipeline handles it
```

## What Already Exists

### Pulse (apps/ambient/pulse/)

| Layer | Status | What's There |
|-------|--------|-------------|
| **API Structure** | Complete | NestJS modules: health, listeners, workflows, streaming, scenarios, well-known |
| **Listener Registry** | Working | In-memory state machine — register, activate, deactivate, recordFiring |
| **DB Watcher** | Stub | Heartbeat loop only. `simulateEvent()` for demo. No Supabase Realtime. |
| **File Watcher** | Stub | Initialized but no actual fs watcher. `simulateEvent()` only. |
| **Internal A2A Listener** | Stub | Accepts JSON-RPC messages but no broker connection. |
| **Workflow Registry** | Working | In-memory definitions + run history (last 200 runs). No DB. |
| **Workflow Executor** | Stub | `execute()` and `triggerByType()` work, but `runSteps()` is a no-op. |
| **SSE Streaming** | Working | RxJS Subject-based, platform-standard format. |
| **Scenarios** | Working | 4 guided walkthroughs for learning the system. |
| **Vue Frontend** | Working | Dashboard, listeners, workflows, stream, scenarios views. Pinia store. |
| **Tests** | Working | Jest specs for all core services. |

### Bridge (apps/ambient/bridge/)

| Layer | Status | What's There |
|-------|--------|-------------|
| **API Structure** | Complete | NestJS modules: health, inbound, outbound, registry, security, streaming, messaging, training, well-known |
| **Inbound A2A** | Working | POST /a2a/tasks with 4-layer validation (origin, rate limit, JSON-RPC, HMAC-SHA256) |
| **Outbound A2A** | Working | Signed requests, trust score tracking (+5/-10) |
| **External Registry** | Working but ephemeral | In-memory. Discovery via .well-known/agent.json. Trust scoring. |
| **Security** | Working | HMAC-SHA256 signing, replay protection (nonce + 5-min window), timing-safe comparison |
| **Rate Limiter** | Working | Per-agent sliding window (100 req/60s default) |
| **Origin Validator** | Working | Strict/permissive modes, dynamic allowlist |
| **SSE Streaming** | Working | Server-Sent Events with heartbeat |
| **Messaging** | Working | Telegram/WhatsApp webhooks, OpenClaw bridge, message logging |
| **Training** | Working | 4 scenarios: discovery, inbound, outbound, security rejection |
| **Vue Frontend** | Working | Registry, inbound, outbound, security, observability, demo mode, network topology |
| **Tests** | Working | 10 spec files |

### Shared Core (apps/ambient/core/)

| Package | What's There |
|---------|-------------|
| **shared-types** | Agent card, protocol config, message, capability, audit, secure message, provenance types |
| **shared-protocols** | Protocol factory, 13 layers × 31 providers (discovery, transport, identity, payment, encryption, trust, resilience, observability, orchestration, audit, security, negotiation, wallet) |

## Reference Implementation

The `orchestrator-ai-dev/apps/agent-communication/` repo contains a fully working multi-agent communication system with:
- Protocol factory pattern with pluggable providers
- 5 async patterns (fire-and-forget, request-response, callback, polling, streaming)
- Multiple demo agents (research-hub, market-pulse, content-forge)
- WebSocket event broadcasting
- Message recording and persistence

---

## Phase 1: Database Persistence Layer

**Goal:** Stop losing everything on restart. Move from in-memory maps to Supabase tables.

### Database Schema

Create an `ambient` schema in Supabase with tables from the Ambient Triggers PRD:

#### ambient.triggers
Stores trigger definitions for both Pulse (internal) and Bridge (external).

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID PK | |
| org_slug | TEXT NOT NULL | Owning organization |
| name | TEXT NOT NULL | Human-readable name |
| description | TEXT | What and why |
| source_type | TEXT NOT NULL | cron, database, filesystem, internal-a2a, external-a2a |
| product | TEXT NOT NULL | 'pulse' or 'bridge' |
| enabled | BOOLEAN DEFAULT true | On/off |
| source_config | JSONB NOT NULL | Adapter-specific config |
| condition | JSONB | Optional filtering |
| action_config | JSONB NOT NULL | Which agent, mode, payload template |
| cooldown_seconds | INT DEFAULT 0 | Min time between firings |
| max_fires_per_hour | INT | Rate limit |
| last_fired_at | TIMESTAMPTZ | |
| created_by | UUID | |
| created_at | TIMESTAMPTZ DEFAULT now() | |
| updated_at | TIMESTAMPTZ DEFAULT now() | |

#### ambient.trigger_executions
Full audit trail of every trigger evaluation.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID PK | |
| trigger_id | UUID FK → triggers | |
| trigger_name | TEXT | Denormalized |
| source_type | TEXT | Denormalized |
| product | TEXT | 'pulse' or 'bridge' |
| fired_at | TIMESTAMPTZ | When source event occurred |
| source_event | JSONB | Raw event data |
| condition_met | BOOLEAN | Passed filtering? |
| action_taken | BOOLEAN | Agent invoked? |
| skip_reason | TEXT | cooldown / rate_limit / condition_not_met / null |
| execution_context | JSONB | The built ExecutionContext |
| a2a_response | JSONB | Agent response |
| duration_ms | INT | End-to-end time |
| status | TEXT | pending / fired / skipped / failed / completed |

#### ambient.external_agents (Bridge only)
Persists the external agent registry.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID PK | |
| org_slug | TEXT NOT NULL | |
| agent_id | TEXT NOT NULL UNIQUE | External agent identifier |
| name | TEXT | |
| url | TEXT NOT NULL | Base URL |
| agent_card | JSONB | Cached .well-known/agent.json |
| trust_score | INT DEFAULT 0 | 0-100 |
| trust_level | TEXT DEFAULT 'unknown' | unknown / neutral / trusted / untrusted |
| status | TEXT DEFAULT 'offline' | online / offline |
| last_heartbeat | TIMESTAMPTZ | |
| interactions_count | INT DEFAULT 0 | |
| allowed_origin | BOOLEAN DEFAULT false | On origin allowlist? |
| created_at | TIMESTAMPTZ DEFAULT now() | |
| updated_at | TIMESTAMPTZ DEFAULT now() | |

#### ambient.a2a_messages (Bridge only)
Persists A2A message log for audit trail.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID PK | |
| org_slug | TEXT NOT NULL | |
| direction | TEXT NOT NULL | inbound / outbound |
| external_agent_id | TEXT | |
| method | TEXT | JSON-RPC method |
| request_payload | JSONB | |
| response_payload | JSONB | |
| status | TEXT | success / error / rejected / rate_limited |
| rejection_reason | TEXT | |
| duration_ms | INT | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

### Implementation

**Pulse:**
- `WorkflowRegistryService` → load/save workflow definitions from `ambient.triggers` (source_type filter)
- `WorkflowExecutorService` → write execution records to `ambient.trigger_executions`
- `ListenerRegistryService` → persist listener state

**Bridge:**
- `ExternalRegistryService` → back with `ambient.external_agents` table
- `A2AReceiverController` → log inbound messages to `ambient.a2a_messages`
- `A2ASenderService` → log outbound messages to `ambient.a2a_messages`
- Trust score updates → persist to `ambient.external_agents`

### Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_ambient_schema.sql` | New migration |
| `pulse/api/src/workflows/workflow-registry.service.ts` | Replace Map with Supabase queries |
| `pulse/api/src/listeners/listener-registry.service.ts` | Add persistence layer |
| `bridge/api/src/registry/external-registry.service.ts` | Replace Map with Supabase queries |
| `bridge/api/src/inbound/a2a-receiver.controller.ts` | Add message logging |
| `bridge/api/src/outbound/a2a-sender.service.ts` | Add message logging |

---

## Phase 2: Connect Real Event Sources (Pulse)

**Goal:** Replace simulation stubs with real event listeners.

### 2a. Database Watcher — Supabase Realtime

Replace heartbeat-only `DbWatcherService` with actual Supabase Realtime subscription.

```typescript
// Target implementation pattern
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class DbWatcherService implements OnModuleInit {
  private supabase: SupabaseClient;
  private channels: Map<string, RealtimeChannel> = new Map();

  async onModuleInit() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );
    await this.loadAndSubscribe();
  }

  private async loadAndSubscribe() {
    // Load active db-change triggers from ambient.triggers
    const triggers = await this.triggerRegistry.getBySourceType('database');

    for (const trigger of triggers) {
      const { table, schema, events } = trigger.source_config;
      const channel = this.supabase
        .channel(`db-watcher-${trigger.id}`)
        .on('postgres_changes', {
          event: events || '*',  // INSERT, UPDATE, DELETE, or *
          schema: schema || 'public',
          table,
          filter: trigger.source_config.filter,  // Optional row filter
        }, (payload) => {
          this.handleDbEvent(trigger, payload);
        })
        .subscribe();
      this.channels.set(trigger.id, channel);
    }
  }

  private handleDbEvent(trigger: Trigger, payload: RealtimePostgresChangesPayload) {
    // Emit normalized AmbientEvent to event bus
    this.eventBus.emit({
      sourceType: 'database',
      triggerId: trigger.id,
      triggerName: trigger.name,
      payload: {
        table: payload.table,
        schema: payload.schema,
        eventType: payload.eventType,
        old: payload.old,
        new: payload.new,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
```

**Watched tables (starter set):**
- `conversations` — new conversation started → could trigger greeting agent
- `tasks` — task status change → could trigger follow-up workflow
- `agents` — agent registered/updated → could trigger validation workflow
- Any table the org configures via the trigger definition UI

### 2b. File Watcher — Chokidar

Replace simulation-only `FileWatcherService` with real filesystem monitoring.

```typescript
import * as chokidar from 'chokidar';

@Injectable()
export class FileWatcherService implements OnModuleInit, OnModuleDestroy {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();

  async onModuleInit() {
    const triggers = await this.triggerRegistry.getBySourceType('filesystem');

    for (const trigger of triggers) {
      const { path, events, pattern } = trigger.source_config;
      const watcher = chokidar.watch(path, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
      });

      if (!events || events.includes('add')) {
        watcher.on('add', (filePath) => this.handleFileEvent(trigger, 'add', filePath));
      }
      if (!events || events.includes('change')) {
        watcher.on('change', (filePath) => this.handleFileEvent(trigger, 'change', filePath));
      }
      if (!events || events.includes('unlink')) {
        watcher.on('unlink', (filePath) => this.handleFileEvent(trigger, 'unlink', filePath));
      }

      this.watchers.set(trigger.id, watcher);
    }
  }

  async onModuleDestroy() {
    for (const watcher of this.watchers.values()) {
      await watcher.close();
    }
  }
}
```

### 2c. Internal A2A Listener — Event Bus

Connect `InternalA2AListenerService` to an RxJS event bus that other products can emit to.

The internal A2A listener receives messages from other OrchestratorAI products (Forge, Compose, Flow) via HTTP POST. This is the "nervous system" — when one agent completes work, it can notify Pulse, which triggers the next workflow.

```typescript
@Controller('internal')
export class InternalA2AController {
  @Post('event')
  async receiveInternalEvent(@Body() event: InternalA2AEvent) {
    // Validate it's from an internal product (check origin, not external)
    // Emit to event bus for trigger evaluation
    this.eventBus.emit({
      sourceType: 'internal-a2a',
      payload: event,
      timestamp: new Date().toISOString(),
    });
    return { received: true };
  }
}
```

### 2d. Cron Adapter

Add scheduled trigger support using NestJS `@nestjs/schedule`.

```typescript
@Injectable()
export class CronAdapterService implements OnModuleInit {
  private scheduledJobs: Map<string, ScheduledTask> = new Map();

  async onModuleInit() {
    const triggers = await this.triggerRegistry.getBySourceType('cron');
    for (const trigger of triggers) {
      const job = new CronJob(trigger.source_config.expression, () => {
        this.eventBus.emit({
          sourceType: 'cron',
          triggerId: trigger.id,
          triggerName: trigger.name,
          payload: { scheduledAt: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        });
      });
      job.start();
      this.scheduledJobs.set(trigger.id, job);
    }
  }
}
```

### Files to Create/Modify

| File | Change |
|------|--------|
| `pulse/api/src/event-bus/ambient-event-bus.service.ts` | **New** — RxJS Subject event bus |
| `pulse/api/src/event-bus/event-bus.module.ts` | **New** — Module |
| `pulse/api/src/listeners/db-watcher.service.ts` | Replace heartbeat with Supabase Realtime |
| `pulse/api/src/listeners/file-watcher.service.ts` | Replace stub with chokidar |
| `pulse/api/src/listeners/internal-a2a-listener.service.ts` | Add HTTP endpoint + event bus emit |
| `pulse/api/src/listeners/cron-adapter.service.ts` | **New** — Cron trigger adapter |
| `pulse/api/src/services/trigger-evaluator.service.ts` | **New** — Conditions, cooldowns, rate limits |
| `pulse/api/src/services/trigger-executor.service.ts` | **New** — Builds ExecutionContext, makes A2A call |
| `pulse/api/package.json` | Add `@supabase/supabase-js`, `chokidar`, `@nestjs/schedule`, `cron` |

---

## Phase 3: Workflow Execution with ExecutionContext (Pulse)

**Goal:** Make workflow steps actually do things via the standard agent pipeline.

### Trigger Executor

When a trigger fires and passes evaluation, the Trigger Executor:

1. **Builds an ExecutionContext** from the trigger's `action_config`:
   ```typescript
   const context: ExecutionContext = {
     orgSlug: trigger.org_slug,
     userId: trigger.created_by || 'system',
     conversationId: uuidv4(),  // New conversation per trigger fire
     taskId: uuidv4(),
     planId: NIL_UUID,
     deliverableId: NIL_UUID,
     agentSlug: trigger.action_config.agentSlug,
     agentType: trigger.action_config.agentType,
     provider: trigger.action_config.provider || 'default',
     model: trigger.action_config.model || 'default',
   };
   ```

2. **Makes an A2A call** to the target agent (Forge or Compose):
   ```typescript
   const a2aRequest = {
     jsonrpc: '2.0',
     id: uuidv4(),
     method: `${trigger.action_config.mode}.${trigger.action_config.action}`,
     params: {
       context,
       mode: trigger.action_config.mode,
       userMessage: this.buildUserMessage(trigger, sourceEvent),
       payload: trigger.action_config.payload,
     },
   };

   // Route to correct internal product
   const targetPort = trigger.action_config.agentType === 'langgraph' ? 6200 : 6300;
   const response = await fetch(`http://localhost:${targetPort}/a2a`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(a2aRequest),
   });
   ```

3. **Records the execution** in `ambient.trigger_executions`

4. **Emits SSE events** for real-time UI updates

### Files to Create/Modify

| File | Change |
|------|--------|
| `pulse/api/src/services/trigger-executor.service.ts` | Build ExecutionContext + A2A call |
| `pulse/api/src/workflows/workflow-executor.service.ts` | Replace no-op `runSteps()` with trigger executor calls |
| `pulse/api/src/services/trigger-evaluator.service.ts` | Condition checking, cooldown enforcement, rate limiting |

---

## Phase 4: Bridge Database Persistence & ExecutionContext

**Goal:** Bridge stops losing state on restart and integrates with observability.

### 4a. Persistent External Agent Registry

Replace in-memory `Map<string, AgentInfo>` in `ExternalRegistryService` with Supabase:

- `discoverAgent(url)` → fetch card, upsert into `ambient.external_agents`
- `updateTrustScore()` → update `ambient.external_agents`
- `getAllAgents()` → query `ambient.external_agents`
- Heartbeat tracking → update `last_heartbeat` column

### 4b. A2A Message Audit Trail

Every inbound and outbound A2A message logged to `ambient.a2a_messages`:

- Inbound: log before routing, update status after response
- Outbound: log before sending, update with response
- Rejections: log with rejection reason (rate limited, invalid signature, unknown origin)

### 4c. ExecutionContext on Inbound Routing

When Bridge receives an inbound A2A request and routes to Forge/Compose, it should either:
- **Pass through** the ExecutionContext from the external agent (if provided)
- **Construct one** marking the source as external: `userId: 'external:<agentId>'`

### Files to Modify

| File | Change |
|------|--------|
| `bridge/api/src/registry/external-registry.service.ts` | Replace Map with Supabase queries |
| `bridge/api/src/inbound/a2a-receiver.controller.ts` | Add message logging, ExecutionContext construction |
| `bridge/api/src/inbound/a2a-router.service.ts` | Pass ExecutionContext to Forge/Compose |
| `bridge/api/src/outbound/a2a-sender.service.ts` | Add message logging |
| `bridge/api/src/security/signing.service.ts` | No change (already production-grade) |

---

## Phase 5: Protocol Factory Integration (Bridge)

**Goal:** Leverage the shared-protocols package from `apps/ambient/core/` for pluggable protocol support.

The `core/shared-protocols/` package already contains 13 protocol layers × 31 providers. Bridge should use the `ProtocolFactory` for:

### Discovery
- Use `WellKnownDiscoveryProvider` for agent card fetching (already implemented manually — switch to factory)
- Add `A2AAgentCardProvider` for Google A2A spec compliance

### Transport
- Current: direct HTTP fetch. Switch to `A2AJsonRpcTransportProvider` for standards compliance
- Add `WebSocketTransportProvider` for persistent connections to frequently-called external agents

### Identity
- Current: HMAC-SHA256 only. Add `OAuthJWTIdentityProvider` for JWT-based auth with external agents
- Keep HMAC as fallback for agents that don't support JWT

### Trust
- Current: custom trust scoring. Align with `ReputationTrustProvider` from shared-protocols
- Add `FirstContactTrustProvider` for handling unknown agents safely

### Resilience
- Add `CircuitBreakerResilienceProvider` for external agents that go down
- Add `RetryResilienceProvider` with exponential backoff

### Implementation

```typescript
// Bridge bootstraps ProtocolFactory with selected providers
@Injectable()
export class BridgeProtocolService implements OnModuleInit {
  private factory: ProtocolFactory;

  onModuleInit() {
    this.factory = new ProtocolFactory();
    this.factory.setConfig({
      discovery: 'well-known',
      transport: 'a2a-jsonrpc',
      identity: 'oauth-jwt',
      trust: 'reputation',
      resilience: 'circuit-breaker',
      observability: 'file-log',
      audit: 'hash-chain',
      encryption: 'envelope',
      // Payment, wallet, negotiation — Phase 6
    });
  }

  async sendToExternalAgent(agentUrl: string, request: JsonRpcRequest) {
    const discovery = this.factory.resolve('discovery');
    const transport = this.factory.resolve('transport');
    const identity = this.factory.resolve('identity');
    const trust = this.factory.resolve('trust');
    const resilience = this.factory.resolve('resilience');
    const audit = this.factory.resolve('audit');

    // 1. Discover
    const card = await discovery.discoverAgent(agentUrl);

    // 2. Evaluate trust
    const trustResult = await trust.evaluate(card.id);
    if (trustResult.level === 'untrusted') throw new ForbiddenException();

    // 3. Sign
    const signed = await identity.sign(request);

    // 4. Send with resilience
    const response = await resilience.execute(() =>
      transport.send(agentUrl, signed)
    );

    // 5. Audit
    await audit.append({ eventType: 'outbound_a2a', agentId: card.id, response });

    return response;
  }
}
```

### Files to Create/Modify

| File | Change |
|------|--------|
| `bridge/api/src/protocol/bridge-protocol.service.ts` | **New** — ProtocolFactory wrapper |
| `bridge/api/src/protocol/protocol.module.ts` | **New** — Module |
| `bridge/api/src/outbound/a2a-sender.service.ts` | Use protocol service instead of direct fetch |
| `bridge/api/src/inbound/a2a-validator.service.ts` | Use identity provider for signature validation |
| `bridge/api/src/registry/external-registry.service.ts` | Use discovery provider for agent card fetching |
| `bridge/api/package.json` | Add `apps/ambient/core/shared-protocols` dependency |

---

## Phase 6: Pulse ↔ Bridge Connection

**Goal:** Internal events in Pulse can trigger external A2A calls via Bridge, and Bridge inbound requests can trigger Pulse workflows.

### Pulse → Bridge (Internal event triggers external call)

A trigger's `action_config` can specify `target: 'bridge'` with an external agent:

```typescript
// Trigger definition example
{
  name: 'Notify external partner on order completion',
  source_type: 'database',
  source_config: { table: 'orders', schema: 'public', events: ['UPDATE'] },
  condition: { field: 'status', equals: 'completed' },
  action_config: {
    target: 'bridge',
    externalAgentId: 'partner-agent-001',
    method: 'order.completed',
    payload: { template: 'order_notification' },
  },
}
```

When this fires, the Trigger Executor calls Bridge's outbound API instead of Forge/Compose:

```typescript
if (trigger.action_config.target === 'bridge') {
  await fetch('http://localhost:6600/a2a/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetAgentId: trigger.action_config.externalAgentId,
      request: { jsonrpc: '2.0', method: trigger.action_config.method, params: { ... } },
    }),
  });
}
```

### Bridge → Pulse (External request triggers internal workflow)

Bridge's `A2ARouterService` gains a new routing option:

```typescript
// In a2a-router.service.ts
if (method.startsWith('pulse.') || method.startsWith('ambient.')) {
  return this.routeToPulse(request);  // POST http://localhost:6500/internal/event
}
```

This lets external agents trigger internal ambient workflows — e.g., an external monitoring agent detects an issue and tells our system to react.

### Files to Modify

| File | Change |
|------|--------|
| `pulse/api/src/services/trigger-executor.service.ts` | Add bridge routing for external targets |
| `bridge/api/src/inbound/a2a-router.service.ts` | Add Pulse routing for pulse.* methods |

---

## Phase 7: Frontend Enhancements

**Goal:** Both Vue frontends show real data and real-time events.

### Pulse Frontend

| View | Enhancement |
|------|-------------|
| **DashboardView** | Show real listener status (connected/disconnected), recent trigger fires, active workflows |
| **ListenersView** | Real-time listener status from Supabase, enable/disable controls, live event count |
| **WorkflowsView** | CRUD for trigger definitions (create, edit, enable/disable), execution history from DB |
| **StreamView** | Already works — just needs real events flowing |
| **New: TriggersView** | Full trigger management — create triggers with source type picker, condition builder, action config |

### Bridge Frontend

| View | Enhancement |
|------|-------------|
| **RegistryView** | Persistent agent list from DB, trust score history, last interaction time |
| **InboundView** | Message log from DB with filtering (by agent, status, date range) |
| **OutboundView** | Outbound message history, success/failure rates per agent |
| **SecurityView** | Rate limit status, blocked requests, origin allowlist management |
| **ObservabilityView** | Real-time SSE events + historical query from DB |

---

## Dependencies

### New npm packages

| Package | Product | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | Both | Database persistence + Realtime subscriptions |
| `chokidar` | Pulse | File system watching |
| `@nestjs/schedule` | Pulse | Cron trigger scheduling |
| `cron` | Pulse | Cron expression parsing |

### Existing packages (already in monorepo)

| Package | Purpose |
|---------|---------|
| `@orchestratorai/transport-types` | ExecutionContext, A2A JSON-RPC types |
| `@orchestratorai/planes` | LLM service for workflow steps |
| `apps/ambient/core/shared-protocols` | Protocol factory for Bridge |
| `apps/ambient/core/shared-types` | Agent card, message, capability types |

### Infrastructure

- Supabase migration for `ambient` schema (4 tables)
- No new Docker containers
- No new external services

---

## Success Criteria

### Pulse
1. A database INSERT on a watched table triggers a real agent workflow within 5 seconds
2. A file arriving in a watched directory triggers a real agent workflow
3. A cron schedule fires a trigger at the configured time
4. Workflow definitions persist across API restarts
5. Trigger execution history is queryable from the frontend
6. SSE stream shows real events as they happen
7. All LLM calls go through `@orchestratorai/planes` with ExecutionContext

### Bridge
1. External agent registry persists across restarts
2. Trust scores accumulate and persist
3. All A2A messages (inbound + outbound) are logged and queryable
4. Protocol factory is used for outbound calls (pluggable providers)
5. Circuit breaker prevents hammering down external agents
6. Inbound requests construct proper ExecutionContext before routing

### Integration
1. Pulse trigger can fire an outbound A2A call via Bridge
2. External agent can trigger a Pulse workflow via Bridge inbound
3. Both products share the `ambient` schema without conflicts
4. Both products use `apps/ambient/core/` shared protocols

---

## Phases Summary

| Phase | Focus | Products | Estimated Complexity |
|-------|-------|----------|---------------------|
| 1 | Database persistence | Both | Medium — migration + service refactoring |
| 2 | Real event sources | Pulse | High — Supabase Realtime, chokidar, event bus |
| 3 | Workflow execution with ExecutionContext | Pulse | Medium — trigger executor + A2A calls |
| 4 | Bridge persistence + ExecutionContext | Bridge | Medium — service refactoring |
| 5 | Protocol factory integration | Bridge | Medium — wire existing shared-protocols |
| 6 | Pulse ↔ Bridge connection | Both | Low — routing rules |
| 7 | Frontend enhancements | Both | Medium — real data binding |

Phases 1-3 can be done first (Pulse becomes useful). Phase 4-5 can run in parallel (Bridge becomes persistent). Phase 6-7 tie everything together.
