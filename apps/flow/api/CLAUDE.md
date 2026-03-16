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
  teams/              ← Team CRUD
  tasks/              ← Task CRUD (assign, status, priority)
  sprints/            ← Sprint planning and tracking
  shared-tasks/       ← Shared task lists across teams
  files/              ← File storage and management
  execution-context/  ← ExecutionContext from JWT
```

## What Does NOT Belong Here

- **Agent logic** — Forge, Compose, or Pulse
- **LLM calls** — Flow is a data service
- **External A2A** — Bridge
- **User/org management** — Auth API

## Dependencies

- `@orchestratorai/transport-types` — ExecutionContext
- Platform planes (DATABASE_SERVICE) — database access
- Auth API (port 6100) — JWT validation
- Supabase (port 6012) — `orch_flow` schema
