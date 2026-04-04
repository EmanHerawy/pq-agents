import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const AGENTS_ROOT = path.resolve(process.cwd(), "../../my_agents");

export async function POST(req: NextRequest) {
  let body: { agentId: string; service: string; amount: number; to: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { to, amount } = body;

  if (!to || !amount) {
    return NextResponse.json({ error: "Missing to or amount" }, { status: 400 });
  }

  // Basic address validation
  if (!/^0x[0-9a-fA-F]{4,40}/.test(to)) {
    return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
  }

  if (typeof amount !== "number" || amount <= 0 || amount > 10000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  try {
    // Call send-pq-transaction.mjs via with-secrets.mjs
    const { stdout } = await execFileAsync(
      "node",
      [
        "scripts/with-secrets.mjs",
        "--",
        "node",
        "scripts/send-pq-transaction.mjs",
        to,
        String(amount),
      ],
      {
        cwd: AGENTS_ROOT,
        timeout: 120_000,
        env: { ...process.env },
      }
    );

    // Extract tx hash from output
    const txHashMatch = stdout.match(/Tx:\s*(0x[0-9a-fA-F]{64})/i)
      || stdout.match(/userOpHash:\s*(0x[0-9a-fA-F]{64})/i);

    const txHash = txHashMatch?.[1] ?? "pending";

    return NextResponse.json({ success: true, txHash });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/agent/buy] send-pq failed:", msg);
    return NextResponse.json(
      { error: msg.slice(0, 300) },
      { status: 500 }
    );
  }
}
