#!/bin/sh
# =============================================================================
# Bitcoind Regtest Miner
# Waits for LND to provide an address, mines initial blocks,
# then mines a block every 10 seconds to keep the network alive.
# =============================================================================

set -e

echo "[miner] Waiting for LND address..."
until [ -f /shared/lnd-address.txt ]; do
  sleep 1
done

ADDR=$(cat /shared/lnd-address.txt)
echo "[miner] Mining to LND address: $ADDR"

# Create a wallet if one doesn't exist
bitcoin-cli -regtest -rpcconnect=bitcoind -rpcuser=dev -rpcpassword=dev createwallet "miner" 2>/dev/null || true

# Mine 105 blocks to make coinbase spendable (100 block maturity + 5 buffer)
echo "[miner] Mining 105 initial blocks..."
bitcoin-cli -regtest -rpcconnect=bitcoind -rpcuser=dev -rpcpassword=dev generatetoaddress 105 "$ADDR"
echo "[miner] Initial blocks mined. Starting periodic mining..."

# Mine a block every 10 seconds
while true; do
  bitcoin-cli -regtest -rpcconnect=bitcoind -rpcuser=dev -rpcpassword=dev generatetoaddress 1 "$ADDR" > /dev/null 2>&1
  sleep 10
done
