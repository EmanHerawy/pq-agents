import { NextRequest, NextResponse } from "next/server";
import { getActiveNetwork } from "@/lib/networks";

/**
 * POST /api/agent/submit-signed
 *
 * Accepts a fully signed ERC-4337 UserOperation (signed client-side by Ledger)
 * and submits it to the bundler. The client builds + signs the UserOp in the
 * browser using WebHID; this route just proxies it to Pimlico.
 */
export async function POST(req: NextRequest) {
  let body: { userOp: Record<string, string>; entryPoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userOp } = body;
  if (!userOp?.sender || !userOp?.signature) {
    return NextResponse.json({ error: "Missing userOp fields" }, { status: 400 });
  }

  const bundlerUrl = process.env.NEXT_PUBLIC_BUNDLER_URL || "";
  if (!bundlerUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_BUNDLER_URL not configured" }, { status: 500 });
  }

  const entryPoint = body.entryPoint ?? "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

  try {
    const res = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [userOp, entryPoint],
      }),
    });

    const data = await res.json() as { result?: string; error?: { message: string } };
    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 });
    }

    return NextResponse.json({ userOpHash: data.result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
