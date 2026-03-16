# Browser Testing Handoff — March 15, 2026

## How to Start Testing

### 1. Start Supabase
```bash
cd /path/to/orchestratorai-enterprise
npx supabase start
```

After Supabase starts, expose all schemas to PostgREST:
```bash
psql "postgresql://supabase_admin:postgres@127.0.0.1:6013/postgres" -c "
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, authz, marketing, risk, prediction, crawler, engineering, law, orch_flow, ambient, rag_data, company, leads, code_ops';
NOTIFY pgrst, 'reload schema';
"
```

### 2. Start All APIs
```bash
cd orchestratorai-enterprise

# Auth API (port 6102 — changed from 6100 due to Cursor port conflict on laptop)
(cd apps/auth/api && npm run start:dev) &

# Admin API (port 6150)
(cd apps/admin/api && npm run start:dev) &

# Forge API (port 6200) — needs API_PORT env
(cd apps/forge/api && API_PORT=6200 npm run start:dev) &

# Compose API (port 6300) — needs API_PORT env
(cd apps/compose/api && API_PORT=6300 npm run start:dev) &

# Flow API (port 6900)
(cd apps/flow/api && npm run start:dev) &

# Pulse API (port 6500)
(cd apps/ambient/pulse/api && npm run start:dev) &

# Bridge API (port 6600) — needs API_PORT env
(cd apps/ambient/bridge/api && API_PORT=6600 npm run start:dev) &
```

### 3. Start All Web Apps
```bash
(cd apps/landing/web && npm run dev) &        # port 6400
(cd apps/command/web && npm run dev) &        # port 6001
(cd apps/admin/web && npm run dev) &          # port 6101
(cd apps/forge/web && npm run dev) &          # port 6201
(cd apps/compose/web && npm run dev) &        # port 6301
(cd apps/flow/web && npm run dev) &           # port 6901
(cd apps/ambient/pulse/web && npm run dev) &  # port 6501
(cd apps/ambient/bridge/frontend && npm run dev) & # port 6601
```

### 4. Create Test User (if needed)
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient('http://127.0.0.1:6012', '<SUPABASE_ANON_KEY>');
s.auth.signUp({email:'golfergeek@orchestratorai.io',password:'GolferGeek123!'}).then(console.log);
"
```

Then add to authz tables:
```sql
INSERT INTO authz.users (id, email, display_name, organization_slug, status)
VALUES ('<user-id-from-signup>', 'golfergeek@orchestratorai.io', 'GolferGeek', 'engineering', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO authz.rbac_user_org_roles (user_id, role_id, organization_slug)
SELECT '<user-id>', id, org FROM authz.rbac_roles
CROSS JOIN (VALUES ('*'),('engineering'),('legal'),('marketing'),('finance'),('human-resources')) AS orgs(org)
WHERE name = 'super-admin'
ON CONFLICT DO NOTHING;
```

## Port Assignments (Changed)

| Service | Port | Notes |
|---------|------|-------|
| Supabase REST | 6012 | |
| Supabase DB | 6013 | |
| Auth API | 6102 | Changed from 6100 (Cursor conflict on laptop — may work at 6100 on Mac Studio) |
| Command Web | 6001 | Changed from 6000 (Chrome blocks port 6000 — X11 reserved) |
| All others | Standard | See .env |

**NOTE:** If you're NOT on the laptop with Cursor, Auth API might work fine on 6100. Change `AUTH_API_PORT` and `VITE_AUTH_API_PORT` back to 6100 in `.env` if so.

## What's Working

### Landing Page (localhost:6400)
- Full marketing site with partnership messaging
- Hero: "Everything in Place. Ready to Build."
- Pricing: Partnership model (Pilot + Full Partnership)
- All pages render in both dark/light themes

### Command (localhost:6001)
- Login → Dashboard with 6 product tiles (Forge, Compose, Flow, Admin, Pulse, Bridge)
- SSO token passing via URL query params to other products
- Product switcher as compact popover at sidebar bottom

### Forge (localhost:6201)
- 5 agent dashboard cards (Marketing Swarm, Legal Department AI, CAD Agent, Risk Runner, Predictor)
- Marketing Swarm: Full config form with content types, writers/editors/evaluators, LLM provider/model dropdowns populated from DB
- Marketing Swarm execution: Pipeline starts (Setup→Queue→Writing), SSE stream connects
- **Current blocker**: `MarketingDbService` query error: "Cannot coerce the result to a single JSON object" — needs debugging in the task config query

### Other Products
- Compose (6301), Flow (6901), Pulse (6501), Bridge (6601): App shells render with sidebars
- Admin (6101): Works — may need network IP on laptop, should work on Mac Studio

## SSO Token Flow
Tokens don't share across localhost ports in Chrome. We pass them via URL:
1. Command adds `?sso_token=<jwt>` to product URLs
2. Each product's rbacStore extracts it from URL params on load
3. Token is stored in localStorage + tokenStorage for API calls

## Vite Proxy Setup
All web apps proxy API calls through Vite dev server using `http://[::1]:PORT` (IPv6 loopback). This was needed on laptop due to Cursor port forwarding. On Mac Studio, `localhost` might work fine.

Key proxy routes per product:
- `/auth` → Auth API
- `/api` → Auth API (for RBAC)
- `/marketing`, `/llm`, `/agent-to-agent`, `/agent-conversations` → Forge API
- Product-specific routes → respective product API

## Known Issues to Fix
1. Marketing Swarm query error (MarketingDbService single() returning multiple rows)
2. Login page doesn't auto-redirect to /app after RBAC init
3. ClaudeCodePane not in dark mode, needs UX cleanup
4. CAD Agent + Legal Department dashboards untested
5. Risk Runner + Predictor dashboards need API keys + crawlers running
