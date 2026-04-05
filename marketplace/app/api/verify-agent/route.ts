import { NextRequest, NextResponse } from "next/server";

// EntryPoint v0.7 — canonical across all EVM chains
const ENTRY_POINT_V07 = "0x0000000071727de22e5e9d8baf0edac6f37da032";

// Known ZKNOX PQ factory addresses — if code exists at these, the chain supports PQ accounts
const PQ_FACTORIES: Record<number, string> = {
  5042002: "0xE6388d202979da19fC5Db7cC87e925228951fB36", // ARC Testnet
  84532:   "0xE6388d202979da19fC5Db7cC87e925228951fB36", // Base Sepolia
  11155111:"0xE6388d202979da19fC5Db7cC87e925228951fB36", // Sepolia
};

// AgentBook deployments for World ID check
const AGENT_BOOK_DEPLOYMENTS = [
  { label: "World Chain",  rpc: "https://worldchain-mainnet.g.alchemy.com/public", address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA" },
  { label: "Base",         rpc: "https://mainnet.base.org",                        address: "0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4" },
  { label: "Base Sepolia", rpc: "https://sepolia.base.org",                        address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA" },
];

const RPC_URLS: Record<number, string> = {
  480:     "https://worldchain-mainnet.g.alchemy.com/public",
  8453:    "https://mainnet.base.org",
  84532:   "https://sepolia.base.org",
  11155111:"https://rpc.sepolia.org",
  5042002: "https://rpc.testnet.arc.network",
  421614:  "https://sepolia-rollup.arbitrum.io/rpc",
};

/** Raw eth_call — works on any EVM chain without viem chain config */
async function ethCall(rpcUrl: string, to: string, data: string): Promise<string | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    const json = await res.json() as { result?: string; error?: unknown };
    if (json.error || !json.result || json.result === "0x") return null;
    return json.result;
  } catch { return null; }
}

/** eth_getCode — check if address has deployed bytecode */
async function getCode(rpcUrl: string, address: string): Promise<boolean> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
    });
    const json = await res.json() as { result?: string };
    return !!json.result && json.result !== "0x" && json.result.length > 2;
  } catch { return false; }
}

/** Decode a 32-byte ABI-encoded address to checksummed 0x... */
function decodeAddress(hex: string): string {
  // Result is 0x + 64 hex chars (32 bytes), address is last 20 bytes (40 chars)
  const raw = hex.replace(/^0x/, "").toLowerCase();
  return "0x" + raw.slice(-40);
}

/** lookupHuman(address) — AgentBook ABI selector */
const LOOKUP_HUMAN_SELECTOR = "0x" + Buffer.from("lookupHuman(address)").reduce((acc, b, i, arr) => {
  // keccak4 of "lookupHuman(address)" = 0x7a2b...
  // Pre-computed: 0x7a2b6acd
  return acc;
}, "");
const LOOKUP_HUMAN = "0x7a2b6acd";

const ZERO_BYTES32 = "0".repeat(64);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address")?.trim().toLowerCase();
  const chainIdStr = searchParams.get("chainId");

  if (!address || !chainIdStr) {
    return NextResponse.json({ error: "address and chainId required" }, { status: 400 });
  }

  const chainId = Number(chainIdStr);
  const rpcUrl = RPC_URLS[chainId];
  if (!rpcUrl) {
    return NextResponse.json({ error: `Unsupported chainId: ${chainId}` }, { status: 400 });
  }

  // ── 1. Is it a deployed contract? ──────────────────────────────────────────
  const isContract = await getCode(rpcUrl, address);

  // ── 2. Is it quantum-safe? ─────────────────────────────────────────────────
  //   Method A: call entryPoint() — selector 0xb0d691fe
  //   Method B: check if the ZKNOX factory on this chain deployed it (factory.getAddress)
  let isQuantumSafe = false;

  if (isContract) {
    // Method A: entryPoint() → must equal EntryPoint v0.7
    const epResult = await ethCall(rpcUrl, address, "0xb0d691fe");
    if (epResult && epResult.length >= 66) {
      const decoded = decodeAddress(epResult);
      isQuantumSafe = decoded === ENTRY_POINT_V07;
    }

    // Method B fallback: if entryPoint() not available, check factory getAddress match
    if (!isQuantumSafe) {
      const factory = PQ_FACTORIES[chainId];
      if (factory) {
        // encode getAddress(bytes, bytes) — if address matches any known PQ account, it's safe
        // Simpler: just check if factory exists on this chain (proves PQ infra is deployed)
        const factoryExists = await getCode(rpcUrl, factory);
        if (factoryExists) {
          // Last resort: trust that user-provided address is a ZKNOX account if factory exists
          // and contract is deployed — only mark safe if entryPoint matched OR address
          // was explicitly deployed via our factory (we can't verify that without event logs here)
          // so we leave isQuantumSafe = false unless Method A succeeded
        }
      }
    }
  }

  // ── 3. World ID check (non-blocking) ───────────────────────────────────────
  let isHumanBacked = false;
  let humanFoundOn: string | null = null;

  // Encode lookupHuman(address): selector + left-padded address
  const paddedAddr = address.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const calldata = LOOKUP_HUMAN + paddedAddr;

  const checks = await Promise.allSettled(
    AGENT_BOOK_DEPLOYMENTS.map(async (d) => {
      const result = await ethCall(d.rpc, d.address, calldata);
      return { label: d.label, result };
    })
  );

  for (const c of checks) {
    if (c.status === "fulfilled" && c.value.result) {
      const hex = c.value.result.replace(/^0x/, "");
      if (hex && hex !== ZERO_BYTES32) {
        isHumanBacked = true;
        humanFoundOn = c.value.label;
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
    humanFoundOn,
    // eligible = quantum-safe is required; World ID is recommended but not blocking
    eligible: isQuantumSafe,
  });
}
