#!/bin/bash
# Deploy verifier (fixed) contracts.
#
# Args:
#   $1  Private key  (or set PRIVATE_KEY env var)
#   $2  Explorer API key for verification (or set API_KEY env var)
#   $3  Contract name from DeployFixedContracts.s.sol
#
# RPC is taken from RPC_URL env var, falling back to ARC_TESTNET_RPC_URL, then Base Sepolia.
# Set NETWORK env var to override (sepolia | baseSepolia | arbitrumSepolia | arcTestnet).
#
# Examples:
#   ./deploy_fixed_contracts.sh $PK $API_KEY MLDSAFixedContract
#   RPC_URL=https://rpc.testnet.arc.network ./deploy_fixed_contracts.sh $PK $API_KEY MLDSAFixedContract

set -e

CONTRACT_NAME="DeployFixedContracts.s.sol"

PRIVATE_KEY="${1:-$PRIVATE_KEY}"
API_KEY="${2:-$API_KEY}"
TC="$3"

if [ -z "$PRIVATE_KEY" ]; then echo "Error: private key required (arg 1 or PRIVATE_KEY env)"; exit 1; fi
if [ -z "$TC" ];          then echo "Error: contract name required (arg 3), e.g. MLDSAFixedContract"; exit 1; fi

# ── RPC selection ─────────────────────────────────────────────────────────────
if [ -n "$RPC_URL" ]; then
  RPC="$RPC_URL"
elif [ -n "$ARC_TESTNET_RPC_URL" ]; then
  RPC="$ARC_TESTNET_RPC_URL"
else
  RPC="wss://base-sepolia-rpc.publicnode.com"
fi

PUB_KEY=$(cast wallet address --private-key "$PRIVATE_KEY" 2>/dev/null || echo "unknown")
echo "Contract : $TC"
echo "RPC      : $RPC"
echo "Wallet   : $PUB_KEY"
echo "Balance  : $(cast balance "$PUB_KEY" --rpc-url "$RPC" 2>/dev/null || echo 'n/a')"
echo ""

# ── Deploy ────────────────────────────────────────────────────────────────────
forge script "$CONTRACT_NAME" \
  --rpc-url "$RPC" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --tc "$TC" \
  --priority-gas-price 1 \
  -vvvv

# ── Verify (skip if no API key) ───────────────────────────────────────────────
if [ -n "$API_KEY" ]; then
  forge script "$CONTRACT_NAME" \
    --rpc-url "$RPC" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --tc "$TC" \
    --etherscan-api-key "$API_KEY" \
    --verify \
    --resume
fi
