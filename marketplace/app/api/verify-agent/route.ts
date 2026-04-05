import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";

// EntryPoint v0.7 — same on all EVM chains
const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

// All AgentBook deployments — we check ALL of them for any match
const AGENT_BOOK_DEPLOYMENTS: { rpc: string; address: string; label: string }[] = [
  {
    label: "World Chain",
    rpc: "https://worldchain-mainnet.g.alchemy.com/public",
    address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA",
  },
  {
    label: "Base",
    rpc: "https://mainnet.base.org",
    address: "0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4",
  },
  {
    label: "Base Sepolia",
    rpc: "https://sepolia.base.org",
    address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA",
  },
];

// AgentBook ABI (lookupHuman)
const AGENT_BOOK_ABI = [
  {
    name: "lookupHuman",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentAddress", type: "address" }],
    outputs: [{ name: "humanId", type: "bytes32" }],
  },
] as const;

// Minimal ERC-4337 BaseAccount ABI
const BASE_ACCOUNT_ABI = [
  {
    name: "entryPoint",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const RPC_URLS: Record<number, string> = {
  480:     "https://worldchain-mainnet.g.alchemy.com/public",
  8453:    "https://mainnet.base.org",
  84532:   "https://sepolia.base.org",
  11155111:"https://rpc.sepolia.org",
  5042002: "https://rpc.testnet.arc.network",
  421614:  "https://sepolia-rollup.arbitrum.io/rpc",
};

function caip2ChainId(chainId: number): string {
  return `eip155:${chainId}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address")?.trim();
  const chainIdStr = searchParams.get("chainId");

  if (!address || !chainIdStr) {
    return NextResponse.json({ error: "address and chainId required" }, { status: 400 });
  }

  const chainId = Number(chainIdStr);
  const rpcUrl = RPC_URLS[chainId];
  if (!rpcUrl) {
    return NextResponse.json({ error: `Unsupported chainId: ${chainId}` }, { status: 400 });
  }

  const client = createPublicClient({ transport: http(rpcUrl) });
  const caip2 = caip2ChainId(chainId);

  // ── 1. Is it a smart contract? ───────────────────────────────────────────────
  const code = await client.getCode({ address: address as `0x${string}` });
  const isContract = code !== undefined && code !== "0x";

  // ── 2. Is it quantum-safe? (ERC-4337 account with EntryPoint v0.7) ───────────
  let isQuantumSafe = false;
  if (isContract) {
    try {
      const ep = await client.readContract({
        address: address as `0x${string}`,
        abi: BASE_ACCOUNT_ABI,
        functionName: "entryPoint",
      });
      isQuantumSafe = ep.toLowerCase() === ENTRY_POINT_V07.toLowerCase();
    } catch {
      isQuantumSafe = false;
    }
  }

  // ── 3. Is it human-backed? (check ALL AgentBook deployments) ────────────────
  let isHumanBacked = false;
  let humanId: string | null = null;
  let humanFoundOn: string | null = null;

  const ZERO_BYTES32 = "0x" + "0".repeat(64);

  const agentBookChecks = await Promise.allSettled(
    AGENT_BOOK_DEPLOYMENTS.map(async (deployment) => {
      const c = createPublicClient({ transport: http(deployment.rpc) });
      const result = await c.readContract({
        address: deployment.address as `0x${string}`,
        abi: AGENT_BOOK_ABI,
        functionName: "lookupHuman",
        args: [address as `0x${string}`],
      });
      return { deployment, result: result as `0x${string}` };
    })
  );

  for (const check of agentBookChecks) {
    if (check.status === "fulfilled") {
      const { deployment, result } = check.value;
      if (result && result !== ZERO_BYTES32) {
        isHumanBacked = true;
        humanId = result;
        humanFoundOn = deployment.label;
        break;
      }
    }
  }

  return NextResponse.json({
    address,
    chainId,
    isContract,
    isQuantumSafe,
    isHumanBacked,
    humanId,
    humanFoundOn,
    eligible: isQuantumSafe && isHumanBacked,
  });
}
