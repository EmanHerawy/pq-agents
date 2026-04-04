import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
import { getActiveNetwork, viemChainForNetwork } from "@/lib/networks";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const addr = body?.address;
    const chainId = Number(body?.chainId);
    if (typeof addr !== "string" || !/^0x[a-fA-F0-9]{40}$/i.test(addr)) {
      return Response.json({ error: "Invalid address" }, { status: 400 });
    }
    const net = getActiveNetwork();
    const chain = viemChainForNetwork(net);
    const client = createPublicClient({ chain, transport: http(net.rpcUrl) });

    const wei = await client.getBalance({ address: addr as `0x${string}` });
    const nativeFormatted = formatUnits(wei, net.nativeCurrency.decimals);

    const contracts = net.tokens.map((t) => ({
      address: t.address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [addr as `0x${string}`],
    }));

    const tokens: { symbol: string; balance: string; decimals: number; address: string }[] = [];
    if (contracts.length) {
      const results = await client.multicall({ contracts, allowFailure: true });
      results.forEach((r, i) => {
        const t = net.tokens[i];
        tokens.push({
          symbol: t.symbol,
          balance: r.status === "success" ? formatUnits(r.result as bigint, t.decimals) : "0",
          decimals: t.decimals,
          address: t.address,
        });
      });
    }

    return Response.json({
      native: { symbol: net.nativeCurrency.symbol, balance: nativeFormatted, decimals: net.nativeCurrency.decimals },
      tokens,
      chainId: net.chainId,
      network: net.name,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/balances]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
