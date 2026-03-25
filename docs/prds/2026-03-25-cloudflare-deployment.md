# Cloudflare Enterprise Deployment Guide

Deploy OrchestratorAI Enterprise to a single VPS/VM using Docker Compose, Cloudflare Tunnel, and local Supabase. One tunnel, one machine, NGINX reverse proxy routes all traffic internally.

**Constraint: Local dev is untouched.** All Cloudflare/NGINX/path-prefix concerns live exclusively in Docker build args, Docker Compose overrides, and NGINX config files. The `npm run dev:*` workflow stays exactly as-is.

## Why Cloudflare Tunnel

- **No open ports** — the tunnel connects outbound to Cloudflare's edge; no firewall rules, no exposed IPs
- **Free TLS** — Cloudflare handles certificates automatically
- **Single tunnel** — one `cloudflared` daemon routes to all 12 services via NGINX reverse proxy
- **Cloudflare Access** (optional) — zero-trust gating on authenticated routes without app changes
- **DDoS + WAF** — Cloudflare's edge protection for free or cheap

This is the simplest production deployment: Docker Compose (already built) + one tunnel + one NGINX config.

## Architecture

```
                    Internet
                       |
              Cloudflare Edge (CDN + WAF + TLS)
                       |
              Cloudflare Tunnel (outbound-only)
                       |
                    NGINX (reverse proxy, port 80)
                       |
        +--------------+------------------+
        |              |                  |
   /              /api/auth          /api/forge     ...etc
   Command Web    Auth API           Forge API
   (landing +     :6100              :6200
    nav shell)
   :6000
```

### Routing Model

NGINX serves as the single ingress, routing by path prefix:

| Route | Target Service | Port |
|-------|---------------|------|
| `/` | command-web | 6000 |
| `/admin` | admin-web | 6101 |
| `/forge` | forge-web | 6201 |
| `/compose` | compose-web | 6301 |
| `/pulse` | pulse-web | 6501 |
| `/bridge` | bridge-web | 6601 |
| `/api/auth/*` | auth-api | 6100 |
| `/api/admin/*` | admin-api | 6150 |
| `/api/forge/*` | forge-api | 6200 |
| `/api/compose/*` | compose-api | 6300 |
| `/api/pulse/*` | pulse-api | 6500 |
| `/api/bridge/*` | bridge-api | 6600 |

**Alternative: Subdomain routing** — `forge.yourdomain.com`, `compose.yourdomain.com`, etc. Cloudflare supports wildcard DNS (`*.yourdomain.com`). Choose based on preference; the tunnel config is the same either way.

### How Path Prefixes Work (Docker-only)

This is the key concern: Vue SPAs expect to be served at `/`, but behind NGINX they live at `/forge/`, `/admin/`, etc. This is solved **entirely in Docker build args** — no source code changes:

1. **Vite `base` build arg** — The `vite-web.Dockerfile` already accepts build args. We add a `VITE_BASE_URL` arg that maps to Vite's `base` config. In `docker-compose.cloudflare.yml`, Forge gets `VITE_BASE_URL=/forge/`, Admin gets `VITE_BASE_URL=/admin/`, etc. Command stays at `/`.

2. **NGINX strips the prefix** — `location /forge/ { proxy_pass http://forge-web/; }` strips `/forge/` before forwarding to the container. The SPA's `<base>` tag and asset paths use the prefix, so the browser requests `/forge/assets/...` which NGINX routes correctly.

3. **API route stripping** — `location /api/forge/ { proxy_pass http://forge-api/; }` strips `/api/forge/` so the NestJS app sees requests at its normal paths (`/invoke`, `/health`, etc.).

4. **Local dev is untouched** — `npm run dev:forge:web` still serves at `http://localhost:6201/` with no prefix. The `VITE_BASE_URL` arg only exists in the Docker build.

## Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Docker + Compose | 24+ / v2 | [Docker Desktop](https://www.docker.com/products/docker-desktop) or server install |
| `cloudflared` | latest | `brew install cloudflared` or [docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) |
| Node.js | 20+ | For local build steps if not building in Docker |

You also need:
- A Cloudflare account (free tier works)
- A domain with DNS managed by Cloudflare
- A VPS/VM (Hetzner, DigitalOcean, Linode, bare metal, etc.) — 4+ CPU, 8+ GB RAM recommended

## Provider Plane Configuration

| Plane | Env Var | Value |
|-------|---------|-------|
| Database | `DB_PROVIDER` | `supabase_pg` |
| Storage | `STORAGE_PROVIDER` | `supabase_storage` |
| Auth | `AUTH_PROVIDER` | `supabase` |
| Config | `CONFIG_PROVIDER` | `local` |
| Work Routing | `WORK_PROVIDER` | `slack` |
| RAG | `RAG_PROVIDER` | `supabase_pg` |
| LLM | `LLM_PROVIDER` | `openrouter` or `anthropic` or `openai` |

Supabase runs on the same host: REST on **54321**, Postgres on **54322**. Containers reach it via `host.docker.internal`.

## Step-by-Step Deployment

### 1. Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser to authorize your Cloudflare account and stores credentials at `~/.cloudflared/cert.pem`.

### 2. Create the Tunnel

```bash
cloudflared tunnel create orchestrator-ai
```

Note the tunnel UUID — you'll need it. This also creates `~/.cloudflared/<UUID>.json` (tunnel credentials).

### 3. Configure DNS

```bash
cloudflared tunnel route dns orchestrator-ai app.yourdomain.com
```

For subdomain routing, add additional routes:
```bash
cloudflared tunnel route dns orchestrator-ai forge.yourdomain.com
cloudflared tunnel route dns orchestrator-ai compose.yourdomain.com
# ... etc
```

### 4. Create Tunnel Config

Create `cloudflared/config.yml` in the project root:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /etc/cloudflared/<UUID>.json

ingress:
  - hostname: app.yourdomain.com
    service: http://nginx:80
  # If using subdomain routing, add per-subdomain rules here
  # - hostname: forge.yourdomain.com
  #   service: http://nginx:80
  - service: http_status:404
```

All traffic enters through NGINX on port 80. NGINX handles the internal routing to Docker services.

### 5. Add NGINX Reverse Proxy

Create `docker/nginx-gateway.conf`:

```nginx
# OrchestratorAI Gateway — reverse proxy for all products

upstream command-web  { server command-web:80; }
upstream admin-web    { server admin-web:80; }
upstream forge-web    { server forge-web:80; }
upstream compose-web  { server compose-web:80; }
upstream pulse-web    { server pulse-web:80; }
upstream bridge-web   { server bridge-web:80; }

upstream auth-api     { server auth-api:6100; }
upstream admin-api    { server admin-api:6150; }
upstream forge-api    { server forge-api:6200; }
upstream compose-api  { server compose-api:6300; }
upstream pulse-api    { server pulse-api:6500; }
upstream bridge-api   { server bridge-api:6600; }

server {
    listen 80;
    server_name _;

    # --- API routes (must come before web catch-alls) ---
    location /api/auth/    { proxy_pass http://auth-api/;    proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; }
    location /api/admin/   { proxy_pass http://admin-api/;   proxy_http_version 1.1; proxy_set_header Host $host; }
    location /api/forge/   { proxy_pass http://forge-api/;   proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; }
    location /api/compose/ { proxy_pass http://compose-api/; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; }
    location /api/pulse/   { proxy_pass http://pulse-api/;   proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; }
    location /api/bridge/  { proxy_pass http://bridge-api/;  proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; }

    # --- Web routes ---
    location /admin/   { proxy_pass http://admin-web/;   }
    location /forge/   { proxy_pass http://forge-web/;   }
    location /compose/ { proxy_pass http://compose-web/; }
    location /pulse/   { proxy_pass http://pulse-web/;   }
    location /bridge/  { proxy_pass http://bridge-web/;  }

    # --- Default: Command (landing page + nav shell) ---
    location / { proxy_pass http://command-web/; }
}
```

**SSE support**: The `proxy_http_version 1.1` and `Upgrade` headers ensure SSE streaming (used by Forge/Compose invoke) works through the proxy.

### 6. Add Services to Docker Compose

Add these to `docker-compose.yml` (or create `docker-compose.cloudflare.yml` as an override):

```yaml
services:
  # --- Gateway ---
  nginx:
    image: nginx:1.27-alpine
    volumes:
      - ./docker/nginx-gateway.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - command-web
      - auth-api
      - admin-api
      - admin-web
      - forge-api
      - forge-web
      - compose-api
      - compose-web
      - pulse-api
      - pulse-web
      - bridge-api
      - bridge-web
    # No ports exposed to host — only accessible via tunnel
    networks:
      - default

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
      - ./cloudflared/<UUID>.json:/etc/cloudflared/<UUID>.json:ro
    depends_on:
      - nginx
    restart: unless-stopped
    networks:
      - default
```

### 7. Configure Environment

Create `.env` from `.env.example`. Key changes for Cloudflare deployment:

```bash
# Point all VITE_* URLs to the public domain (build-time baked into SPAs)
VITE_AUTH_API_URL=https://app.yourdomain.com/api/auth
VITE_FORGE_API_URL=https://app.yourdomain.com/api/forge
VITE_COMPOSE_API_BASE_URL=https://app.yourdomain.com/api/compose
VITE_ADMIN_API_URL=https://app.yourdomain.com/api/admin
VITE_PULSE_API_URL=https://app.yourdomain.com/api/pulse
VITE_BRIDGE_API_URL=https://app.yourdomain.com/api/bridge

# Internal service-to-service URLs (Docker network names)
AUTH_API_URL=http://auth-api:6100
FORGE_API_URL=http://forge-api:6200
COMPOSE_API_URL=http://compose-api:6300
PULSE_API_URL=http://pulse-api:6500
BRIDGE_API_URL=http://bridge-api:6600

# Database — Supabase on the same machine
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres
SUPABASE_URL=http://host.docker.internal:54321
```

### 8. Build and Deploy

```bash
# Build all images
docker compose build

# Start everything
docker compose up -d

# Verify tunnel is connected
docker compose logs cloudflared
```

### 9. Run Database Migrations

```bash
npm run db:migrate
```

### 10. Validate Deployment

```bash
# Health checks
curl https://app.yourdomain.com/api/auth/health
curl https://app.yourdomain.com/api/forge/health
curl https://app.yourdomain.com/api/compose/health

# Landing page
curl -s https://app.yourdomain.com | head -20
```

## Optional: Cloudflare Access (Zero Trust)

Protect authenticated routes without changing app code:

1. In the Cloudflare Zero Trust dashboard, create an Access Application
2. Set the Application domain to `app.yourdomain.com`
3. Add a policy: Allow — Emails ending in `@yourdomain.com` (or specific emails)
4. Exclude the landing page path `/` from the policy so it remains public

This adds a Cloudflare login gate in front of the entire app. Users authenticate with Cloudflare before they even reach the Auth API.

## Environment Variables Reference

### NGINX Gateway (no env vars — config file only)

### Cloudflared

| Variable | Description | Example |
|----------|-------------|---------|
| `TUNNEL_TOKEN` | Alternative to credentials file | From `cloudflared tunnel token <name>` |

### API Services

Same as local development (see `.env.example`), with these overrides:

| Variable | Description | Value |
|----------|-------------|-------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://postgres:postgres@host.docker.internal:54322/postgres` |
| `SUPABASE_URL` | Supabase REST API | `http://host.docker.internal:54321` |
| `NODE_ENV` | Environment | `production` |

### Web Services (build-time)

| Variable | Description |
|----------|-------------|
| `VITE_AUTH_API_URL` | `https://app.yourdomain.com/api/auth` |
| `VITE_FORGE_API_URL` | `https://app.yourdomain.com/api/forge` |
| `VITE_COMPOSE_API_BASE_URL` | `https://app.yourdomain.com/api/compose` |
| `VITE_ADMIN_API_URL` | `https://app.yourdomain.com/api/admin` |
| `VITE_PULSE_API_URL` | `https://app.yourdomain.com/api/pulse` |
| `VITE_BRIDGE_API_URL` | `https://app.yourdomain.com/api/bridge` |

## Troubleshooting

### Tunnel not connecting
Check credentials: `cloudflared tunnel info orchestrator-ai`. Verify the credentials JSON file path in `config.yml`. Check logs: `docker compose logs cloudflared`.

### 502 Bad Gateway
NGINX can't reach a backend service. Check the service is running: `docker compose ps`. Verify service names in `nginx-gateway.conf` match `docker-compose.yml` service names exactly.

### SSE streaming broken
Ensure NGINX config includes `proxy_http_version 1.1` and the `Upgrade` / `Connection` headers. Also add `proxy_buffering off;` and `proxy_cache off;` to SSE locations if needed.

### CORS errors in browser
The NGINX gateway serves everything from the same origin (`app.yourdomain.com`), so CORS should not be an issue. If it is, check that API responses don't hardcode `localhost` origins.

### WebSocket connections failing
Cloudflare Tunnel supports WebSockets natively. Ensure NGINX passes the `Upgrade` and `Connection` headers (already in the config above).

## Cost Estimates

| Tier | Monthly Estimate | Notes |
|------|-----------------|-------|
| **Dev** (Hetzner CX31, local Supabase, Cloudflare Free) | ~$8-15/mo | VPS only; tunnel + DNS + TLS are free |
| **Prod** (Hetzner CX51 or dedicated, local Supabase, Cloudflare Pro) | ~$45-80/mo | Larger VM + WAF rules |

Major cost drivers: VPS size, LLM API token consumption (external to hosting). Cloudflare Tunnel is free on all plans. This is significantly cheaper than Azure (~$400-600/mo) or GCP (~$200-400/mo) for equivalent workloads.

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single tunnel vs. multiple | **Single tunnel** | One daemon, one config, NGINX handles routing internally |
| NGINX vs. Caddy vs. Traefik | **NGINX** | Already used in web Dockerfiles; consistent tooling |
| Path routing vs. subdomains | **Path routing default** | Simpler DNS, single origin eliminates CORS, subdomain option documented |
| Supabase | **Local on same host** | Same as dev; 54321 REST, 54322 Postgres via host.docker.internal |
| Path prefixes in Docker | **Vite `base` build arg + NGINX strip** | Docker-only concern; local dev unchanged |
