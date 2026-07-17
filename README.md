# OrchestratorAI Enterprise

Unified starter-platform AI application built on NestJS, Vue 3, provider planes, transport types, and local Supabase.

## Runtime Shape

The starter runtime is one deployable API app and one deployable web app:

| App | Purpose | Local Port |
|---|---|---:|
| `apps/api` | Unified platform API with auth, admin, agents, workflows, ambient automation, secure conversations, RAG, settings support, and health modules | `6700` |
| `apps/web` | Unified Vue app with landing pages, login, shell, dashboard, and module routes | `6701` |

Current web modules:

- Auth and landing pages
- Dashboard and shell
- Admin
- Agents
- Workflows
- Ambient
- Secure Conversations
- RAG
- Settings

Current API modules:

- `auth`
- `admin`
- `agents`
- `workflows`
- `ambient`
- `secure-conversations`
- `rag`
- `health`

Protocol Lab is not part of the starter runtime. It remains historical/developer-demo material unless a separate future effort reinstates it deliberately.

## Shared Packages

| Package | Purpose |
|---|---|
| `packages/transport-types` | ExecutionContext, JSON-RPC 2.0 invoke contracts, A2A contracts, shared presentation types |
| `packages/planes` | Provider planes for database, LLM, storage, RAG, auth, config, observability, and work routing |
| `packages/ui` | Shared Vue component library and platform shell components |

## Local Development

```bash
npm run dev:all
```

This starts or verifies the local stack:

- Supabase REST: `54321`
- Supabase Postgres: `54322`
- Lightning services: `6108` / `6109`
- Platform API: `6700`
- Platform web: `6701`

Run individual apps when needed:

```bash
npm run dev:api
npm run dev:web
```

## Verification

```bash
npm run lint -- --max-warnings=0
npm run build
npm test
npm run test:integration:health
npm run test:integration:admin -- --runInBand
npm run audit:accepted
```

## Docker

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

The default Docker runtime contains `platform-api` and `platform-web`. Optional Lightning services are behind the `lightning` Compose profile.

## Environment

Use `.env.example` as the local template and keep secrets in `.env.secrets`.

Important local values:

```bash
PLATFORM_API_PORT=6700
VITE_PLATFORM_WEB_PORT=6701
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://127.0.0.1:6700
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321
```
