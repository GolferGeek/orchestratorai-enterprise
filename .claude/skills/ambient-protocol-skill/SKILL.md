---
name: ambient-protocol-skill
description: Ambient automation patterns in the API's ambient module (apps/api/src/ambient) — event bus, watch listeners and pushed events, trigger evaluation/execution, system-triggered ExecutionContext, invoke dispatch, SSE streaming, and well-known discovery. Use when working on ambient triggers, listeners, workflows, streaming, or the ambient UI.
allowed-tools: Read, Grep, Glob
---

# Ambient Protocol Skill

## Purpose

Ambient is work that comes in from the system, not from a user or a prompt. It has two modes:

- **Watch:** ambient observes a source (database change stream, files, cron).
- **Push:** something hands ambient a named event (`invoice.received`). It is stored in `ambient.events` first, then emitted with its id.

Triggers match a watch source by `source_type`, or a pushed event by name (`source_type: 'event'`, `source_config.event`), then invoke an agent or start a workflow as the system user.

## Where It Lives

| Piece | Location |
|-------|----------|
| API module (NestJS) | `apps/api/src/ambient/` (`ambient.module.ts`, imported by `apps/api/src/app.module.ts`) |
| UI (Vue) | `apps/web/src/modules/ambient/` (views, `stores/ambient.store.ts`, `composables/useApi.ts`, `composables/useSse.ts`) |
| Bridge web | `apps/ambient/bridge/web/` — holds only `eslint.config.js`; no source yet |
| Data | `ambient` schema (`triggers`, `trigger_executions`, …) via `ambient-database/database.service.ts`, which uses `DATABASE_SERVICE` |

**Ambient is internal only.** External agent-to-agent communication belongs to `apps/api/src/secure-conversations/`, not Ambient.

## Module Map (`apps/api/src/ambient/`)

| Folder | Role |
|--------|------|
| `event-bus/` | `AmbientEventBusService` — RxJS subject every source emits `AmbientEvent`s to (`sourceType`: `database` \| `filesystem` \| `cron` \| `event`; a pushed event carries `pushed: {id, name, source}`) |
| `listeners/` | Watch sources: `db-watcher.service.ts` (database change-stream plane), `file-watcher.service.ts` (chokidar, local dev only), `cron-adapter.service.ts`; `listener-registry.service.ts` tracks status |
| `events/` | Push mode: `AmbientEventsService.push(orgSlug, {name, payload, source, dedupeKey?})` stores then emits (a reused dedupe key returns the stored event, `duplicate: true`, and emits nothing); `POST /ambient/events` `{event, payload, dedupeKey?}` (`admin:settings`), `GET /ambient/events[/:id]` (`admin:audit`, `:id` includes the executions it caused) |
| `services/` | `TriggerEvaluatorService` (subscribes to the bus; checks condition, cooldown, `max_fires_per_hour`) → `TriggerExecutorService` (builds context, invokes, records execution) |
| `triggers/` | CRUD + manual run: `/ambient/triggers`, `POST /ambient/triggers/:id/run`, `GET /ambient/triggers/:id/executions` |
| `workflows/` | Workflow definitions/runs: `/ambient/workflows`, `POST /ambient/workflows/:id/execute` (`workflow-executor.service.ts`) |
| `executions/` | `GET /ambient/executions` |
| `scenarios/` | Guided training scenarios: `/ambient/scenarios`, `/ambient/scenarios/outcomes` |
| `automation-context/` | `createSystemTriggeredContext()`, `isSystemTriggered()`, `validateSystemContext()` |
| `invoke/` | Thin A2A edge: `POST /ambient/invoke` → `AmbientDispatchService` |
| `streaming/` | SSE feed: `POST /ambient/streaming/token`, `GET /ambient/streaming/events` |
| `well-known/` | `GET /ambient/.well-known/agent.json` (public) |

Listener endpoints: `GET /ambient/listeners`, `POST /ambient/listeners/simulate/db`, `POST /ambient/listeners/simulate/file`. The simulate endpoints emit straight to the bus, so the full evaluator pipeline runs. Other modules push events through `AmbientEventsService`, never by emitting to the bus themselves.

## Event Flow

```
watch listener (db / file / cron)   or   AmbientEventsService.push → ambient.events row
  → AmbientEventBusService.emit(AmbientEvent)
  → TriggerEvaluatorService   (matchesEvent: source_type, or event name for pushed; condition, cooldown, rate limit; skipped → recorded with skip_reason)
  → TriggerExecutorService    (createSystemTriggeredContext → InvokeDispatchService.invoke)
  → trigger_executions row (event_id for a pushed event) + StreamingService.emitWorkflowCompleted/Failed
```

## System-Triggered ExecutionContext (the only backend exception)

Ambient automation is the **only** sanctioned place backend code creates an ExecutionContext, and it must use `createSystemTriggeredContext()` from `automation-context/automation-context.ts`:

```typescript
const context = createSystemTriggeredContext({
  orgSlug: trigger.org_slug,
  agentSlug: trigger.action_config.agentSlug,
  provider,          // trigger config, else DEFAULT_LLM_PROVIDER — never hardcoded
  model,             // trigger config, else DEFAULT_LLM_MODEL
  conversationId: randomUUID(),  // optional; defaults to NIL_UUID
});
// → userId = NIL_UUID, agentType = 'system'
```

Callers today: `services/trigger-executor.service.ts` and `workflows/workflow-executor.service.ts`. Never hand-build the object literal.

## Invoking Agents

Triggers and workflows reach agents **in-process** through `InvokeDispatchService` (`apps/api/src/agents/invoke/invoke-dispatch.service.ts`) — the same dispatcher behind `POST /invoke`. Pass the whole capsule plus typed `InvokeData`; trigger provenance goes in `metadata`, never in the context:

```typescript
const data: InvokeData = { content: { message, payload }, contentType: 'json' };

const output = await this.invokeDispatch.invoke(context, data, {
  source: 'ambient',
  triggerId: trigger.id,
  triggerName: trigger.name,
  sourceType: trigger.source_type,
  createdBy: trigger.created_by,
});
```

`POST /ambient/invoke` validates with `validateA2AInvokeRequest()` and routes by `context.agentSlug` to handlers registered on `AmbientDispatchService.registerHandler()`. No handlers are registered today, so it returns a JSON-RPC error until one is.

## SSE Streaming

`GET /ambient/streaming/events` is an **org-scoped dashboard feed**, not an invocation stream:

- Auth: Bearer JWT, or a short-lived token from `POST /ambient/streaming/token` (the web client uses `?token=`); token claims must match user, org and `agentSlug: 'ambient'`
- Headers: `text/event-stream`, `no-cache, no-store`, `keep-alive`, `X-Accel-Buffering: no`
- Payload: `AmbientStreamEvent` from `streaming/streaming.service.ts` — `{ orgSlug, type, timestamp, data }` with `type` one of `workflow.triggered`, `workflow.completed`, `workflow.failed`, `listener.fired`, `heartbeat`
- Emit through `StreamingService` helpers (`emitWorkflowTriggered`, `emitWorkflowCompleted`, `emitWorkflowFailed`, `emitListenerFired`); never write to the response directly or leak events across orgs

To add a new event kind, extend the `AmbientStreamEvent['type']` union and add a helper. Per-invocation streams elsewhere use the transport-types `StreamEvent`.

## Observability

Use the observability plane with the full capsule:

```typescript
@Inject(OBSERVABILITY_SERVICE) private readonly observability: ObservabilityServiceProvider

await this.observability.emitInvocationEvent(context, {
  type: 'invocation.started',
  sourceApp: 'ambient',
  message: `Ambient processing ${context.agentSlug}`,
});
// ...then 'invocation.completed' / 'invocation.failed' with success + duration
```

## Checklist

- [ ] New watch sources emit `AmbientEvent` to the bus; anything handing ambient an event uses `AmbientEventsService.push`; neither calls the executor directly
- [ ] Context comes from `createSystemTriggeredContext()`; provider/model from config
- [ ] Agent calls go through `InvokeDispatchService` with `InvokeData`; provenance in `metadata`
- [ ] Every execution (fired, skipped, failed) is recorded in `trigger_executions`
- [ ] SSE events stay org-scoped and use `AmbientStreamEvent`
- [ ] Nothing external-facing is added here; that is secure-conversations

## Related Skills

- **execution-context-skill** — capsule rules; the ambient exception is documented there
- **transport-types-skill** — invoke contract and JSON-RPC shapes
- **planes-architecture-skill** — `DATABASE_SERVICE`, change-stream, and `OBSERVABILITY_SERVICE` injection
