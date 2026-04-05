import { defineChain, type Chain } from "viem";
import {
  bsc,
  base,
  baseSepolia,
  hardhat,
  mainnet,
  polygon,
  sepolia,
} from "viem/chains";

// ─── Target network (edit to switch chains) ────────────────────────────────
export const TARGET_NETWORK = (process.env.NEXT_PUBLIC_TARGET_NETWORK || "baseSepolia") as NetworkKey;
export const RPC_OVERRIDES: Record<string, string> = {};

// ─── Types ─────────────────────────────────────────────────────────────────
export type NetworkKey =
  | "ethereum" | "base" | "sepolia" | "baseSepolia"
  | "polygon" | "bnb" | "localhost";

export type TokenDef = {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
};

export type NetworkDefinition = {
  key: NetworkKey;
  chainId: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrl: string;
  blockExplorerUrl: string;
  tokens: TokenDef[];
};

// ─── Network registry ──────────────────────────────────────────────────────
export const NETWORKS: Record<NetworkKey, NetworkDefinition> = {
  ethereum: {
    key: "ethereum", chainId: 1, name: "Ethereum",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: "https://eth.llamarpc.com", blockExplorerUrl: "https://etherscan.io",
    tokens: [
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    ],
  },
  base: {
    key: "base", chainId: 8453, name: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: "https://mainnet.base.org", blockExplorerUrl: "https://basescan.org",
    tokens: [
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    ],
  },
  sepolia: {
    key: "sepolia", chainId: 11155111, name: "Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.sepolia.org", blockExplorerUrl: "https://sepolia.etherscan.io",
    tokens: [
      { symbol: "USDC", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
    ],
  },
  baseSepolia: {
    key: "baseSepolia", chainId: 84532, name: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org",
    blockExplorerUrl: "https://sepolia.basescan.org",
    tokens: [
      { symbol: "USDC", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
    ],
  },
  polygon: {
    key: "polygon", chainId: 137, name: "Polygon",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrl: "https://polygon-rpc.com", blockExplorerUrl: "https://polygonscan.com",
    tokens: [
      { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    ],
  },
  bnb: {
    key: "bnb", chainId: 56, name: "BNB Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrl: "https://bsc-dataseed.binance.org", blockExplorerUrl: "https://bscscan.com",
    tokens: [],
  },
  localhost: {
    key: "localhost", chainId: 31337, name: "Localhost",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: "http://127.0.0.1:8545", blockExplorerUrl: "http://localhost:8545",
    tokens: [],
  },
};

export function getActiveNetwork(): NetworkDefinition {
  const key = TARGET_NETWORK;
  const net = NETWORKS[key] ?? NETWORKS.baseSepolia;
  const override = RPC_OVERRIDES[String(net.chainId)] || RPC_OVERRIDES[key];
  return { ...net, rpcUrl: override?.trim() || net.rpcUrl };
}

// ─── Viem chain helper (inlined — no monorepo dep) ─────────────────────────
const KNOWN_BY_CHAIN_ID: Record<number, Chain> = {
  [mainnet.id]: mainnet, [base.id]: base, [sepolia.id]: sepolia,
  [baseSepolia.id]: baseSepolia, [polygon.id]: polygon, [bsc.id]: bsc, [hardhat.id]: hardhat,
};

export function viemChainForNetwork(net: NetworkDefinition): Chain {
  const known = KNOWN_BY_CHAIN_ID[net.chainId];
  if (known) {
    return defineChain({
      ...known,
      rpcUrls: { ...known.rpcUrls, default: { http: [net.rpcUrl] } },
    });
  }
  return defineChain({
    id: net.chainId,
    name: net.name,
    nativeCurrency: net.nativeCurrency,
    rpcUrls: { default: { http: [net.rpcUrl] } },
    contracts: {
      multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0 },
    },
  });
}
