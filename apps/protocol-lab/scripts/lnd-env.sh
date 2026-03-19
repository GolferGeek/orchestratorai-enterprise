#!/usr/bin/env bash
# =============================================================================
# Extract LND credentials from Docker and update .env
# Run this after `docker compose up -d bitcoind lnd lnd-init`
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
COMPOSE_DIR="$SCRIPT_DIR/.."

echo "[lnd-env] Waiting for LND init to complete..."

# Wait for the macaroon hex file to be available
MAX_WAIT=60
WAITED=0
while ! docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T lnd-init cat /shared/admin.macaroon.hex 2>/dev/null | grep -q .; do
  WAITED=$((WAITED + 1))
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "[lnd-env] ERROR: Timed out waiting for LND init after ${MAX_WAIT}s"
    exit 1
  fi
  sleep 1
done

MACAROON=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T lnd-init cat /shared/admin.macaroon.hex 2>/dev/null | tr -d '[:space:]')

if [ -z "$MACAROON" ]; then
  echo "[lnd-env] ERROR: Could not read macaroon from container"
  exit 1
fi

LND_URL="https://localhost:4004"

echo "[lnd-env] Got macaroon: ${MACAROON:0:20}..."
echo "[lnd-env] LND REST URL: $LND_URL"

# Update .env file
if grep -q "^LIGHTNING_LND_REST_URL=" "$ENV_FILE"; then
  sed -i '' "s|^LIGHTNING_LND_REST_URL=.*|LIGHTNING_LND_REST_URL=$LND_URL|" "$ENV_FILE"
else
  echo "LIGHTNING_LND_REST_URL=$LND_URL" >> "$ENV_FILE"
fi

if grep -q "^LIGHTNING_LND_MACAROON=" "$ENV_FILE"; then
  sed -i '' "s|^LIGHTNING_LND_MACAROON=.*|LIGHTNING_LND_MACAROON=$MACAROON|" "$ENV_FILE"
else
  echo "LIGHTNING_LND_MACAROON=$MACAROON" >> "$ENV_FILE"
fi

echo "[lnd-env] Updated $ENV_FILE with Lightning credentials"
echo "[lnd-env] Restart protocol-api to pick up the new credentials"
