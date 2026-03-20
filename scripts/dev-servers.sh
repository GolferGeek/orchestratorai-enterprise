#!/bin/bash
# =============================================================================
# OrchestratorAI Enterprise — Smart Dev Server Manager
# Usage:
#   ./scripts/dev-servers.sh start        # Start/heal all on 6xxx (dev)
#   ./scripts/dev-servers.sh start prod   # Start/heal all on 7xxx (prod)
#   ./scripts/dev-servers.sh stop         # Stop all 6xxx servers
#   ./scripts/dev-servers.sh stop prod    # Stop all 7xxx servers
#   ./scripts/dev-servers.sh status       # Show status of all services
#
# Smart behavior:
#   - Running + healthy → skip
#   - Running + unhealthy → restart
#   - Not running → start
# =============================================================================

ACTION="${1:-start}"
MODE="${2:-dev}"

if [ "$MODE" = "prod" ]; then
  BASE=7
else
  BASE=6
fi

# ---------------------------------------------------------------------------
# Service definitions: name, port, health path, start command
# ---------------------------------------------------------------------------
declare -a SERVICES=(
  "auth|${BASE}100|/health|npm run dev:auth"
  "admin-api|${BASE}150|/health|npm run dev:admin:api"
  "admin-web|${BASE}101|/|npm run dev:admin:web"
  "forge-api|${BASE}200|/health|npm run dev:forge:api"
  "forge-web|${BASE}201|/|npm run dev:forge:web"
  "compose-api|${BASE}300|/health|npm run dev:compose:api"
  "compose-web|${BASE}301|/|npm run dev:compose:web"
  "pulse-api|${BASE}500|/health|npm run dev:pulse:api"
  "pulse-web|${BASE}501|/|npm run dev:pulse:web"
  "bridge-api|${BASE}600|/health|npm run dev:bridge:api"
  "bridge-web|${BASE}601|/|npm run dev:bridge:web"
  "flow-api|${BASE}900|/health|npm run dev:flow:api"
  "flow-web|${BASE}901|/|npm run dev:flow:web"
  "command|${BASE}102|/|npm run dev:command"
  "protocol-lab|${BASE}400|/|npm run dev:protocol-lab"
)

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
  nohup bash -c "$cmd" > "$logdir/${name}.log" 2>&1 &
}

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

stop_servers() {
  echo "Stopping all servers on ${BASE}xxx ports..."
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
  echo "=== Service Status (${MODE} mode) ==="
  echo ""

  # Check Supabase
  if curl -s -o /dev/null http://localhost:54321/rest/v1/ 2>/dev/null; then
    printf "  ${GREEN}●${NC} %-16s %s\n" "supabase" "running (54321/54322)"
  else
    printf "  ${RED}●${NC} %-16s %s\n" "supabase" "DOWN"
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

start_servers() {
  echo ""
  echo "=== Smart Start (${MODE} mode) ==="
  echo ""

  ensure_supabase
  echo ""

  # Export port overrides
  export AUTH_API_PORT=${BASE}100
  export ADMIN_API_PORT=${BASE}150
  export ADMIN_WEB_PORT=${BASE}101
  export VITE_ADMIN_WEB_PORT=${BASE}101
  export FORGE_API_PORT=${BASE}200
  export FORGE_WEB_PORT=${BASE}201
  export VITE_FORGE_WEB_PORT=${BASE}201
  export COMPOSE_API_PORT=${BASE}300
  export COMPOSE_WEB_PORT=${BASE}301
  export VITE_WEB_PORT=${BASE}301
  export PULSE_API_PORT=${BASE}500
  export VITE_PULSE_API_PORT=${BASE}500
  export PULSE_WEB_PORT=${BASE}501
  export VITE_PULSE_WEB_PORT=${BASE}501
  export BRIDGE_API_PORT=${BASE}600
  export VITE_BRIDGE_API_PORT=${BASE}600
  export BRIDGE_WEB_PORT=${BASE}601
  export VITE_BRIDGE_WEB_PORT=${BASE}601
  export FLOW_API_PORT=${BASE}900
  export FLOW_WEB_PORT=${BASE}901
  export COMMAND_WEB_PORT=${BASE}102
  export VITE_COMMAND_WEB_PORT=${BASE}102
  export VITE_COMMAND_WEB_URL=http://localhost:${BASE}102
  export AUTH_API_URL=http://localhost:${BASE}100
  export FORGE_API_URL=http://localhost:${BASE}200
  export COMPOSE_API_URL=http://localhost:${BASE}300
  export PULSE_API_URL=http://localhost:${BASE}500
  export BRIDGE_API_URL=http://localhost:${BASE}600
  export FLOW_API_URL=http://localhost:${BASE}900
  export VITE_AUTH_API_URL=http://localhost:${BASE}100
  export VITE_AUTH_API_PORT=${BASE}100

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
    echo "Usage: $0 {start|stop|status} [dev|prod]"
    exit 1
    ;;
esac
