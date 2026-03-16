#!/bin/bash
# =============================================================================
# OrchestratorAI Enterprise — Start/Stop All Dev Servers
# Usage:
#   ./scripts/dev-servers.sh start        # Start all on 6xxx (dev)
#   ./scripts/dev-servers.sh start prod   # Start all on 7xxx (prod)
#   ./scripts/dev-servers.sh stop         # Stop all 6xxx servers
#   ./scripts/dev-servers.sh stop prod    # Stop all 7xxx servers
# =============================================================================

set -e

ACTION="${1:-start}"
MODE="${2:-dev}"

if [ "$MODE" = "prod" ]; then
  BASE=7
else
  BASE=6
fi

# All ports for this mode
PORTS="${BASE}000 ${BASE}100 ${BASE}101 ${BASE}150 ${BASE}200 ${BASE}201 ${BASE}300 ${BASE}301 ${BASE}500 ${BASE}501 ${BASE}600 ${BASE}601 ${BASE}900 ${BASE}901"

stop_servers() {
  echo "Stopping all servers on ${BASE}xxx ports..."
  PORT_ARGS=""
  for p in $PORTS; do
    PORT_ARGS="$PORT_ARGS -i :$p"
  done
  # shellcheck disable=SC2086
  lsof -t $PORT_ARGS 2>/dev/null | xargs kill -9 2>/dev/null || true
  echo "All ${BASE}xxx servers stopped."
}

ensure_supabase() {
  # Ensure Docker is running
  if ! docker info >/dev/null 2>&1; then
    echo "Starting Docker..."
    open -a Docker
    # Wait for Docker daemon to be ready (max 60s)
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
  else
    echo "Docker is already running."
  fi

  # Ensure Supabase is running
  if ! supabase status >/dev/null 2>&1; then
    echo "Starting Supabase..."
    supabase start
    echo "Supabase is running."
  else
    echo "Supabase is already running."
  fi
}

start_servers() {
  ensure_supabase
  stop_servers

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
  export COMMAND_WEB_PORT=${BASE}000

  # Update API URLs for the mode
  export AUTH_API_URL=http://localhost:${BASE}100
  export FORGE_API_URL=http://localhost:${BASE}200
  export COMPOSE_API_URL=http://localhost:${BASE}300
  export PULSE_API_URL=http://localhost:${BASE}500
  export BRIDGE_API_URL=http://localhost:${BASE}600
  export FLOW_API_URL=http://localhost:${BASE}900
  export VITE_AUTH_API_URL=http://localhost:${BASE}100
  export VITE_AUTH_API_PORT=${BASE}100

  echo ""
  echo "Starting all servers on ${BASE}xxx ports ($MODE mode)..."
  echo ""

  npx concurrently --kill-others \
    -c "red,yellow,yellow,blue,blue,green,green,magenta,magenta,cyan,cyan,gray" \
    -n "auth,admin-api,admin-web,forge-api,forge-web,compose-api,compose-web,pulse-api,pulse-web,bridge-api,bridge-web,command" \
    "npm run dev:auth" \
    "npm run dev:admin:api" \
    "npm run dev:admin:web" \
    "npm run dev:forge:api" \
    "npm run dev:forge:web" \
    "npm run dev:compose:api" \
    "npm run dev:compose:web" \
    "npm run dev:pulse:api" \
    "npm run dev:pulse:web" \
    "npm run dev:bridge:api" \
    "npm run dev:bridge:web" \
    "npm run dev:command"
}

case "$ACTION" in
  start) start_servers ;;
  stop)  stop_servers ;;
  *)
    echo "Usage: $0 {start|stop} [dev|prod]"
    exit 1
    ;;
esac
