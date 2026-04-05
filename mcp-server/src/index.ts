#!/usr/bin/env node
/**
 * PQ MCP Server
 *
 * Exposes post-quantum ERC-4337 account management as MCP tools:
 *   - pq_get_public_keys       Derive ECDSA + ML-DSA-44 public keys from seeds
 *   - pq_get_account_address   Predict the ERC-4337 account address (no tx)
 *   - pq_create_account        Deploy a hybrid PQ ERC-4337 smart account
 *   - pq_send_transaction      Send a tx via ERC-4337 with hybrid signatures
 *   - pq_validate_seed         Validate a 32-byte hex seed string
 *   - list_networks            List supported networks
 *   - resolve_signing_keys     Fetch signing keys from 1claw vault or env
 *
 * Configuration via env vars:
 *   AGENT_PRIVATE_KEY          ECDSA private key (0x...)
 *   POST_QUANTUM_SEED          ML-DSA-44 seed (0x...)
 *   PQ_FACTORY_ADDRESS         ZKNOX account factory contract address
 *   BUNDLER_URL                ERC-4337 bundler URL
 *   RPC_URL                    JSON-RPC endpoint (overrides network default)
 *   TARGET_NETWORK             Network key (default: baseSepolia)
 *   ONECLAW_VAULT_ID           1claw vault ID (for fetching secrets)
 *   ONECLAW_AGENT_ID           1claw agent ID
 *   ONECLAW_AGENT_API_KEY      1claw agent API key
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ml_dsa44 } from "@noble/post-quantum/ml-dsa.js";
import { ethers } from "ethers";
// 1claw SDK replaced with direct fetch calls (SDK has broken ESM internals)
import { shake128, shake256 } from "@noble/hashes/sha3.js";
// @ts-ignore
import { genCrystals } from "@noble/post-quantum/_crystals.js";

// ─── Hex util ────────────────────────────────────────────────────────────────

function hexToU8(hex: string, expectedBytes = 32): Uint8Array {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.length !== expectedBytes * 2)
    throw new Error(`Seed must be ${expectedBytes} bytes (${expectedBytes * 2} hex chars)`);
  return Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

// ─── ML-DSA-44 public key expansion (NTT domain for ZKNOX verifier) ──────────

const N = 256, Q = 8380417, D = 13;
// @ts-ignore
const { NTT } = (genCrystals as any)({ N, Q, F: 8347681, ROOT_OF_UNITY: 1753, newPoly: (n: number) => new Int32Array(n), isKyber: false, brvBits: 8 });

function polyShiftl(p: Int32Array): Int32Array { for (let i = 0; i < N; i++) p[i] <<= D; return p; }

function RejectionSamplePoly(rho: Uint8Array, i: number, j: number): Int32Array {
  const seed = new Uint8Array(rho.length + 2);
  seed.set(rho, 0); seed[rho.length] = j; seed[rho.length + 1] = i;
  const xof = shake128.create(); xof.update(seed);
  const r = new Int32Array(N); let j_idx = 0;
  while (j_idx < N) {
    const buf = new Uint8Array(3 * 64); xof.xofInto(buf);
    for (let k = 0; j_idx < N && k <= buf.length - 3; k += 3) {
      let t = buf[k] | (buf[k + 1] << 8) | (buf[k + 2] << 16); t &= 0x7fffff;
      if (t < Q) r[j_idx++] = t;
    }
  }
  return r;
}

function recoverAhat(rho: Uint8Array, K: number, L: number): Int32Array[][] {
  const A_hat: Int32Array[][] = [];
  for (let i = 0; i < K; i++) { const row: Int32Array[] = []; for (let j = 0; j < L; j++) row.push(RejectionSamplePoly(rho, i, j)); A_hat.push(row); }
  return A_hat;
}

function polyDecode10Bits(bytes: Uint8Array): Int32Array {
  const poly = new Int32Array(N); let r = 0n;
  for (let i = 0; i < bytes.length; i++) r |= BigInt(bytes[i]) << BigInt(8 * i);
  const mask = (1 << 10) - 1;
  for (let i = 0; i < poly.length; i++) poly[i] = Number((r >> BigInt(i * 10)) & BigInt(mask));
  return poly;
}

function decodePublicKey(publicKey: Uint8Array) {
  const RHO_BYTES = 32, K = 4, T1_POLY_BYTES = 320;
  if (publicKey.length !== RHO_BYTES + K * T1_POLY_BYTES) throw new Error("Invalid publicKey length");
  const rho = publicKey.slice(0, RHO_BYTES);
  const t1: Int32Array[] = [];
  for (let i = 0; i < K; i++) { const offset = RHO_BYTES + i * T1_POLY_BYTES; t1.push(polyDecode10Bits(publicKey.slice(offset, offset + T1_POLY_BYTES))); }
  const tr = shake256(new Uint8Array(publicKey), { dkLen: 64 });
  return { rho, t1, tr };
}

function compactPoly256(coeffs: Int32Array, m: number): bigint[] {
  const a = Array.from(coeffs, (x) => BigInt(Math.floor(x)));
  const n = (a.length * m) / 256; const b = new Array(n).fill(0n);
  for (let i = 0; i < a.length; i++) { const idx = Math.floor((i * m) / 256); const shift = BigInt((i % (256 / m)) * m); b[idx] |= a[i] << shift; }
  return b;
}

function toExpandedEncodedBytes(publicKey: Uint8Array): string {
  const { rho, t1, tr } = decodePublicKey(publicKey);
  t1.forEach((poly) => NTT.encode(polyShiftl(poly)));
  const A_hat = recoverAhat(rho, 4, 4);
  const A_hat_compact = A_hat.map((row) => row.map((p) => compactPoly256(p, 32)));
  const A_hat_str = A_hat_compact.map((row) => row.map((col) => col.map((v) => v.toString())));
  const [t1_compact] = [t1].map((row) => row.map((p) => compactPoly256(p, 32)));
  const t1_str = t1_compact.map((row) => row.map((v) => v.toString()));
  const abi = ethers.AbiCoder.defaultAbiCoder();
  return abi.encode(["bytes", "bytes", "bytes"], [abi.encode(["uint256[][][]"], [A_hat_str]), tr, abi.encode(["uint256[][]"], [t1_str])]);
}

// ─── Seed validation ──────────────────────────────────────────────────────────

function validateSeed(seed: string, name: string): void {
  if (!seed.startsWith("0x")) throw new Error(`${name} must start with "0x"`);
  if (seed.length !== 66) throw new Error(`${name} must be 32 bytes (66 chars, got ${seed.length})`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(seed)) throw new Error(`${name} contains invalid hex`);
}

// ─── Public key derivation ────────────────────────────────────────────────────

function getPublicKeys(preQuantumSeed: string, postQuantumSeed: string) {
  const preQuantumPubKey = new ethers.Wallet(preQuantumSeed).address;
  const { publicKey } = ml_dsa44.keygen(hexToU8(postQuantumSeed, 32));
  const postQuantumPubKey = toExpandedEncodedBytes(publicKey);
  return { preQuantumPubKey, postQuantumPubKey };
}

// ─── Networks ─────────────────────────────────────────────────────────────────

const NETWORKS: Record<string, { chainId: number; name: string; rpcUrl: string; blockExplorerUrl: string }> = {
  ethereum:   { chainId: 1,        name: "Ethereum",     rpcUrl: "https://eth.llamarpc.com",        blockExplorerUrl: "https://etherscan.io" },
  base:       { chainId: 8453,     name: "Base",         rpcUrl: "https://mainnet.base.org",        blockExplorerUrl: "https://basescan.org" },
  sepolia:    { chainId: 11155111, name: "Sepolia",      rpcUrl: "https://rpc.sepolia.org",         blockExplorerUrl: "https://sepolia.etherscan.io" },
  baseSepolia:{ chainId: 84532,    name: "Base Sepolia", rpcUrl: "https://sepolia.base.org",        blockExplorerUrl: "https://sepolia.basescan.org" },
  polygon:    { chainId: 137,      name: "Polygon",      rpcUrl: "https://polygon-rpc.com",         blockExplorerUrl: "https://polygonscan.com" },
  bnb:        { chainId: 56,       name: "BNB Chain",    rpcUrl: "https://bsc-dataseed.binance.org",blockExplorerUrl: "https://bscscan.com" },
  localhost:  { chainId: 31337,    name: "Localhost",    rpcUrl: "http://127.0.0.1:8545",           blockExplorerUrl: "http://localhost:8545" },
  arc:        { chainId: 5042002,  name: "ARC Testnet",  rpcUrl: process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network", blockExplorerUrl: "https://explorer.testnet.arc.network" },
};

function getRpcUrl(networkKey?: string): string {
  if (process.env.RPC_URL?.trim()) return process.env.RPC_URL.trim();
  const key = networkKey || process.env.TARGET_NETWORK || "baseSepolia";
  return NETWORKS[key]?.rpcUrl ?? NETWORKS.baseSepolia.rpcUrl;
}

// ─── 1claw vault ──────────────────────────────────────────────────────────────

const BASE_URL = (process.env.ONECLAW_API_BASE_URL || "https://api.1claw.xyz").replace(/\/$/, "");

function norm(v?: string) {
  let s = (v || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1).trim();
  return s === "undefined" || s === "null" ? "" : s;
}

async function getOneclawToken(): Promise<string> {
  const agentId = norm(process.env.ONECLAW_AGENT_ID);
  const agentKey = norm(process.env.ONECLAW_AGENT_API_KEY);
  const apiKey = norm(process.env.ONECLAW_API_KEY);

  if (apiKey) {
    const res = await fetch(`${BASE_URL}/v1/auth/api-key-token`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const json = await res.json() as { access_token?: string };
    if (!json.access_token) throw new Error("1claw api-key auth failed");
    return json.access_token;
  }
  if (agentId && agentKey) {
    const res = await fetch(`${BASE_URL}/v1/auth/agent-token`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId, api_key: agentKey }),
    });
    const json = await res.json() as { access_token?: string };
    if (!json.access_token) throw new Error("1claw agent auth failed");
    return json.access_token;
  }
  throw new Error("Missing 1claw credentials — set ONECLAW_API_KEY or (ONECLAW_AGENT_ID + ONECLAW_AGENT_API_KEY)");
}

async function fetchVaultSecret(path: string): Promise<string | null> {
  const vaultId = norm(process.env.ONECLAW_VAULT_ID);
  if (!vaultId) return null;
  try {
    const token = await getOneclawToken();
    const encodedPath = encodeURIComponent(path);
    const res = await fetch(`${BASE_URL}/v1/vaults/${vaultId}/secrets/${encodedPath}?reason=mcp-server-key-fetch`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json() as { value?: string };
    return typeof json.value === "string" ? json.value.trim() : null;
  } catch {
    return null;
  }
}

async function resolveSigningKeys() {
  const envKey = (process.env.AGENT_PRIVATE_KEY || "").trim();
  const envSeed = (process.env.POST_QUANTUM_SEED || "").trim();
  if (envKey && envSeed) return { agentPrivateKey: envKey, postQuantumSeed: envSeed, source: "env" as const };
  const vaultId = norm(process.env.ONECLAW_VAULT_ID);
  if (!vaultId) return { agentPrivateKey: envKey || null, postQuantumSeed: envSeed || null, source: "none" as const };
  const [vaultKey, vaultSeed] = await Promise.all([
    !envKey ? fetchVaultSecret("private-keys/agent") : Promise.resolve(envKey),
    !envSeed ? fetchVaultSecret("private-keys/post-quantum-seed") : Promise.resolve(envSeed),
  ]);
  const finalKey = vaultKey || envKey || null;
  const finalSeed = vaultSeed || envSeed || null;
  return { agentPrivateKey: finalKey, postQuantumSeed: finalSeed, source: finalKey && finalSeed ? "vault" as const : "none" as const };
}

// ─── ERC-4337 helpers (Node.js / JsonRpcProvider edition) ────────────────────

const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

const ACCOUNT_ABI = [
  "function execute(address dest, uint256 value, bytes calldata func) external",
  "function getNonce() external view returns (uint256)",
];

const ACCOUNT_FACTORY_ABI = [
  "function createAccount(bytes calldata preQuantumPubKey, bytes calldata postQuantumPubKey) external returns (address)",
  "function getAddress(bytes calldata preQuantumPubKey, bytes calldata postQuantumPubKey) external view returns (address payable)",
];

type UserOperation = {
  sender: string; nonce: bigint; initCode: string; callData: string;
  accountGasLimits: string; preVerificationGas: bigint; gasFees: string;
  paymasterAndData: string; signature: string;
};

function packUint128(a: bigint, b: bigint): string {
  return ethers.solidityPacked(["uint128", "uint128"], [a, b]);
}

function unpackUint128(packed: string): [bigint, bigint] {
  const bytes = ethers.getBytes(packed);
  const first = BigInt("0x" + ethers.hexlify(bytes.slice(0, 16)).slice(2));
  const second = BigInt("0x" + ethers.hexlify(bytes.slice(16, 32)).slice(2));
  return [first, second];
}

function userOpToBundlerFormat(userOp: UserOperation) {
  const [verificationGasLimit, callGasLimit] = unpackUint128(userOp.accountGasLimits);
  const [maxPriorityFeePerGas, maxFeePerGas] = unpackUint128(userOp.gasFees);
  return {
    sender: userOp.sender,
    nonce: "0x" + BigInt(userOp.nonce).toString(16),
    callData: userOp.callData,
    verificationGasLimit: "0x" + verificationGasLimit.toString(16),
    callGasLimit: "0x" + callGasLimit.toString(16),
    preVerificationGas: "0x" + BigInt(userOp.preVerificationGas).toString(16),
    maxFeePerGas: "0x" + maxFeePerGas.toString(16),
    maxPriorityFeePerGas: "0x" + maxPriorityFeePerGas.toString(16),
    signature: userOp.signature,
  };
}

function getDummySignature(): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(["bytes", "bytes"], [new Uint8Array(65), new Uint8Array(2420)]);
}

function getUserOpHash(userOp: UserOperation, entryPointAddress: string, chainId: bigint): string {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const packed = abi.encode(
    ["address", "uint256", "bytes32", "bytes32", "bytes32", "uint256", "bytes32", "bytes32"],
    [userOp.sender, userOp.nonce, ethers.keccak256(userOp.initCode), ethers.keccak256(userOp.callData),
     userOp.accountGasLimits, userOp.preVerificationGas, userOp.gasFees, ethers.keccak256(userOp.paymasterAndData)]
  );
  return ethers.keccak256(abi.encode(["bytes32", "address", "uint256"], [ethers.keccak256(packed), entryPointAddress, chainId]));
}

async function signUserOpHybrid(userOp: UserOperation, chainId: bigint, preQuantumPrivateKey: string, postQuantumSecretKey: Uint8Array): Promise<string> {
  const hash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, chainId);
  const preQuantumSig = new ethers.Wallet(preQuantumPrivateKey).signingKey.sign(hash).serialized;
  const postQuantumSig = ethers.hexlify(ml_dsa44.sign(ethers.getBytes(hash), postQuantumSecretKey));
  return ethers.AbiCoder.defaultAbiCoder().encode(["bytes", "bytes"], [preQuantumSig, postQuantumSig]);
}

async function buildUserOp(accountAddress: string, targetAddress: string, value: bigint, callData: string, provider: ethers.JsonRpcProvider, bundlerUrl: string): Promise<UserOperation> {
  const account = new ethers.Contract(accountAddress, ACCOUNT_ABI, provider);
  let nonce: bigint;
  try { nonce = await account.getNonce(); } catch { nonce = 0n; }

  const executeCallData = account.interface.encodeFunctionData("execute", [targetAddress, value, callData]);

  let maxPriority: bigint, maxFee: bigint;
  try {
    const res = await fetch(bundlerUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "pimlico_getUserOperationGasPrice", params: [] }) });
    const json = await res.json();
    maxFee = BigInt(json.result.standard.maxFeePerGas);
    maxPriority = BigInt(json.result.standard.maxPriorityFeePerGas);
  } catch {
    maxPriority = ethers.parseUnits("0.1", "gwei");
    maxFee = ethers.parseUnits("0.2", "gwei");
  }

  return { sender: accountAddress, nonce, initCode: "0x", callData: executeCallData, accountGasLimits: packUint128(13_500_000n, 500_000n), preVerificationGas: 1_000_000n, gasFees: packUint128(maxPriority, maxFee), paymasterAndData: "0x", signature: "0x" };
}

async function estimateGas(userOp: UserOperation, bundlerUrl: string) {
  const MIN = 13_500_000n;
  try {
    const res = await fetch(bundlerUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_estimateUserOperationGas", params: [userOpToBundlerFormat(userOp), ENTRY_POINT_ADDRESS] }) });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    let verificationGasLimit = BigInt(json.result.verificationGasLimit);
    if (verificationGasLimit < MIN) verificationGasLimit = MIN;
    return { verificationGasLimit, callGasLimit: BigInt(json.result.callGasLimit), preVerificationGas: BigInt(json.result.preVerificationGas || userOp.preVerificationGas) * 4n };
  } catch {
    return { verificationGasLimit: MIN, callGasLimit: 500_000n, preVerificationGas: userOp.preVerificationGas * 4n };
  }
}

// ─── Marketplace ─────────────────────────────────────────────────────────────

const SPENDING_LIMIT_USD = 20;

const MARKETPLACE_AGENTS = [
  {
    id: "consensus",
    name: "ConsensusAgent",
    ens: "consensus.agent.eth",
    address: "0x1111111111111111111111111111111111111111",
    pqAccount: "0xE6388d202979da19fC5Db7cC87e925228951fB36",
    chainId: 84532,
    type: "consensus",
    isQuantumSafe: true,
    bio: "Orchestrates GPT-4o, Claude 3.5, and Llama 3 in a multi-model voting consensus with confidence scoring.",
    skills: ["Multi-model consensus", "Confidence scoring", "Fallback orchestration"],
    services: [
      { name: "Consensus Query", price: 5, description: "Run a query across 3 LLMs and return a voted answer with confidence score.", tier: "consensus" },
      { name: "Deep Analysis", price: 15, description: "Extended multi-model analysis with detailed reasoning breakdown.", tier: "consensus" },
    ],
  },
  {
    id: "specialist",
    name: "DomainSpecialist",
    ens: "specialist.agent.eth",
    address: "0x2222222222222222222222222222222222222222",
    pqAccount: "0xE6388d202979da19fC5Db7cC87e925228951fB36",
    chainId: 84532,
    type: "specialist",
    isQuantumSafe: true,
    bio: "Fine-tuned expert in Rust/Axum, database migrations, API versioning, and cryptography.",
    skills: ["Rust/Axum", "Database migrations", "API versioning", "Cryptography"],
    services: [
      { name: "Code Review", price: 8, description: "Expert code review for Rust, cryptography, or API design.", tier: "special" },
      { name: "Architecture Consult", price: 18, description: "In-depth architecture session for your backend system.", tier: "special" },
    ],
  },
  {
    id: "librarian",
    name: "ContextLibrarian",
    ens: "librarian.agent.eth",
    address: "0x3333333333333333333333333333333333333333",
    pqAccount: "0xE6388d202979da19fC5Db7cC87e925228951fB36",
    chainId: 84532,
    type: "librarian",
    isQuantumSafe: true,
    bio: "RAG-enabled agent with persistent vector-store access to documentation and codebases. Prevents hallucination.",
    skills: ["RAG retrieval", "Documentation lookup", "Context grounding"],
    services: [
      { name: "Context Lookup", price: 3, description: "Retrieve grounded context from internal docs and PR history.", tier: "validation" },
      { name: "Full Codebase Search", price: 10, description: "Deep semantic search across your full codebase.", tier: "validation" },
    ],
  },
  {
    id: "contentbot",
    name: "ContentBot",
    ens: "contentbot.agent.eth",
    address: "0x4444444444444444444444444444444444444444",
    chainId: 84532,
    type: "specialist",
    isQuantumSafe: false,
    bio: "Content generation agent. WARNING: not quantum-safe — uses ECDSA only.",
    skills: ["Content generation", "Copywriting"],
    services: [
      { name: "Blog Post", price: 4, description: "Generate a blog post on any topic.", tier: "special" },
    ],
  },
];

function getMarketplaceUrl(): string {
  return (process.env.MARKETPLACE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Enforce the $20 spending policy at the MCP layer — before any network call. */
function checkSpendingPolicy(amountUsd: number, agentId: string, serviceName: string): void {
  if (amountUsd > SPENDING_LIMIT_USD) {
    throw new Error(
      JSON.stringify({
        blocked: true,
        reason: "spending_limit_exceeded",
        policy: `OFFLINE SPENDING POLICY: autonomous signing is capped at $${SPENDING_LIMIT_USD} USDC. ` +
          `This transaction ($${amountUsd}) exceeds the limit and MUST be approved by a human via Ledger hardware wallet.`,
        amount: amountUsd,
        agentId,
        service: serviceName,
        ledger_instructions: [
          "1. Connect your Ledger and unlock the Ethereum app",
          `2. Run: just send-tx-ledger to=<agent_address> amount=${amountUsd} service="${serviceName}"`,
          "3. Review the transaction details carefully on your Ledger screen",
          "4. Approve on the device — the ERC-4337 UserOperation will be submitted after hardware confirmation",
        ],
      })
    );
  }
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: "pq-mcp-server", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "pq_validate_seed",
      description: "Validate a 32-byte hex seed string (must be 0x-prefixed, 66 chars).",
      inputSchema: {
        type: "object",
        properties: {
          seed: { type: "string", description: "The seed to validate (e.g. 0xabc...)" },
          name: { type: "string", description: "Label for error messages (e.g. 'AGENT_PRIVATE_KEY')" },
        },
        required: ["seed"],
      },
    },
    {
      name: "pq_get_public_keys",
      description: "Derive ECDSA address (pre-quantum) and ML-DSA-44 expanded public key (post-quantum) from their respective seeds.",
      inputSchema: {
        type: "object",
        properties: {
          preQuantumSeed: { type: "string", description: "ECDSA private key (0x-prefixed 32 bytes)" },
          postQuantumSeed: { type: "string", description: "ML-DSA-44 seed (0x-prefixed 32 bytes)" },
        },
        required: ["preQuantumSeed", "postQuantumSeed"],
      },
    },
    {
      name: "pq_get_account_address",
      description: "Predict the ERC-4337 smart account address for a given key pair without deploying anything.",
      inputSchema: {
        type: "object",
        properties: {
          preQuantumSeed: { type: "string", description: "ECDSA private key (0x-prefixed 32 bytes)" },
          postQuantumSeed: { type: "string", description: "ML-DSA-44 seed (0x-prefixed 32 bytes)" },
          factoryAddress: { type: "string", description: "ZKNOX account factory address (overrides PQ_FACTORY_ADDRESS env)" },
          network: { type: "string", description: "Network key (ethereum|base|sepolia|baseSepolia|polygon|bnb|localhost). Default: baseSepolia" },
          rpcUrl: { type: "string", description: "JSON-RPC URL override" },
        },
        required: ["preQuantumSeed", "postQuantumSeed"],
      },
    },
    {
      name: "pq_create_account",
      description: "Deploy a hybrid post-quantum ERC-4337 smart account using ML-DSA-44 + ECDSA keys. The deployer wallet pays the gas.",
      inputSchema: {
        type: "object",
        properties: {
          preQuantumSeed: { type: "string", description: "ECDSA private key for the account (0x-prefixed 32 bytes)" },
          postQuantumSeed: { type: "string", description: "ML-DSA-44 seed for the account (0x-prefixed 32 bytes)" },
          deployerPrivateKey: { type: "string", description: "Private key of the deployer wallet that pays gas (0x-prefixed). Defaults to AGENT_PRIVATE_KEY env." },
          factoryAddress: { type: "string", description: "ZKNOX account factory address. Defaults to PQ_FACTORY_ADDRESS env." },
          network: { type: "string", description: "Network key. Default: baseSepolia" },
          rpcUrl: { type: "string", description: "JSON-RPC URL override" },
        },
        required: ["preQuantumSeed", "postQuantumSeed"],
      },
    },
    {
      name: "pq_send_transaction",
      description: "Send an ERC-4337 user operation from a deployed PQ smart account with a hybrid ML-DSA-44 + ECDSA signature.",
      inputSchema: {
        type: "object",
        properties: {
          accountAddress: { type: "string", description: "The deployed smart account address (0x-prefixed)" },
          targetAddress: { type: "string", description: "Recipient address (0x-prefixed)" },
          valueEth: { type: "string", description: "Amount to send in ETH (e.g. '0.01'). Default '0'" },
          callData: { type: "string", description: "Hex-encoded call data (use '0x' for plain ETH transfer)" },
          preQuantumSeed: { type: "string", description: "ECDSA private key (0x-prefixed 32 bytes). Defaults to AGENT_PRIVATE_KEY env." },
          postQuantumSeed: { type: "string", description: "ML-DSA-44 seed (0x-prefixed 32 bytes). Defaults to POST_QUANTUM_SEED env." },
          bundlerUrl: { type: "string", description: "ERC-4337 bundler URL. Defaults to BUNDLER_URL env." },
          network: { type: "string", description: "Network key. Default: baseSepolia" },
          rpcUrl: { type: "string", description: "JSON-RPC URL override" },
        },
        required: ["accountAddress", "targetAddress"],
      },
    },
    {
      name: "list_networks",
      description: "List all supported networks with their chain IDs, RPC URLs, and block explorer URLs.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "resolve_signing_keys",
      description: "Fetch AGENT_PRIVATE_KEY and POST_QUANTUM_SEED — first from environment variables, then from the 1claw vault if configured.",
      inputSchema: { type: "object", properties: {} },
    },
    // ── Marketplace tools ───────────────────────────────────────────────────
    {
      name: "marketplace_list_agents",
      description: "List all agents in the marketplace with their services, prices, skills, and quantum-safety status.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "marketplace_chat_agent",
      description: "Send a message to a marketplace agent and get a response. Requires the marketplace to be running.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", enum: ["consensus", "specialist", "librarian"], description: "Agent ID to chat with" },
          message: { type: "string", description: "Your message to the agent" },
        },
        required: ["agentId", "message"],
      },
    },
    {
      name: "marketplace_buy_service",
      description: `Purchase a service from a marketplace agent. SPENDING POLICY: transactions up to $${SPENDING_LIMIT_USD} are signed automatically. Above $${SPENDING_LIMIT_USD} the call is BLOCKED and the user must approve via Ledger hardware wallet.`,
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Agent ID (e.g. consensus, specialist, librarian)" },
          serviceName: { type: "string", description: "Name of the service to buy (e.g. 'Consensus Query')" },
          amount: { type: "number", description: "Amount in USD to pay" },
          toAddress: { type: "string", description: "Agent wallet address to pay (0x-prefixed). If omitted, looked up from agent list." },
        },
        required: ["agentId", "serviceName", "amount"],
      },
    },
    {
      name: "marketplace_get_balances",
      description: "Get native ETH and USDC token balances for a wallet address. Requires the marketplace to be running.",
      inputSchema: {
        type: "object",
        properties: {
          address: { type: "string", description: "Wallet address to check (0x-prefixed)" },
          chainId: { type: "number", description: "Chain ID (default: 84532 for Base Sepolia)" },
        },
        required: ["address"],
      },
    },
    {
      name: "marketplace_verify_agent",
      description: "Verify if an agent address is quantum-safe (deployed via ZKNOX PQ factory) and World ID verified. Requires the marketplace to be running.",
      inputSchema: {
        type: "object",
        properties: {
          address: { type: "string", description: "Agent wallet address (0x-prefixed)" },
          chainId: { type: "number", description: "Chain ID (default: 84532 for Base Sepolia)" },
        },
        required: ["address"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const a = args as Record<string, string>;

  try {
    switch (name) {
      // ── pq_validate_seed ──────────────────────────────────────────────────
      case "pq_validate_seed": {
        validateSeed(a.seed, a.name || "seed");
        return { content: [{ type: "text", text: JSON.stringify({ valid: true, seed: a.seed }) }] };
      }

      // ── pq_get_public_keys ────────────────────────────────────────────────
      case "pq_get_public_keys": {
        validateSeed(a.preQuantumSeed, "preQuantumSeed");
        validateSeed(a.postQuantumSeed, "postQuantumSeed");
        const keys = getPublicKeys(a.preQuantumSeed, a.postQuantumSeed);
        return { content: [{ type: "text", text: JSON.stringify(keys) }] };
      }

      // ── pq_get_account_address ────────────────────────────────────────────
      case "pq_get_account_address": {
        validateSeed(a.preQuantumSeed, "preQuantumSeed");
        validateSeed(a.postQuantumSeed, "postQuantumSeed");
        const factoryAddr = a.factoryAddress || process.env.PQ_FACTORY_ADDRESS || "";
        if (!factoryAddr) throw new Error("factoryAddress is required (or set PQ_FACTORY_ADDRESS env)");

        const rpcUrl = a.rpcUrl || getRpcUrl(a.network);
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const { preQuantumPubKey, postQuantumPubKey } = getPublicKeys(a.preQuantumSeed, a.postQuantumSeed);

        const iface = new ethers.Interface(ACCOUNT_FACTORY_ABI);
        const callData = iface.encodeFunctionData("getAddress", [preQuantumPubKey, postQuantumPubKey]);
        const result = await provider.call({ to: factoryAddr, data: callData });
        const [address] = iface.decodeFunctionResult("getAddress", result);

        const code = await provider.getCode(address);
        return { content: [{ type: "text", text: JSON.stringify({ address, deployed: code !== "0x" }) }] };
      }

      // ── pq_create_account ─────────────────────────────────────────────────
      case "pq_create_account": {
        validateSeed(a.preQuantumSeed, "preQuantumSeed");
        validateSeed(a.postQuantumSeed, "postQuantumSeed");
        const factoryAddr = a.factoryAddress || process.env.PQ_FACTORY_ADDRESS || "";
        if (!factoryAddr) throw new Error("factoryAddress is required (or set PQ_FACTORY_ADDRESS env)");

        const deployerKey = a.deployerPrivateKey || process.env.AGENT_PRIVATE_KEY || "";
        if (!deployerKey) throw new Error("deployerPrivateKey is required (or set AGENT_PRIVATE_KEY env)");

        const rpcUrl = a.rpcUrl || getRpcUrl(a.network);
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const signer = new ethers.Wallet(deployerKey, provider);
        const { preQuantumPubKey, postQuantumPubKey } = getPublicKeys(a.preQuantumSeed, a.postQuantumSeed);

        const logs: string[] = [];
        const log = (msg: string) => logs.push(msg);

        log("Connecting to wallet...");
        const address = await signer.getAddress();
        const balance = await provider.getBalance(address);
        const network = await provider.getNetwork();
        log(`Wallet: ${address} | Balance: ${ethers.formatEther(balance)} ETH | Chain: ${network.chainId}`);

        const factoryCode = await provider.getCode(factoryAddr);
        if (factoryCode === "0x") throw new Error("No contract at factory address: " + factoryAddr);

        const iface = new ethers.Interface(ACCOUNT_FACTORY_ABI);
        const getAddrData = iface.encodeFunctionData("getAddress", [preQuantumPubKey, postQuantumPubKey]);
        const getAddrResult = await provider.call({ to: factoryAddr, data: getAddrData });
        const [expectedAddress] = iface.decodeFunctionResult("getAddress", getAddrResult);
        log(`Expected account: ${expectedAddress}`);

        const code = await provider.getCode(expectedAddress);
        if (code !== "0x") {
          return { content: [{ type: "text", text: JSON.stringify({ success: true, address: expectedAddress, alreadyExists: true, logs }) }] };
        }

        const factory = new ethers.Contract(factoryAddr, ACCOUNT_FACTORY_ABI, signer);
        let estimatedGas: bigint;
        try { estimatedGas = await factory.createAccount.estimateGas(preQuantumPubKey, postQuantumPubKey); }
        catch { estimatedGas = 5_000_000n; log("Gas estimation failed, using fallback: 5000000"); }

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
        log(`Estimated gas: ${estimatedGas} @ ${ethers.formatUnits(gasPrice, "gwei")} gwei`);

        const tx = await factory.createAccount(preQuantumPubKey, postQuantumPubKey, { gasLimit: (estimatedGas * 120n) / 100n });
        log(`Tx submitted: ${tx.hash}`);

        let receipt = null;
        for (let i = 0; !receipt && i < 60; i++) {
          try { receipt = await provider.getTransactionReceipt(tx.hash); }
          catch { /* retry */ }
          if (!receipt) await new Promise((r) => setTimeout(r, 5000));
        }

        if (!receipt) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Transaction timeout", transactionHash: tx.hash, logs }) }] };
        if (receipt.status === 0) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Transaction reverted", transactionHash: tx.hash, logs }) }] };

        const actualCost = receipt.gasUsed * (receipt.gasPrice ?? 0n);
        log(`Deployed! Gas used: ${receipt.gasUsed} | Cost: ${ethers.formatEther(actualCost)} ETH`);

        return { content: [{ type: "text", text: JSON.stringify({ success: true, address: expectedAddress, transactionHash: tx.hash, gasUsed: receipt.gasUsed.toString(), actualCost: ethers.formatEther(actualCost), logs }) }] };
      }

      // ── pq_send_transaction ───────────────────────────────────────────────
      case "pq_send_transaction": {
        const preQuantumSeed = a.preQuantumSeed || process.env.AGENT_PRIVATE_KEY || "";
        const postQuantumSeed = a.postQuantumSeed || process.env.POST_QUANTUM_SEED || "";
        if (!preQuantumSeed) throw new Error("preQuantumSeed is required (or set AGENT_PRIVATE_KEY env)");
        if (!postQuantumSeed) throw new Error("postQuantumSeed is required (or set POST_QUANTUM_SEED env)");
        validateSeed(preQuantumSeed, "preQuantumSeed");
        validateSeed(postQuantumSeed, "postQuantumSeed");

        if (!ethers.isAddress(a.accountAddress)) throw new Error("Invalid accountAddress: " + a.accountAddress);
        if (!ethers.isAddress(a.targetAddress)) throw new Error("Invalid targetAddress: " + a.targetAddress);

        const bundlerUrl = a.bundlerUrl || process.env.BUNDLER_URL || "";
        if (!bundlerUrl) throw new Error("bundlerUrl is required (or set BUNDLER_URL env)");

        const rpcUrl = a.rpcUrl || getRpcUrl(a.network);
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const network = await provider.getNetwork();
        const value = ethers.parseEther(a.valueEth || "0");
        const callData = a.callData || "0x";

        const logs: string[] = [];
        logs.push(`From: ${a.accountAddress} | To: ${a.targetAddress} | Value: ${a.valueEth || "0"} ETH`);

        const { secretKey } = ml_dsa44.keygen(hexToU8(postQuantumSeed, 32));

        let userOp = await buildUserOp(a.accountAddress, a.targetAddress, value, callData, provider, bundlerUrl);
        userOp.signature = getDummySignature();

        const gasEst = await estimateGas(userOp, bundlerUrl);
        userOp = { ...userOp, accountGasLimits: packUint128(gasEst.verificationGasLimit, gasEst.callGasLimit), preVerificationGas: gasEst.preVerificationGas };
        userOp.signature = await signUserOpHybrid(userOp, network.chainId, preQuantumSeed, secretKey);

        logs.push("Submitting to bundler...");
        const res = await fetch(bundlerUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendUserOperation", params: [userOpToBundlerFormat(userOp), ENTRY_POINT_ADDRESS] }) });
        const json = await res.json();
        if (json.error) throw new Error("Bundler error: " + (json.error.message || "Unknown"));

        logs.push(`Submitted! userOpHash: ${json.result}`);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, userOpHash: json.result, logs }) }] };
      }

      // ── list_networks ─────────────────────────────────────────────────────
      case "list_networks": {
        return { content: [{ type: "text", text: JSON.stringify(NETWORKS, null, 2) }] };
      }

      // ── resolve_signing_keys ──────────────────────────────────────────────
      case "resolve_signing_keys": {
        const result = await resolveSigningKeys();
        // Never expose the actual key values — only confirm presence and source.
        return {
          content: [{
            type: "text", text: JSON.stringify({
              source: result.source,
              hasAgentPrivateKey: result.agentPrivateKey !== null,
              hasPostQuantumSeed: result.postQuantumSeed !== null,
            }),
          }],
        };
      }

      // ── marketplace_list_agents ───────────────────────────────────────────
      case "marketplace_list_agents": {
        return { content: [{ type: "text", text: JSON.stringify(MARKETPLACE_AGENTS, null, 2) }] };
      }

      // ── marketplace_chat_agent ────────────────────────────────────────────
      case "marketplace_chat_agent": {
        const agent = MARKETPLACE_AGENTS.find((ag) => ag.id === a.agentId);
        if (!agent) throw new Error(`Agent "${a.agentId}" not found. Available: consensus, specialist, librarian`);

        const url = `${getMarketplaceUrl()}/api/agent/chat`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: a.agentId, agentName: agent.name, message: a.message }),
        });
        if (!res.ok) throw new Error(`Marketplace returned ${res.status}: ${await res.text()}`);
        const data = await res.json() as { reply: string; agent: string };
        return { content: [{ type: "text", text: JSON.stringify({ agent: data.agent, reply: data.reply }) }] };
      }

      // ── marketplace_buy_service ───────────────────────────────────────────
      case "marketplace_buy_service": {
        const amount = Number((args as Record<string, unknown>).amount);
        if (isNaN(amount) || amount <= 0) throw new Error("amount must be a positive number");

        // ── SPENDING POLICY (enforced offline, before any network call) ──
        checkSpendingPolicy(amount, a.agentId, a.serviceName);

        const agent = MARKETPLACE_AGENTS.find((ag) => ag.id === a.agentId);
        if (!agent) throw new Error(`Agent "${a.agentId}" not found`);
        const toAddress = a.toAddress || agent.address;

        const url = `${getMarketplaceUrl()}/api/agent/buy`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: a.agentId, service: a.serviceName, amount, to: toAddress }),
        });

        if (res.status === 402) {
          // Marketplace also enforces the limit — surface the instructions
          const data = await res.json() as { policy: string; instructions: string[] };
          throw new Error(JSON.stringify({ blocked: true, policy: data.policy, ledger_instructions: data.instructions }));
        }
        if (!res.ok) throw new Error(`Marketplace returned ${res.status}: ${await res.text()}`);

        const data = await res.json() as { txHash: string; simulated?: boolean; logs?: string[] };
        return {
          content: [{
            type: "text", text: JSON.stringify({
              success: true,
              txHash: data.txHash,
              simulated: data.simulated ?? false,
              amount,
              agent: agent.name,
              service: a.serviceName,
              logs: data.logs,
            }),
          }],
        };
      }

      // ── marketplace_get_balances ──────────────────────────────────────────
      case "marketplace_get_balances": {
        const chainId = Number((args as Record<string, unknown>).chainId) || 84532;
        const url = `${getMarketplaceUrl()}/api/balances`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: a.address, chainId }),
        });
        if (!res.ok) throw new Error(`Marketplace returned ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      }

      // ── marketplace_verify_agent ──────────────────────────────────────────
      case "marketplace_verify_agent": {
        const chainId = Number((args as Record<string, unknown>).chainId) || 84532;
        const url = `${getMarketplaceUrl()}/api/verify-agent?address=${a.address}&chainId=${chainId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Marketplace returned ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: JSON.stringify({ error: msg }) }], isError: true };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("PQ MCP Server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write("Fatal: " + err.message + "\n");
  process.exit(1);
});
