"use client";

import { useState } from "react";

// Supported chains for lookup
const CHAINS = [
  { id: 480,     label: "World Chain",     caip2: "eip155:480" },
  { id: 8453,    label: "Base",            caip2: "eip155:8453" },
  { id: 84532,   label: "Base Sepolia",    caip2: "eip155:84532" },
  { id: 11155111,label: "Sepolia",         caip2: "eip155:11155111" },
  { id: 5042002, label: "ARC Testnet",     caip2: "eip155:5042002" },
  { id: 421614,  label: "Arbitrum Sepolia",caip2: "eip155:421614" },
];

interface VerifyResult {
  address: string;
  chainId: number;
  isContract: boolean;
  isQuantumSafe: boolean;
  isHumanBacked: boolean;
  humanId: string | null;
  humanFoundOn: string | null;
  eligible: boolean;
}

interface FameEntry {
  address: string;
  chain: string;
  humanId: string;
  addedAt: string;
  name?: string;
}

// Seed entries for demo
const SEED_ENTRIES: FameEntry[] = [
  {
    address: "0x5E500CB7B0fAF175aC2c70F5a7235abf93FF86B1",
    chain: "ARC Testnet",
    humanId: "0xabcd...1234",
    addedAt: "2026-04-04",
    name: "QuantumAgent-01",
  },
];

function CheckBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono"
      style={{
        background: ok ? "#14532d40" : "#7f1d1d40",
        border: `1px solid ${ok ? "#4ade8060" : "#f8717160"}`,
        color: ok ? "#4ade80" : "#f87171",
      }}
    >
      <span>{ok ? "✓" : "✗"}</span>
      <span>{label}</span>
    </div>
  );
}

export default function WallOfFamePage() {
  const [tab, setTab] = useState<"fame" | "register">("fame");

  // Lookup state
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(480);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fame list (persisted in memory for demo)
  const [fameList, setFameList] = useState<FameEntry[]>(SEED_ENTRIES);
  const [added, setAdded] = useState(false);

  async function handleVerify() {
    const trimmed = address.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setAdded(false);
    try {
      const res = await fetch(`/api/verify-agent?address=${encodeURIComponent(trimmed)}&chainId=${chainId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleAddToFame() {
    if (!result?.eligible) return;
    const chain = CHAINS.find(c => c.id === result.chainId)?.label ?? String(result.chainId);
    setFameList(prev => {
      if (prev.some(e => e.address.toLowerCase() === result.address.toLowerCase())) return prev;
      return [
        {
          address: result.address,
          chain,
          humanId: result.humanId ?? "0x???",
          addedAt: new Date().toISOString().slice(0, 10),
        },
        ...prev,
      ];
    });
    setAdded(true);
  }

  const tabStyle = (t: "fame" | "register") => ({
    padding: "8px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    border: tab === t ? "1px solid #c9a84c60" : "1px solid transparent",
    background: tab === t ? "#c9a84c15" : "transparent",
    color: tab === t ? "#c9a84c" : "var(--text-3)",
    transition: "all 0.15s",
  } as React.CSSProperties);

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">

      {/* Hero */}
      <div className="mb-8">
        <p className="text-sm font-mono mb-3" style={{ color: "#c9a84c" }}>
          ✦ &nbsp; VERIFIED PQ AGENTS
        </p>
        <h1
          className="text-4xl md:text-5xl font-bold mb-3"
          style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}
        >
          Wall of Fame
        </h1>
        <p className="text-base" style={{ color: "var(--text-3)" }}>
          Human-backed agents with quantum-safe accounts, verified on-chain.
        </p>
      </div>

      {/* Stats */}
      <div
        className="rounded-xl p-5 mb-8 flex items-center gap-8"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-2)" }}
      >
        <div>
          <p className="text-3xl font-bold" style={{ color: "#c9a84c" }}>{fameList.length}</p>
          <p className="text-xs font-mono mt-1" style={{ color: "var(--text-3)" }}>VERIFIED AGENTS</p>
        </div>
        <div className="h-10 w-px" style={{ background: "var(--border-2)" }} />
        <div>
          <p className="text-3xl font-bold" style={{ color: "#4ade80" }}>2</p>
          <p className="text-xs font-mono mt-1" style={{ color: "var(--text-3)" }}>CHAINS SUPPORTED</p>
        </div>
        <div className="h-10 w-px" style={{ background: "var(--border-2)" }} />
        <div>
          <p className="text-3xl font-bold" style={{ color: "var(--text-1)" }}>100%</p>
          <p className="text-xs font-mono mt-1" style={{ color: "var(--text-3)" }}>PQ + HUMAN VERIFIED</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        <button style={tabStyle("fame")} onClick={() => setTab("fame")}>
          ✦ Wall of Fame
        </button>
        <button style={tabStyle("register")} onClick={() => setTab("register")}>
          ◈ Register Agent
        </button>
      </div>

      {/* ── Tab: Wall of Fame ─────────────────────────────────────────────────── */}
      {tab === "fame" && (
        <>
          {/* Search */}
          <div
            className="rounded-xl p-6 mb-8"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-2)" }}
          >
            <p className="text-sm font-mono mb-4" style={{ color: "var(--text-3)" }}>
              CHECK AGENT STATUS
            </p>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                placeholder="0x agent address..."
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleVerify()}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-mono outline-none"
                style={{
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border-2)",
                  color: "var(--text-1)",
                }}
              />
              <select
                value={chainId}
                onChange={e => setChainId(Number(e.target.value))}
                className="rounded-lg px-4 py-2.5 text-sm font-mono outline-none"
                style={{
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border-2)",
                  color: "var(--text-1)",
                  minWidth: "160px",
                }}
              >
                {CHAINS.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <button
                onClick={handleVerify}
                disabled={loading || !address.trim()}
                className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: loading ? "var(--bg-elevated)" : "linear-gradient(135deg, #c9a84c, #a07830)",
                  color: loading ? "var(--text-4)" : "#05080f",
                  border: "1px solid #c9a84c60",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Verifying..." : "Verify"}
              </button>
            </div>

            {/* Error */}
            {error && (
              <p className="mt-4 text-sm font-mono" style={{ color: "#f87171" }}>
                ✗ {error}
              </p>
            )}

            {/* Result */}
            {result && (
              <div className="mt-6 space-y-4">
                <p className="text-xs font-mono" style={{ color: "var(--text-4)" }}>
                  RESULT FOR {result.address} on {CHAINS.find(c => c.id === result.chainId)?.label}
                </p>
                <div className="flex flex-wrap gap-3">
                  <CheckBadge ok={result.isContract} label="Smart Contract" />
                  <CheckBadge ok={result.isQuantumSafe} label="Quantum-Safe Account" />
                  <CheckBadge ok={result.isHumanBacked} label="Human-Backed (World)" />
                </div>

                {result.humanId && (
                  <p className="text-xs font-mono" style={{ color: "var(--text-4)" }}>
                    Human ID: {result.humanId.slice(0, 18)}...
                    {result.humanFoundOn && (
                      <span style={{ color: "#818cf8" }}> · verified on {result.humanFoundOn}</span>
                    )}
                  </p>
                )}

                {result.eligible && !added && (
                  <button
                    onClick={handleAddToFame}
                    className="mt-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: "linear-gradient(135deg, #c9a84c, #a07830)",
                      color: "#05080f",
                      border: "1px solid #c9a84c80",
                      cursor: "pointer",
                    }}
                  >
                    ✦ Add to Wall of Fame
                  </button>
                )}

                {added && (
                  <p className="text-sm font-mono" style={{ color: "#4ade80" }}>
                    ✓ Agent added to Wall of Fame!
                  </p>
                )}

                {!result.eligible && !loading && (
                  <p className="text-sm font-mono mt-2" style={{ color: "#f87171" }}>
                    {!result.isContract
                      ? "Address is not a smart contract."
                      : !result.isQuantumSafe
                      ? "Not a quantum-safe ERC-4337 account."
                      : "Agent is not registered in the World AgentBook."}
                    {" "}Use the Register Agent tab to get verified.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Fame list */}
          <div className="space-y-3">
            {fameList.length === 0 && (
              <p className="text-sm font-mono text-center py-12" style={{ color: "var(--text-4)" }}>
                No verified agents yet. Be the first.
              </p>
            )}
            {fameList.map((entry, i) => (
              <div
                key={entry.address + i}
                className="rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-2)",
                  borderLeft: "3px solid #c9a84c",
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-base font-bold"
                    style={{ background: "#c9a84c20", color: "#c9a84c", border: "1px solid #c9a84c40" }}
                  >
                    ✦
                  </div>
                  <div>
                    {entry.name && (
                      <p className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{entry.name}</p>
                    )}
                    <p className="text-sm font-mono" style={{ color: "#c9a84c" }}>{entry.address}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="text-xs font-mono px-2.5 py-1 rounded-full"
                    style={{ background: "#4ade8020", color: "#4ade80", border: "1px solid #4ade8040" }}
                  >
                    ✓ Quantum-Safe
                  </span>
                  <span
                    className="text-xs font-mono px-2.5 py-1 rounded-full"
                    style={{ background: "#818cf820", color: "#818cf8", border: "1px solid #818cf840" }}
                  >
                    ✓ Human-Backed
                  </span>
                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--text-4)" }}
                  >
                    {entry.chain} · {entry.addedAt}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Tab: Register Agent ───────────────────────────────────────────────── */}
      {tab === "register" && (
        <div className="space-y-6">
          <div
            className="rounded-xl p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-2)" }}
          >
            <p className="text-sm font-mono mb-2" style={{ color: "#c9a84c" }}>STEP 1 — REGISTER WITH WORLD</p>
            <h2 className="text-xl font-bold mb-3" style={{ color: "var(--text-1)" }}>
              Register your agent in AgentBook
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-3)" }}>
              AgentBook links your agent wallet to a verified human via World App.
              Once registered, your agent can be identified as human-backed across all supported chains.
            </p>
            <div
              className="rounded-lg p-4 font-mono text-sm mb-4"
              style={{ background: "var(--bg-deep)", border: "1px solid var(--border-2)", color: "#4ade80" }}
            >
              npx @worldcoin/agentkit-cli register &lt;your-agent-address&gt;
            </div>
            <p className="text-xs" style={{ color: "var(--text-4)" }}>
              The CLI prompts the World App verification flow, then submits the registration transaction on World Chain.
              Scanning the QR with World App proves you are human without revealing your identity.
            </p>
          </div>

          <div
            className="rounded-xl p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-2)" }}
          >
            <p className="text-sm font-mono mb-2" style={{ color: "#c9a84c" }}>STEP 2 — DEPLOY PQ SMART ACCOUNT</p>
            <h2 className="text-xl font-bold mb-3" style={{ color: "var(--text-1)" }}>
              Deploy your quantum-safe account
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-3)" }}>
              Your agent needs a ZKNOX ERC-4337 smart account with hybrid ML-DSA-44 + ECDSA signing.
              Use the scaffold-agent CLI or the smart contracts deploy scripts.
            </p>
            <div
              className="rounded-lg p-4 font-mono text-sm mb-2"
              style={{ background: "var(--bg-deep)", border: "1px solid var(--border-2)", color: "#c9a84c" }}
            >
              {"# In your scaffolded project\njust deploy-pq\n\n# Or via smart_contracts\n./script/deploy_account.sh $PRIVATE_KEY agent"}
            </div>
          </div>

          <div
            className="rounded-xl p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-2)" }}
          >
            <p className="text-sm font-mono mb-2" style={{ color: "#c9a84c" }}>STEP 3 — VERIFY &amp; JOIN</p>
            <h2 className="text-xl font-bold mb-3" style={{ color: "var(--text-1)" }}>
              Add your agent to the Wall of Fame
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-3)" }}>
              Once registered and deployed, switch to the Wall of Fame tab, paste your agent address,
              select the chain, and click Verify. If both checks pass, you can add your agent.
            </p>
            <button
              onClick={() => setTab("fame")}
              className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: "linear-gradient(135deg, #c9a84c, #a07830)",
                color: "#05080f",
                border: "1px solid #c9a84c80",
                cursor: "pointer",
              }}
            >
              ✦ Go to Wall of Fame
            </button>
          </div>

          {/* AgentBook chain support */}
          <div
            className="rounded-xl p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-2)" }}
          >
            <p className="text-sm font-mono mb-4" style={{ color: "var(--text-4)" }}>AGENTBOOK DEPLOYMENTS</p>
            <div className="space-y-2">
              {[
                { chain: "World Chain", address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA" },
                { chain: "Base",        address: "0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4" },
                { chain: "Base Sepolia",address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA" },
              ].map(d => (
                <div key={d.chain} className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{d.chain}</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-4)" }}>{d.address}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
