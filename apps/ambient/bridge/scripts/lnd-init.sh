#!/bin/sh
# =============================================================================
# LND Regtest Init Script
# Waits for LND to be ready (--noseedbackup auto-creates wallet),
# gets an address for mining, exports macaroon, then waits for sync.
# =============================================================================

set -e

MACAROON_OUTPUT="/shared/admin.macaroon.hex"
MACAROON_PATH="/root/.lnd/data/chain/bitcoin/regtest/admin.macaroon"
LND_DIR="/root/.lnd"
LNCLI="lncli --network=regtest --rpcserver=lnd:10009 --lnddir=$LND_DIR --tlscertpath=$LND_DIR/tls.cert"

echo "[lnd-init] Waiting for LND to be reachable..."
until $LNCLI getinfo > /dev/null 2>&1; do
  sleep 2
done
echo "[lnd-init] LND is up."

# Wait for the macaroon file
echo "[lnd-init] Waiting for admin macaroon..."
until [ -f "$MACAROON_PATH" ]; do
  sleep 1
done

# Export macaroon as hex
xxd -p -c 1000 "$MACAROON_PATH" > "$MACAROON_OUTPUT"
echo "[lnd-init] Macaroon exported."

# Get a new address from LND FIRST — so the miner can start
# (miner is waiting for this file before mining blocks)
ADDR=$($LNCLI newaddress p2wkh | grep '"address"' | cut -d'"' -f4)
echo "[lnd-init] LND address: $ADDR"
echo "$ADDR" > /shared/lnd-address.txt
echo "[lnd-init] Address written. Miner can now start."

# Now wait for chain sync (miner will mine blocks, causing sync)
echo "[lnd-init] Waiting for chain sync..."
until $LNCLI getinfo 2>/dev/null | grep -q 'synced_to_chain.*true'; do
  sleep 2
done
echo "[lnd-init] Chain synced. LND is fully ready."
echo "[lnd-init] Macaroon: $(cat $MACAROON_OUTPUT | head -c 40)..."

# Keep container alive so shared volume stays mounted
tail -f /dev/null
