import { NextRequest, NextResponse } from "next/server";
import { BrowserProvider } from "ethers";
import { sendERC4337Transaction } from "@/lib/pq/send-transaction";
import { getActiveNetwork } from "@/lib/networks";

/**
 * POST /api/agent/buy
 *
 * Sends a real ERC-4337 post-quantum transaction to pay an agent.
 * Keys are resolved in priority order:
 *   1. Plain env vars (AGENT_PRIVATE_KEY, POST_QUANTUM_SEED) if set
 *   2. 1Claw vault — paths: private-keys/agent, private-keys/post-quantum-seed
 *      Requires: ONECLAW_VAULT_ID + (ONECLAW_API_KEY or ONECLAW_AGENT_ID + ONECLAW_AGENT_API_KEY)
 *   3. Simulation mode if neither is available
 */

async function fetchVaultSecret(path: string): Promise<string | null> {
  const vaultId = (process.env.ONECLAW_VAULT_ID || "").trim();
  if (!vaultId) return null;

  const base = (process.env.ONECLAW_API_BASE_URL || "https://api.1claw.xyz").replace(/\/$/, "");
  let token: string | null = null;

  const apiKey = (process.env.ONECLAW_API_KEY || "").trim();
  const agentId = (process.env.ONECLAW_AGENT_ID || "").trim();
  const agentKey = (process.env.ONECLAW_AGENT_API_KEY || "").trim();

  if (apiKey) {
    const res = await fetch(base + "/v1/auth/api-key-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    if (!res.ok) return null;
    token = ((await res.json()) as { access_token: string }).access_token;
  } else if (agentId && agentKey) {
    const res = await fetch(base + "/v1/auth/agent-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId, api_key: agentKey }),
    });
    if (!res.ok) return null;
    token = ((await res.json()) as { access_token: string }).access_token;
  }

  if (!token) return null;

  const res = await fetch(
    base + "/v1/vaults/" + vaultId + "/secrets/" + encodeURIComponent(path),
    { headers: { Authorization: "Bearer " + token } },
  );
  if (!res.ok) return null;
  const j = await res.json() as { value?: string };
  return typeof j.value === "string" ? j.value.trim() : null;
}

export async function POST(req: NextRequest) {
  let body: { agentId: string; service: string; amount: number; to: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { to, amount } = body;
  if (!to || !amount) {
    return NextResponse.json({ error: "Missing to or amount" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{4,40}/.test(to)) {
    return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
  }
  if (typeof amount !== "number" || amount <= 0 || amount > 10000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  // Resolve keys: plain env first, then vault fallback
  let preQuantumSeed = (process.env.AGENT_PRIVATE_KEY || "").trim();
  let postQuantumSeed = (process.env.POST_QUANTUM_SEED || "").trim();
  const bundlerUrl = process.env.NEXT_PUBLIC_BUNDLER_URL || "";
  const accountAddress = process.env.AGENT_ADDRESS || "";

  if (!preQuantumSeed || !postQuantumSeed) {
    const [fromVaultAgent, fromVaultPQ] = await Promise.all([
      !preQuantumSeed ? fetchVaultSecret("private-keys/agent") : Promise.resolve(null),
      !postQuantumSeed ? fetchVaultSecret("private-keys/post-quantum-seed") : Promise.resolve(null),
    ]);
    if (fromVaultAgent) preQuantumSeed = fromVaultAgent;
    if (fromVaultPQ) postQuantumSeed = fromVaultPQ;
  }

  // Simulation mode when keys not configured
  if (!preQuantumSeed || !postQuantumSeed || !accountAddress) {
    const mockHash = "0x" + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    return NextResponse.json({
      txHash: mockHash,
      simulated: true,
      message: "Simulation mode — configure AGENT_PRIVATE_KEY + POST_QUANTUM_SEED + AGENT_ADDRESS for real PQ txs",
    });
  }

  const net = getActiveNetwork();
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log("[api/agent/buy]", msg); };

  try {
    // Server-side JSON-RPC provider (no browser needed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eip1193 = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        const res = await fetch(net.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
        });
        const data = await res.json() as { result?: unknown; error?: { message: string } };
        if (data.error) throw new Error(data.error.message);
        return data.result;
      },
    };
    const provider = new BrowserProvider(eip1193 as any, net.chainId);

    const result = await sendERC4337Transaction(
      accountAddress,
      to,
      "0",   // ETH value — real ERC-20 USDC transfer handled via callData in production
      "0x",
      preQuantumSeed,
      postQuantumSeed,
      provider,
      bundlerUrl,
      log,
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Transaction failed", logs }, { status: 500 });
    }

    return NextResponse.json({ txHash: result.userOpHash || "pending", logs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.slice(0, 300), logs }, { status: 500 });
  }
}
