# Docker Gateway (Cloudflare Local) — Chrome Test

Validates the full NGINX gateway + path-prefix routing used for Cloudflare Tunnel deployment.
All 12 services (6 APIs + 6 webs) accessed through a single NGINX entry point.

## Gateway URL
`http://localhost:7777` (configurable via `CF_LOCAL_PORT` env var)

## Prerequisites

1. **Supabase running** on 54321 (REST) / 54322 (Postgres) — start FIRST before Docker services
2. **Docker gateway stack running:**
   ```bash
   export CF_PUBLIC_URL=http://localhost:7777
   docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml -f docker-compose.cloudflare-local.yml build
   docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml -f docker-compose.cloudflare-local.yml up -d
   ```
3. All 12 containers healthy: `docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml -f docker-compose.cloudflare-local.yml ps`
4. **Product webUrls in database** must point to gateway paths (e.g. `/forge/`, `/compose/`) not direct ports — otherwise Command dashboard shows "No products available"

## Test Credentials
- Email: golfergeek@orchestratorai.io
- Password: GolferGeek123!

---

## Level 1 — API Health Checks

Verify all 6 APIs respond through the gateway with prefix stripping.

- [ ] `curl http://localhost:7777/api/auth/health` → `{"status":"healthy",...}`
- [ ] `curl http://localhost:7777/api/forge/health` → `{"status":"healthy",...}`
- [ ] `curl http://localhost:7777/api/compose/health` → `{"status":"healthy",...}`
- [ ] `curl http://localhost:7777/api/admin/health` → `{"status":"healthy",...}`
- [ ] `curl http://localhost:7777/api/pulse/health` → `{"status":"ok",...}`
- [ ] `curl http://localhost:7777/api/bridge/health` → `{"status":"ok",...}`

## Level 2 — Unauthenticated Access (Only Landing Page)

Verify unauthenticated users can ONLY see the landing page. All product routes should redirect to login.

### Landing page is public
- [ ] Navigate to `http://localhost:7777/`
- [ ] Page title is "Orchestrator AI"
- [ ] Landing page renders: HeroSection, "The Starter Kit for Enterprise AI"
- [ ] "LOG IN" button visible top-right
- [ ] Left nav does NOT show product links (Forge, Compose, Admin, etc.)
- [ ] No console errors

### Product routes redirect to login when unauthenticated
- [ ] Navigate to `http://localhost:7777/forge/` → redirects to `/forge/login`
- [ ] Navigate to `http://localhost:7777/admin/` → redirects to `/admin/login`
- [ ] Navigate to `http://localhost:7777/bridge/` → redirects to `/bridge/login`
- [ ] Navigate to `http://localhost:7777/compose/` → redirects or shows login
- [ ] Navigate to `http://localhost:7777/pulse/` → redirects or shows login
- [ ] No authenticated content is visible without login

## Level 3 — Login Through Command

Login via the Command landing page and verify the authenticated dashboard.

- [ ] Navigate to `http://localhost:7777/`
- [ ] Click "LOG IN" button
- [ ] Redirects to `/login` with Email/Password form
- [ ] Enter email: golfergeek@orchestratorai.io
- [ ] Enter password: GolferGeek123!
- [ ] Click LOGIN button
- [ ] Redirects to `/app/dashboard`
- [ ] "Welcome, GolferGeek" message displays
- [ ] Left nav shows product links based on entitlements
- [ ] No CORS errors in console

**Note:** Command calls `/auth/login` (not `/api/auth/login`). The NGINX gateway has
a dedicated `/auth/` → auth-api route for this. The entitlements endpoint at
`/auth/entitlements` must return products with gateway-relative `webUrl` values
(e.g., `/forge/` not `http://localhost:6201`) for the dashboard to show product cards.

## Level 4 — Authenticated Product Access

After logging in via Command, verify each product loads as authenticated user.

### Forge — `/forge/`
- [ ] Navigate to `http://localhost:7777/forge/`
- [ ] Loads authenticated dashboard (not login page)
- [ ] Agent list or dashboard content renders
- [ ] Assets load (no 404s in network tab for `/forge/assets/...`)
- [ ] No console errors

### Admin — `/admin/`
- [ ] Navigate to `http://localhost:7777/admin/`
- [ ] Loads authenticated admin UI
- [ ] Organizations table or admin content renders
- [ ] No console errors

### Compose — `/compose/`
- [ ] Navigate to `http://localhost:7777/compose/`
- [ ] Loads agent list or conversation interface
- [ ] No console errors

### Pulse — `/pulse/`
- [ ] Navigate to `http://localhost:7777/pulse/`
- [ ] Page title "Pulse — Internal Ambient Automation"
- [ ] Dashboard content renders
- [ ] No console errors

### Bridge — `/bridge/`
- [ ] Navigate to `http://localhost:7777/bridge/`
- [ ] Loads authenticated bridge UI
- [ ] No console errors

**Note:** Each product has its own auth guard. If they don't share the Supabase auth
token from Command login, you may need to log in per-product. Shared auth across
products through the gateway is a future improvement.

## Level 5 — API Calls Through Gateway

Verify SPAs can make API calls through the gateway prefix stripping.

### Forge API calls
- [ ] After Forge login, agent list loads (calls `/api/forge/agents` or Forge's own paths)
- [ ] No 502 or network errors in console

### Admin API calls
- [ ] After Admin login, organizations load (calls `/api/auth/...` via admin)
- [ ] CRUD operations work (view org details)

### Auth API calls (via Command paths)
- [ ] `/auth/login` → POST returns JWT token (200)
- [ ] `/auth/entitlements` → GET returns product list (200)
- [ ] `/auth/me` → GET returns user profile (200)

## Level 6 — SSE Streaming

Verify Server-Sent Events work through the NGINX gateway.

- [ ] Login to Forge
- [ ] Navigate to an agent (marketing-swarm, legal-department, etc.)
- [ ] Start an invoke/conversation
- [ ] SSE stream connects and receives events
- [ ] `proxy_buffering off` and `proxy_cache off` prevent buffering issues
- [ ] No timeout or connection drops through the proxy

---

## Troubleshooting

### 502 Bad Gateway on APIs
- Check API containers are running: `docker compose ... ps`
- Check DATABASE_URL doesn't have `127.0.0.1` (must be `host.docker.internal`)
- Verify `.env.secrets` doesn't override DATABASE_URL

### Assets 404
- Verify the web app was built with correct `VITE_BASE_URL` (e.g., `/forge/`)
- Check: `docker compose ... exec forge-web cat /usr/share/nginx/html/index.html | grep src`
- Asset paths should reference `/forge/assets/...`

### Login fails with 405
- Command calls `/auth/login` (no `/api/` prefix). The gateway needs `/auth/` → auth-api route.
- Verify `nginx-gateway.conf` has: `location /auth/ { proxy_pass http://auth_api/auth/; }`

### "No products available" after login
- The entitlements API returns `webUrl` values from the database (e.g., `http://localhost:6201`)
- For gateway deployment, product `webUrl` values must be updated to gateway paths (`/forge/`, etc.)
- Check: `curl http://localhost:7777/auth/entitlements -H "Authorization: Bearer <token>"`

### Login fails / CORS errors
- All traffic goes through same origin (localhost:7777) so CORS should not apply
- If CORS errors appear, check API doesn't hardcode `localhost:6xxx` in CORS config

### Vue Router shows blank page
- Verify `createWebHistory(import.meta.env.BASE_URL)` is used in the router
- Check that `VITE_BASE_URL` was set at build time (not runtime)
