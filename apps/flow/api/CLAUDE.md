# Flow API (Productivity — Backend)

## Why This Product Exists

Flow exists because **productivity tools are a distinct domain from agent operations**. Tasks, sprints, teams, and files have their own data model, their own lifecycle, and their own UI patterns. When they lived alongside agent code, productivity features were constantly overshadowed by agent development. Flow gives productivity its own home.

## Core Architectural Philosophy

### Data Service, Not AI Service

Flow API serves productivity data. It does NOT make LLM calls, run agents, or process events:

```typescript
// Flow — simple CRUD over orch_flow schema
async getTasks(context: ExecutionContext): Promise<Task[]> {
  return this.db.from('orch_flow', 'tasks')
    .select('*')
    .eq('org_slug', context.orgSlug);
}
```

If a feature needs AI capabilities (e.g., "summarize my sprint"), it should call Compose API as a client — not embed LLM infrastructure locally.

### Invoke Contract Compliance

Flow uses the standard invoke contract for any agent-to-agent communication. Request validation uses `isA2AInvokeRequest` from `@orchestratorai/transport-types` — the same validation guard used across all products.

### Consumes Auth's Canonical Structure

Flow does not manage users, teams, or orgs itself. It consumes Auth's canonical ownership of these entities. Team structure, user membership, and org scoping all come from Auth.

### Org-Scoped Data

All Flow data is scoped by `ExecutionContext.orgSlug`. Never query across orgs:

```typescript
// Every query gates on org
.eq('org_slug', context.orgSlug)
```

### Single Schema

Flow reads/writes exclusively to the `orch_flow` Postgres schema. It does not touch `prediction`, `risk`, `ambient`, `crawler`, or any other schema.

## Port Assignments

- API: 6900 (dev) / 7900 (prod)

## Architecture

```
apps/flow/api/src/
  teams/              ← Team CRUD (consumes Auth's canonical structure)
  tasks/              ← Task CRUD (assign, status, priority)
  sprints/            ← Sprint planning and tracking
  shared-tasks/       ← Shared task lists across teams
  files/              ← File storage and management
  execution-context/  ← ExecutionContext from JWT
  common/
    guards/
      validation.guard.ts  ← Uses isA2AInvokeRequest for request validation
```

## What Does NOT Belong Here

- **Agent logic** — Forge, Compose, or Pulse
- **LLM calls** — Flow is a data service
- **External A2A** — Bridge
- **User/org management** — Auth API

## Dependencies

- `@orchestratorai/transport-types` — ExecutionContext, isA2AInvokeRequest
- Platform planes (DATABASE_SERVICE) — database access
- Auth API (port 6100) — JWT validation
- Supabase (port 6012) — `orch_flow` schema
