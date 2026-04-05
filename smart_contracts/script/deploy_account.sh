#!/bin/bash
# Call createAccount or createAgentAccount on a deployed factory.
#
# Required env vars:
#   FACTORY_ADDRESS       — deployed ZKNOX_AccountFactory address
#   PRE_QUANTUM_PUB_KEY   — hex ECDSA public key
#   POST_QUANTUM_PUB_KEY  — hex expanded ML-DSA-44 public key
#
# Optional env vars (agent account only):
#   MAX_ETH_PER_TX        — max ETH per tx in wei (default 0 = unlimited)
#   MAX_USDC_PER_TX       — max USDC per tx in 6-decimal units (default 0 = unlimited)
#   USDC_ADDRESS          — USDC token contract address (default address(0))
#
# Args:
#   $1  Private key  (or set PRIVATE_KEY env var)
#   $2  "base" or "agent"  (default: base)
#
# Examples:
#   ./deploy_account.sh $PK base
#   MAX_ETH_PER_TX=500000000000000000 MAX_USDC_PER_TX=100000000 USDC_ADDRESS=0x... ./deploy_account.sh $PK agent
#   RPC_URL=https://rpc.testnet.arc.network ./deploy_account.sh $PK agent

set -e

PRIVATE_KEY="${1:-$PRIVATE_KEY}"
ACCOUNT_TYPE="${2:-base}"

if [ -z "$PRIVATE_KEY" ];      then echo "Error: private key required (arg 1 or PRIVATE_KEY env)"; exit 1; fi
if [ -z "$FACTORY_ADDRESS" ];  then echo "Error: FACTORY_ADDRESS env var not set"; exit 1; fi
if [ -z "$PRE_QUANTUM_PUB_KEY" ];  then echo "Error: PRE_QUANTUM_PUB_KEY env var not set"; exit 1; fi
if [ -z "$POST_QUANTUM_PUB_KEY" ]; then echo "Error: POST_QUANTUM_PUB_KEY env var not set"; exit 1; fi

# ── RPC selection ─────────────────────────────────────────────────────────────
if [ -n "$RPC_URL" ]; then
  RPC="$RPC_URL"
elif [ -n "$ARC_TESTNET_RPC_URL" ]; then
  RPC="$ARC_TESTNET_RPC_URL"
else
  RPC="wss://base-sepolia-rpc.publicnode.com"
fi

case "$ACCOUNT_TYPE" in
  agent)
    TC="CreateAgentAccount"
    echo "Account type  : agent"
    echo "Max ETH/tx    : ${MAX_ETH_PER_TX:-0 (unlimited)}"
    echo "Max USDC/tx   : ${MAX_USDC_PER_TX:-0 (unlimited)}"
    echo "USDC address  : ${USDC_ADDRESS:-0x0000000000000000000000000000000000000000}"
    ;;
  *)
    TC="CreateBaseAccount"
    echo "Account type: base"
    ;;
esac

echo "Factory : $FACTORY_ADDRESS"
echo "RPC     : $RPC"
echo ""

forge script script/DeployAccount.s.sol \
  --rpc-url "$RPC" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --tc "$TC" \
  -vvvv
