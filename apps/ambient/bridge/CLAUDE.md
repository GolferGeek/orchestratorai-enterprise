# Bridge (External A2A Communication)

## Why This Product Exists

Bridge exists because **external communication has fundamentally different concerns than internal processing**. When everything was in one app, external-facing security code (request signing, origin validation, rate limiting, trust negotiation) was tangled with internal event processing. A developer adding a new external agent partner had to worry about breaking internal automation. Bridge solves this by owning the entire external trust boundary.

Bridge is the **outward-facing** ambient product. It connects OrchestratorAI Enterprise agents to the outside world via the A2A protocol. It does NOT process events internally — that's Pulse's job. It does NOT render dashboards — that's Forge's job. It communicates.

## Core Architectural Philosophy

### Security-First External Protocol

Bridge's primary concern is **trust at the boundary**. Every external request is untrusted until verified:

```typescript
// Bridge validates everything from the outside world
async handleInbound(request: A2ARequest): Promise<A2AResponse> {
  await this.validateSignature(request);      // Cryptographic verification
  await this.validateOrigin(request.origin);  // Known agent registry check
  await this.rateLimiter.check(request.origin); // Rate limiting
  // Only then route internally
}
```

This is fundamentally different from Pulse, which trusts its own internal event sources. Bridge treats every external message as potentially hostile.

### Full A2A Protocol Compliance

Bridge uses the **complete A2A protocol** with JSON-RPC 2.0 because external agents expect it:

```
Inbound:  External Agent → POST /a2a/tasks (signed JSON-RPC 2.0) → Bridge validates → routes internally
Outbound: Internal trigger → Bridge signs request → POST to external agent endpoint
```

Pulse can use simplified service calls because it talks to itself. Bridge cannot — it must speak the standard protocol.

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
apps/ambient/bridge/
  src/
    inbound/
      a2a-receiver.controller.ts    ← Receives external A2A requests
      a2a-validator.service.ts      ← Validates signatures, origin, format
      a2a-router.service.ts         ← Routes to correct internal agent
    outbound/
      a2a-sender.service.ts         ← Sends signed requests to external agents
      external-registry.service.ts  ← Registry of known external agents
    security/
      signing.service.ts            ← Request signing (ambient/core security envelope)
      rate-limiter.service.ts       ← Rate limiting for external endpoints
      origin-validator.service.ts   ← External agent origin verification
    streaming/
      sse.service.ts                ← Platform-standard SSE
    web/
      ... Vue 3 frontend for Bridge management UI
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

## Shared Core

`apps/ambient/core/` contains abstractions shared between Pulse and Bridge:
- Event envelope format
- Security envelope (signing, verification)
- Common protocol interfaces

Changes to core affect both Pulse and Bridge.

## Dependencies

- `@orchestratorai/transport-types` — A2A protocol types, JSON-RPC 2.0 format
- `apps/ambient/core/` — shared protocol abstractions, security envelope
- Auth API (port 6100) — JWT validation
- Supabase (port 6012) — A2A message logs, external agent registry
- Internal APIs: Pulse (6500), Forge (6200), Compose (6300) — routing targets
