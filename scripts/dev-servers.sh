#!/bin/bash
# =============================================================================
# OrchestratorAI Enterprise — Smart Dev Server Manager
# Usage:
#   ./scripts/dev-servers.sh start           # Start/heal all services
#   ./scripts/dev-servers.sh start gateway   # Start all + nginx + cloudflared
#   ./scripts/dev-servers.sh stop            # Stop all services
#   ./scripts/dev-servers.sh stop gateway    # Stop all + nginx + cloudflared
#   ./scripts/dev-servers.sh status          # Show status of all services
#
# Ports are read from .env in the repo root. Each clone can have different
# ports (e.g., enterprise=6xxx, enterprise-dev=5xxx) and this script will
# respect them automatically.
#
# Smart behavior:
#   - Running + healthy → skip
#   - Running + unhealthy → restart
#   - Not running → start
# =============================================================================

ACTION="${1:-start}"
MODE="${2:-dev}"

# ---------------------------------------------------------------------------
# Load ports from .env
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found at $ENV_FILE"
  exit 1
fi

# Source .env values (only lines matching KEY=VALUE, skip comments/empty)
load_env_var() {
  local key=$1
  local default=$2
  local val
  val=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
  echo "${val:-$default}"
}

# Read all ports from .env
P_AUTH_API=$(load_env_var AUTH_API_PORT 6100)
P_ADMIN_API=$(load_env_var ADMIN_API_PORT 6150)
P_ADMIN_WEB=$(load_env_var ADMIN_WEB_PORT 6101)
P_COMMAND_WEB=$(load_env_var COMMAND_WEB_PORT 6102)
P_FORGE_API=$(load_env_var FORGE_API_PORT 6200)
P_FORGE_WEB=$(load_env_var FORGE_WEB_PORT 6201)
P_COMPOSE_API=$(load_env_var COMPOSE_API_PORT 6300)
P_COMPOSE_WEB=$(load_env_var COMPOSE_WEB_PORT 6301)
P_PULSE_API=$(load_env_var PULSE_API_PORT 6500)
P_PULSE_WEB=$(load_env_var PULSE_WEB_PORT 6501)
P_BRIDGE_API=$(load_env_var BRIDGE_API_PORT 6600)
P_BRIDGE_WEB=$(load_env_var BRIDGE_WEB_PORT 6601)
P_PROTOCOL_LAB=$(load_env_var LANDING_WEB_PORT 6400)
P_NGINX=$(load_env_var NGINX_GATEWAY_PORT 6666)

# Derive the port prefix for display (e.g., "6" from 6100, "5" from 5100)
PORT_PREFIX="${P_AUTH_API:0:1}"

# "gateway" mode = ports from .env + VITE_BASE_URL + nginx + cloudflared
GATEWAY_MODE=false
if [ "$MODE" = "gateway" ]; then
  GATEWAY_MODE=true
fi

# ---------------------------------------------------------------------------
# Service definitions: name, port, health path, start command
# ---------------------------------------------------------------------------
if [ "$GATEWAY_MODE" = "true" ]; then
  # In gateway mode, web apps serve at their base URL path prefix
  declare -a SERVICES=(
    "auth|${P_AUTH_API}|/health|npm run dev:auth"
    "admin-api|${P_ADMIN_API}|/health|npm run dev:admin:api"
    "admin-web|${P_ADMIN_WEB}|/admin/|npm run dev:admin:web"
    "forge-api|${P_FORGE_API}|/health|npm run dev:forge:api"
    "forge-web|${P_FORGE_WEB}|/forge/|npm run dev:forge:web"
    "compose-api|${P_COMPOSE_API}|/health|npm run dev:compose:api"
    "compose-web|${P_COMPOSE_WEB}|/compose/|npm run dev:compose:web"
    "pulse-api|${P_PULSE_API}|/health|npm run dev:pulse:api"
    "pulse-web|${P_PULSE_WEB}|/pulse/|npm run dev:pulse:web"
    "bridge-api|${P_BRIDGE_API}|/health|npm run dev:bridge:api"
    "bridge-web|${P_BRIDGE_WEB}|/bridge/|npm run dev:bridge:web"
    "command|${P_COMMAND_WEB}|/|npm run dev:command"
    "protocol-lab|${P_PROTOCOL_LAB}|/|npm run dev:protocol-lab"
  )
else
  declare -a SERVICES=(
    "auth|${P_AUTH_API}|/health|npm run dev:auth"
    "admin-api|${P_ADMIN_API}|/health|npm run dev:admin:api"
    "admin-web|${P_ADMIN_WEB}|/|npm run dev:admin:web"
    "forge-api|${P_FORGE_API}|/health|npm run dev:forge:api"
    "forge-web|${P_FORGE_WEB}|/|npm run dev:forge:web"
    "compose-api|${P_COMPOSE_API}|/health|npm run dev:compose:api"
    "compose-web|${P_COMPOSE_WEB}|/|npm run dev:compose:web"
    "pulse-api|${P_PULSE_API}|/health|npm run dev:pulse:api"
    "pulse-web|${P_PULSE_WEB}|/|npm run dev:pulse:web"
    "bridge-api|${P_BRIDGE_API}|/health|npm run dev:bridge:api"
    "bridge-web|${P_BRIDGE_WEB}|/|npm run dev:bridge:web"
    "command|${P_COMMAND_WEB}|/|npm run dev:command"
    "protocol-lab|${P_PROTOCOL_LAB}|/|npm run dev:protocol-lab"
  )
fi

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

check_port() {
  local port=$1
  lsof -i :$port -sTCP:LISTEN -P -n >/dev/null 2>&1
}

check_health() {
  local port=$1
  local path=$2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}${path}" 2>/dev/null)
  # 200 = healthy, 404 = running (NestJS with no root route), anything else = unhealthy
  [ "$code" = "200" ] || [ "$code" = "404" ]
}

kill_port() {
  local port=$1
  lsof -t -i :$port 2>/dev/null | xargs kill -9 2>/dev/null || true
}

start_service() {
  local name=$1
  local cmd=$2
  # Run in background, redirect output to log file
  local logdir="/tmp/oai-dev-logs"
  mkdir -p "$logdir"

  # In gateway mode, set VITE_BASE_URL per web service
  local extra_env=""
  if [ "$GATEWAY_MODE" = "true" ]; then
    local PUB="${CF_PUBLIC_URL:-https://orchestratorai.io}"
    case "$name" in
      command)     extra_env="VITE_BASE_URL=/ VITE_GATEWAY_MODE=true" ;;
      admin-web)   extra_env="VITE_BASE_URL=/admin/ VITE_GATEWAY_MODE=true" ;;
      forge-web)   extra_env="VITE_BASE_URL=/forge/ VITE_GATEWAY_MODE=true VITE_API_BASE_URL=${PUB}/api/forge VITE_API_NESTJS_BASE_URL=${PUB}/api/forge" ;;
      compose-web) extra_env="VITE_BASE_URL=/compose/ VITE_GATEWAY_MODE=true VITE_API_BASE_URL=${PUB}/api/compose VITE_COMPOSE_API_BASE_URL=${PUB}/api/compose" ;;
      pulse-web)   extra_env="VITE_BASE_URL=/pulse/ VITE_GATEWAY_MODE=true VITE_PULSE_API_URL=${PUB}/api/pulse" ;;
      bridge-web)  extra_env="VITE_BASE_URL=/bridge/ VITE_GATEWAY_MODE=true VITE_API_URL=${PUB}/api/bridge" ;;
    esac
  fi

  # Export env vars (space-separated KEY=VALUE pairs) then run the command
  local env_exports=""
  if [ -n "$extra_env" ]; then
    for kv in $extra_env; do
      env_exports="${env_exports}export ${kv}; "
    done
  fi
  nohup bash -c "${env_exports}$cmd" > "$logdir/${name}.log" 2>&1 &
}

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

stop_servers() {
  echo "Stopping all servers (${PORT_PREFIX}xxx ports from .env)..."

  # Stop Lightning Docker containers
  if docker compose --profile lightning ps --status running 2>/dev/null | grep -q "bitcoind\|lnd"; then
    echo "  Stopping Lightning Network containers..."
    docker compose --profile lightning down 2>/dev/null
    printf "  ${RED}■${NC} %-16s stopped\n" "lightning"
  fi

  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port health_path cmd <<< "$entry"
    if check_port "$port"; then
      kill_port "$port"
      printf "  ${RED}■${NC} %-16s stopped (port %s)\n" "$name" "$port"
    fi
  done

  # In gateway mode, also stop nginx gateway and cloudflared
  if [ "$GATEWAY_MODE" = "true" ]; then
    if check_port "$P_NGINX"; then
      local NGINX_CONF
      NGINX_CONF="$(cd "$(dirname "$0")" && pwd)/nginx-prod.conf"
      sudo nginx -c "$NGINX_CONF" -s stop 2>/dev/null || nginx -c "$NGINX_CONF" -s stop 2>/dev/null
      printf "  ${RED}■${NC} %-16s stopped\n" "nginx-gateway"
    fi
    if pgrep -f "cloudflared.*tunnel" >/dev/null 2>&1; then
      pkill -f "cloudflared.*tunnel" 2>/dev/null
      printf "  ${RED}■${NC} %-16s stopped\n" "cloudflared"
    fi
  fi

  echo "Done."
}

status_servers() {
  echo ""
  echo "=== Service Status (${PORT_PREFIX}xxx ports from .env) ==="
  echo ""

  # Check Supabase
  if curl -s -o /dev/null http://localhost:54321/rest/v1/ 2>/dev/null; then
    printf "  ${GREEN}●${NC} %-16s %s\n" "supabase" "running (54321/54322)"
  else
    printf "  ${RED}●${NC} %-16s %s\n" "supabase" "DOWN"
  fi

  # Check Lightning
  if lsof -i :6108 -sTCP:LISTEN -P -n >/dev/null 2>&1; then
    printf "  ${GREEN}●${NC} %-16s %s\n" "lightning" "running (6108/6109)"
  else
    printf "  ${RED}○${NC} %-16s %s\n" "lightning" "DOWN (6108/6109)"
  fi

  local running=0
  local total=${#SERVICES[@]}

  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port health_path cmd <<< "$entry"
    if check_port "$port"; then
      if check_health "$port" "$health_path"; then
        printf "  ${GREEN}●${NC} %-16s healthy (port %s)\n" "$name" "$port"
        running=$((running + 1))
      else
        printf "  ${YELLOW}●${NC} %-16s unhealthy (port %s)\n" "$name" "$port"
      fi
    else
      printf "  ${RED}○${NC} %-16s not running (port %s)\n" "$name" "$port"
    fi
  done

  echo ""
  echo "$running/$total services running"
}

ensure_supabase() {
  # Ensure Docker is running
  if ! docker info >/dev/null 2>&1; then
    echo "Starting Docker..."
    open -a Docker
    local attempts=0
    while ! docker info >/dev/null 2>&1; do
      if [ $attempts -ge 30 ]; then
        echo "ERROR: Docker failed to start after 60 seconds"
        exit 1
      fi
      sleep 2
      attempts=$((attempts + 1))
    done
    echo "Docker is running."
  fi

  # Ensure Supabase is running (check API port 54321)
  if curl -s -o /dev/null http://localhost:54321/rest/v1/ 2>/dev/null; then
    printf "  ${GREEN}●${NC} %-16s already running\n" "supabase"
  else
    echo "  Starting Supabase..."
    supabase start
    printf "  ${GREEN}●${NC} %-16s started\n" "supabase"
  fi
}

ensure_lightning() {
  # Check if LND REST port is reachable (4004)
  if lsof -i :6108 -sTCP:LISTEN -P -n >/dev/null 2>&1; then
    printf "  ${GREEN}●${NC} %-16s already running (ports 6108/6109)\n" "lightning"
  else
    echo "  Starting Lightning Network (regtest)..."
    docker compose --profile lightning up -d bitcoind lnd lnd-init bitcoind-miner 2>/dev/null
    printf "  ${BLUE}▶${NC} %-16s starting (ports 6108/6109)\n" "lightning"

    # Run lnd-env.sh to populate macaroon in .env (background, non-blocking)
    mkdir -p /tmp/oai-dev-logs
    nohup bash "$SCRIPT_DIR/lnd-env.sh" > /tmp/oai-dev-logs/lightning-env.log 2>&1 &
    printf "  ${BLUE}▶${NC} %-16s extracting credentials (background)\n" "lnd-env"
  fi
}

start_servers() {
  echo ""
  echo "=== Smart Start (${PORT_PREFIX}xxx ports from .env) ==="
  echo ""

  ensure_supabase
  ensure_lightning
  echo ""

  # In gateway mode, set gateway-aware URLs so SPAs route API calls through nginx.
  if [ "$GATEWAY_MODE" = "true" ]; then
    local PUB="${CF_PUBLIC_URL:-https://orchestratorai.io}"
    # API URLs through gateway
    export VITE_AUTH_API_URL="${PUB}/api/auth"
    export VITE_API_BASE_URL="${PUB}/api/auth"
    export VITE_API_NESTJS_BASE_URL="${PUB}/api/admin"
    export VITE_API_URL="${PUB}"
    export VITE_MAIN_API_URL="${PUB}"
    export VITE_ADMIN_API_URL="${PUB}/api/admin"
    export VITE_FORGE_API_URL="${PUB}/api/forge"
    export VITE_COMPOSE_API_BASE_URL="${PUB}/api/compose"
    export VITE_PULSE_API_URL="${PUB}/api/pulse"
    export VITE_BRIDGE_API_URL="${PUB}/api/bridge"
    # CORS origins
    export CORS_ORIGINS="https://orchestratorai.io,http://localhost:${P_NGINX}"
    # Web base URLs for path-prefix routing
    export VITE_BASE_URL_COMMAND=/
    export VITE_BASE_URL_ADMIN=/admin/
    export VITE_BASE_URL_FORGE=/forge/
    export VITE_BASE_URL_COMPOSE=/compose/
    export VITE_BASE_URL_PULSE=/pulse/
    export VITE_BASE_URL_BRIDGE=/bridge/
    echo ""
    echo "  Gateway mode: API calls route through ${PUB}"
    echo ""

    # Start nginx gateway if not already running
    local NGINX_CONF
    NGINX_CONF="$(cd "$(dirname "$0")" && pwd)/nginx-prod.conf"
    if ! lsof -i :${P_NGINX} -sTCP:LISTEN -P -n >/dev/null 2>&1; then
      printf "  ${BLUE}▶${NC} %-16s starting (port ${P_NGINX})\n" "nginx-gateway"
      sudo nginx -c "$NGINX_CONF" 2>/dev/null || nginx -c "$NGINX_CONF" 2>/dev/null
    else
      printf "  ${GREEN}●${NC} %-16s already running (port ${P_NGINX})\n" "nginx-gateway"
    fi

    # Start cloudflared tunnel if not already running
    local CF_CONFIG="$(cd "$(dirname "$0")/../cloudflared" && pwd)/config-native.yml"
    if ! pgrep -f "cloudflared.*tunnel" >/dev/null 2>&1; then
      printf "  ${BLUE}▶${NC} %-16s starting\n" "cloudflared"
      local logdir="/tmp/oai-dev-logs"
      mkdir -p "$logdir"
      nohup cloudflared tunnel --config "$CF_CONFIG" run > "$logdir/cloudflared.log" 2>&1 &
    else
      printf "  ${GREEN}●${NC} %-16s already running\n" "cloudflared"
    fi
    echo ""
  fi

  local started=0
  local skipped=0
  local restarted=0

  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port health_path cmd <<< "$entry"

    if check_port "$port"; then
      if check_health "$port" "$health_path"; then
        # Running + healthy → skip
        printf "  ${GREEN}●${NC} %-16s already healthy (port %s)\n" "$name" "$port"
        skipped=$((skipped + 1))
      else
        # Running + unhealthy → restart
        printf "  ${YELLOW}↻${NC} %-16s unhealthy — restarting (port %s)\n" "$name" "$port"
        kill_port "$port"
        sleep 1
        start_service "$name" "$cmd"
        restarted=$((restarted + 1))
      fi
    else
      # Not running → start
      printf "  ${BLUE}▶${NC} %-16s starting (port %s)\n" "$name" "$port"
      start_service "$name" "$cmd"
      started=$((started + 1))
    fi
  done

  echo ""
  echo "Done: $started started, $restarted restarted, $skipped already running"
  echo "Logs: /tmp/oai-dev-logs/"
  echo ""
  echo "Run '$0 status' to check health after services finish booting."
}

case "$ACTION" in
  start)  start_servers ;;
  stop)   stop_servers ;;
  status) status_servers ;;
  *)
    echo "Usage: $0 {start|stop|status} [dev|gateway]"
    exit 1
    ;;
esac
