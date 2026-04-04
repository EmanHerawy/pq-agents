#!/bin/bash
# Deploy account factory contracts.
#
# Args:
#   $1  Private key  (or set PRIVATE_KEY env var)
#   $2  Explorer API key for verification (or set API_KEY env var)
#   $3  Contract name from DeployFactories.s.sol
#
# RPC is taken from RPC_URL env var, falling back to ARC_TESTNET_RPC_URL, then Base Sepolia.
#
# Standard factories:
#   MLDSA_ECDSAk1_Factory | MLDSAETH_ECDSAk1_Factory | MLDSA_ECDSAr1_Factory
#   MLDSAETH_ECDSAr1_Factory | FALCON_ECDSAk1_Factory | FALCON_ECDSAr1_Factory
#   ETHFALCON_ECDSAk1_Factory | ETHFALCON_ECDSAr1_Factory
#
# Agent factories (distinct salt/saltLabel, createAgentAccount-ready):
#   MLDSA_ECDSAk1_AgentFactory | ETHFALCON_ECDSAk1_AgentFactory
#   FALCON_ECDSAk1_AgentFactory | MLDSAETH_ECDSAk1_AgentFactory
#
# Examples:
#   ./deploy_factories.sh $PK $API_KEY MLDSA_ECDSAk1_AgentFactory
#   RPC_URL=https://rpc.testnet.arc.network ./deploy_factories.sh $PK "" MLDSA_ECDSAk1_AgentFactory

set -e

CONTRACT_NAME="DeployFactories.s.sol"

PRIVATE_KEY="${1:-$PRIVATE_KEY}"
API_KEY="${2:-$API_KEY}"
TC="$3"

if [ -z "$PRIVATE_KEY" ]; then echo "Error: private key required (arg 1 or PRIVATE_KEY env)"; exit 1; fi
if [ -z "$TC" ];          then echo "Error: contract name required (arg 3)"; exit 1; fi

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
