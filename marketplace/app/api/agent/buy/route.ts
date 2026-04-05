import { NextRequest, NextResponse } from "next/server";
import { BrowserProvider } from "ethers";
import { sendERC4337Transaction } from "@/lib/pq/send-transaction";
import { getActiveNetwork } from "@/lib/networks";
import { resolveSigningKeys } from "@/lib/oneclaw-vault";

/**
 * POST /api/agent/buy
 *
 * Sends an ERC-4337 post-quantum transaction to pay an agent.
 * Keys are resolved via lib/oneclaw-vault.ts:
 *   1. Plain env vars (AGENT_PRIVATE_KEY, POST_QUANTUM_SEED) — fastest
 *   2. 1claw vault via SDK (private-keys/agent, private-keys/post-quantum-seed)
 *   3. Simulation mode if neither available
 */
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

  // ── Spending policy: amounts > $20 require hardware wallet approval ──────────
  const SPENDING_LIMIT_USD = 20;
  if (amount > SPENDING_LIMIT_USD) {
    return NextResponse.json(
      {
        requiresLedger: true,
        amount,
        to,
        policy: `Agent spending policy: autonomous signing is capped at $${SPENDING_LIMIT_USD} USDC. ` +
          `Transactions above this limit must be approved via Ledger hardware wallet.`,
        instructions: [
          `1. Connect your Ledger and unlock the Ethereum app`,
          `2. Run: just send-tx-ledger to=${to} amount=${amount} service="${body.service}"`,
          `3. Review and approve the transaction on your Ledger device`,
          `4. The ERC-4337 UserOperation will be submitted after hardware confirmation`,
        ],
      },
      { status: 402 },
    );
  }

  // Resolve signing keys via 1claw vault (or env fallback)
  const { agentPrivateKey, postQuantumSeed: pqSeed, source } = await resolveSigningKeys();
  const preQuantumSeed = agentPrivateKey || "";
  const postQuantumSeed = pqSeed || "";
  const bundlerUrl = process.env.NEXT_PUBLIC_BUNDLER_URL || "";
  // PQ_ACCOUNT_ADDRESS is the deployed ERC-4337 smart account (AA20 requires this, not the raw ECDSA key)
  const accountAddress = process.env.PQ_ACCOUNT_ADDRESS || process.env.AGENT_ADDRESS || "";
  console.log("[api/agent/buy] key source:", source);

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
