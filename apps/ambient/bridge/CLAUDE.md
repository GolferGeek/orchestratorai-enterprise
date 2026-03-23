# Bridge (External A2A Communication)

## FORBIDDEN — Do Not Create These Directories

- **NO `llms/` directory** — use `LLM_SERVICE` from `@orchestratorai/planes/llm`
- **NO `observability/` directory** — use `OBSERVABILITY_SERVICE` from `@orchestratorai/planes/observability`
- **NO `planes/` directory** — all planes live in `packages/planes/`
- **NO `supabase-core/` directory** — Supabase is an internal detail of the database plane
- **NO `agent2agent/` directory** — `invoke/` is the entry point
- **NO `agent-platform/` directory** — removed, agent definitions come from the database

If any of these directories currently exist, they are legacy and must NOT be extended. New code must use the shared planes from `packages/planes/`.

---

## Why This Product Exists

Bridge exists because **external communication has fundamentally different concerns than internal processing**. When everything was in one app, external-facing security code (request signing, origin validation, rate limiting, trust negotiation) was tangled with internal event processing. A developer adding a new external agent partner had to worry about breaking internal automation. Bridge solves this by owning the entire external trust boundary.

Bridge is the **outward-facing** ambient product. It connects OrchestratorAI Enterprise agents to the outside world via the A2A protocol. It does NOT process events internally — that's Pulse's job. It does NOT render dashboards — that's Forge's job. It communicates.

## Core Architectural Philosophy

### Invoke Contract

Bridge exposes the standard invoke endpoints:

```
POST /invoke        — synchronous execution
POST /invoke/stream — SSE streaming execution
```

Request shape (JSON-RPC 2.0):
```json
{
  "jsonrpc": "2.0",
  "id": "...",
  "method": "invoke",
  "params": { "context": { ... }, "data": { ... }, "metadata": { ... } }
}
```

The `invoke/` directory handles this:
- **BridgeInvokeController** — accepts invoke requests
- **BridgeDispatchService** — routes to internal products or external agents

Bridge-specific metadata (origin, signing info, rate limit state) stays in the `metadata` field of the invoke params — not in the shared ExecutionContext.

### Security-First External Protocol

Bridge's primary concern is **trust at the boundary**. Every external request is untrusted until verified:

```typescript
// Bridge validates everything from the outside world
async handleInbound(request: InvokeRequest): Promise<InvokeResponse> {
  await this.validateSignature(request);      // Cryptographic verification
  await this.validateOrigin(request.origin);  // Known agent registry check
  await this.rateLimiter.check(request.origin); // Rate limiting
  // Only then route internally
}
```

This is fundamentally different from Pulse, which trusts its own internal event sources. Bridge treats every external message as potentially hostile.

### Clean Routing, Not Processing

Bridge **routes** requests to internal processing (Pulse, Forge, Compose) — it does not run business logic itself:

```typescript
// Bridge routes, it doesn't process
const result = await this.routeToInternalAgent(agentSlug, payload, context);
// Route to Pulse for processing agents
// Route to Forge for dashboard agents
// Route to Compose for simple agents
```

## Port Assignments

- API: 6600 (dev) / 7600 (prod)
- Web: 6601 (dev) / 7601 (prod)

## Architecture

```
apps/ambient/bridge/api/src/
  invoke/
    invoke.controller.ts            ← POST /invoke, POST /invoke/stream (BridgeInvokeController)
    bridge-dispatch.service.ts      ← Routes invoke to internal products or external agents
  inbound/                          ← Receives external A2A requests
  outbound/                         ← Sends signed requests to external agents
  planes/
    database/                       ← Database plane for Bridge-specific storage
  protocol/                         ← A2A protocol implementation
  registry/                         ← External agent registry
  security/
    signing.service.ts              ← Request signing (ambient/core security envelope)
    rate-limiter.service.ts         ← Rate limiting for external endpoints
    origin-validator.service.ts     ← External agent origin verification
  streaming/                        ← Platform-standard SSE
  messaging/                        ← Message handling
  training/                         ← Training data management
  well-known/                       ← Agent discovery endpoint
```

## Security Posture

Bridge's security concerns are **external trust boundary** focused:
- **Request signing** — every outbound request is cryptographically signed
- **Signature verification** — every inbound request's signature is verified
- **Origin validation** — only known, registered external agents can communicate
- **Rate limiting** — external agents are rate-limited per origin
- **Message logging** — all external A2A exchanges are logged for audit

This is categorically different from Pulse's security (internal trust, org-scoped access) and from Auth's security (user identity, JWT tokens).

## What Does NOT Belong Here

- **Internal event processing** (DB watchers, file watchers, cron triggers) — Pulse
- **Business logic / agent processing** (predictions, risk analysis) — Pulse
- **Dashboard rendering** — Forge Web
- **Simple agent runners** — Compose
- **User/org management** — Auth API

## Dependencies

- `@orchestratorai/transport-types` — invoke contract types, JSON-RPC 2.0 format
- Platform planes (DATABASE_SERVICE) — Bridge-specific storage
- Auth API (port 6100) — JWT validation
- Supabase (REST 54321, Postgres 54322) — A2A message logs, external agent registry
- Internal APIs: Pulse (6500), Forge (6200), Compose (6300) — routing targets
