#!/bin/bash
# =============================================================================
# OrchestratorAI Enterprise — Platform Dev Server Manager
# Usage:
#   ./scripts/dev-servers.sh start   # Start/heal Supabase + platform API + web
#   ./scripts/dev-servers.sh stop    # Stop platform API + web
#   ./scripts/dev-servers.sh status  # Show platform service status
#
# The starter runtime has one API app and one web app:
#   apps/api  -> PLATFORM_API_PORT, default 6700
#   apps/web  -> VITE_PLATFORM_WEB_PORT, default 6701
# =============================================================================

ACTION="${1:-start}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found at $ENV_FILE"
  exit 1
fi

load_env_var() {
  local key=$1
  local default=$2
  local val
  val=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
  echo "${val:-$default}"
}

SUPABASE_REST_URL=$(load_env_var SUPABASE_URL http://127.0.0.1:54321)
DATABASE_URL_VALUE=$(load_env_var DATABASE_URL postgresql://postgres:postgres@127.0.0.1:54322/postgres)
SUPABASE_REST_PORT=$(echo "$SUPABASE_REST_URL" | sed -E 's#^https?://[^:/]+:([0-9]+).*$#\1#')
SUPABASE_DB_PORT=$(echo "$DATABASE_URL_VALUE" | sed -E 's#^postgres(ql)?://[^@]+@[^:/]+:([0-9]+).*$#\2#')
if [ "$SUPABASE_REST_PORT" = "$SUPABASE_REST_URL" ]; then
  SUPABASE_REST_PORT=54321
fi
if [ "$SUPABASE_DB_PORT" = "$DATABASE_URL_VALUE" ]; then
  SUPABASE_DB_PORT=54322
fi

P_PLATFORM_API=$(load_env_var PLATFORM_API_PORT 6700)
P_PLATFORM_WEB=$(load_env_var VITE_PLATFORM_WEB_PORT 6701)

declare -a SERVICES=(
  "platform-api|${P_PLATFORM_API}|/health|npm run dev:api"
  "platform-web|${P_PLATFORM_WEB}|/|npm run dev:web"
)

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

check_port() {
  local port=$1
  lsof -i :"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1
}

check_health() {
  local port=$1
  local path=$2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}${path}" 2>/dev/null)
  [ "$code" = "200" ] || [ "$code" = "404" ]
}

kill_port() {
  local port=$1
  lsof -t -i :"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
}

start_service() {
  local name=$1
  local cmd=$2
  local logdir="/tmp/oai-dev-logs"
  mkdir -p "$logdir"
  nohup bash -c "$cmd" > "$logdir/${name}.log" 2>&1 &
}

ensure_supabase() {
  if ! docker info >/dev/null 2>&1; then
    echo "Starting Docker..."
    open -a Docker
    local attempts=0
    while ! docker info >/dev/null 2>&1; do
      if [ "$attempts" -ge 30 ]; then
        echo "ERROR: Docker failed to start after 60 seconds"
        exit 1
      fi
      sleep 2
      attempts=$((attempts + 1))
    done
    echo "Docker is running."
  fi

  if curl -s -o /dev/null "${SUPABASE_REST_URL}/rest/v1/" 2>/dev/null; then
    printf "  ${GREEN}●${NC} %-16s already running (%s/%s)\n" "supabase" "$SUPABASE_REST_PORT" "$SUPABASE_DB_PORT"
  else
    echo "  Starting Supabase..."
    supabase start
    printf "  ${GREEN}●${NC} %-16s started (%s/%s)\n" "supabase" "$SUPABASE_REST_PORT" "$SUPABASE_DB_PORT"
  fi
}

ensure_lightning() {
  if lsof -i :6108 -sTCP:LISTEN -P -n >/dev/null 2>&1; then
    printf "  ${GREEN}●${NC} %-16s already running (ports 6108/6109)\n" "lightning"
  else
    echo "  Starting Lightning Network (regtest)..."
    docker compose --profile lightning up -d bitcoind lnd lnd-init bitcoind-miner 2>/dev/null
    printf "  ${BLUE}▶${NC} %-16s starting (ports 6108/6109)\n" "lightning"
    mkdir -p /tmp/oai-dev-logs
    nohup bash "$SCRIPT_DIR/lnd-env.sh" > /tmp/oai-dev-logs/lightning-env.log 2>&1 &
  fi
}

stop_servers() {
  echo "Stopping platform servers..."

  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port health_path cmd <<< "$entry"
    if check_port "$port"; then
      kill_port "$port"
      printf "  ${RED}■${NC} %-16s stopped (port %s)\n" "$name" "$port"
    fi
  done

  echo "Done."
}

status_servers() {
  echo ""
  echo "=== Platform Service Status ==="
  echo ""

  if curl -s -o /dev/null "${SUPABASE_REST_URL}/rest/v1/" 2>/dev/null; then
    printf "  ${GREEN}●${NC} %-16s running (%s/%s)\n" "supabase" "$SUPABASE_REST_PORT" "$SUPABASE_DB_PORT"
  else
    printf "  ${RED}●${NC} %-16s DOWN\n" "supabase"
  fi

  if lsof -i :6108 -sTCP:LISTEN -P -n >/dev/null 2>&1; then
    printf "  ${GREEN}●${NC} %-16s running (6108/6109)\n" "lightning"
  else
    printf "  ${RED}○${NC} %-16s DOWN (6108/6109)\n" "lightning"
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
  echo "$running/$total platform services running"
}

start_servers() {
  echo ""
  echo "=== Platform Smart Start ==="
  echo ""

  ensure_supabase
  ensure_lightning
  echo ""

  local started=0
  local skipped=0
  local restarted=0

  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port health_path cmd <<< "$entry"

    if check_port "$port"; then
      if check_health "$port" "$health_path"; then
        printf "  ${GREEN}●${NC} %-16s already healthy (port %s)\n" "$name" "$port"
        skipped=$((skipped + 1))
      else
        printf "  ${YELLOW}↻${NC} %-16s unhealthy - restarting (port %s)\n" "$name" "$port"
        kill_port "$port"
        sleep 1
        start_service "$name" "$cmd"
        restarted=$((restarted + 1))
      fi
    else
      printf "  ${BLUE}▶${NC} %-16s starting (port %s)\n" "$name" "$port"
      start_service "$name" "$cmd"
      started=$((started + 1))
    fi
  done

  echo ""
  echo "Done: $started started, $restarted restarted, $skipped already running"
  echo "Logs: /tmp/oai-dev-logs/"
}

case "$ACTION" in
  start)  start_servers ;;
  stop)   stop_servers ;;
  status) status_servers ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
