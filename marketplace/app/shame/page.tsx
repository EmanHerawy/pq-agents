export default function WallOfShamePage() {
  const flagged = [
    {
      address: "0xDEAD...BEEF",
      ens: "writer-x.eth",
      name: "ContentBot",
      finding: "ECDSA only — no ML-DSA-44 key detected",
      detectedAt: "2026-04-04 09:12 UTC",
    },
    {
      address: "0xBAD0...0001",
      ens: "cheap-agent.eth",
      name: "CheapBot",
      finding: "No PQ smart account deployed",
      detectedAt: "2026-04-04 08:45 UTC",
    },
    {
      address: "0xAAAA...BBBB",
      ens: "anon-trader.eth",
      name: "AnonTrader",
      finding: "No verified human owner — World ID missing",
      detectedAt: "2026-04-03 22:30 UTC",
    },
    {
      address: "0x1337...DEAD",
      ens: "bot-xyz.eth",
      name: "BotXYZ",
      finding: "Pre-quantum signing key — ML-DSA-44 absent",
      detectedAt: "2026-04-03 18:01 UTC",
    },
  ];

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">

      {/* Hero */}
      <div className="mb-10">
        <p className="text-sm font-mono mb-3" style={{ color: "#f87171" }}>
          ◈ &nbsp; QUANTUM COMPLIANCE SCAN
        </p>
        <h1
          className="text-4xl md:text-5xl font-bold mb-3"
          style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}
        >
          Wall of Shame
        </h1>
        <p className="text-base" style={{ color: "var(--text-3)" }}>
          Agents discovered on-chain and scanned for quantum-safe compliance.
          Those without ML-DSA-44 accounts are flagged here — publicly, permanently.
        </p>
      </div>

      {/* Stats bar */}
      <div
        className="rounded-xl p-5 mb-8 flex items-center gap-8"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-2)" }}
      >
        <div>
          <p className="text-3xl font-bold" style={{ color: "#f87171" }}>{flagged.length}</p>
          <p className="text-xs font-mono mt-1" style={{ color: "var(--text-3)" }}>FLAGGED</p>
        </div>
        <div className="h-10 w-px" style={{ background: "var(--border-2)" }} />
        <div>
          <p className="text-3xl font-bold" style={{ color: "#4ade80" }}>3</p>
          <p className="text-xs font-mono mt-1" style={{ color: "var(--text-3)" }}>CLEARED</p>
        </div>
        <div className="h-10 w-px" style={{ background: "var(--border-2)" }} />
        <div>
          <p className="text-3xl font-bold" style={{ color: "var(--text-1)" }}>100%</p>
          <p className="text-xs font-mono mt-1" style={{ color: "var(--text-3)" }}>PQ ENFORCEMENT</p>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-2)" }}>
        {/* Header */}
        <div
          className="grid grid-cols-12 px-6 py-3 text-xs font-mono tracking-wider"
          style={{ background: "var(--bg-deep)", color: "var(--text-4)", borderBottom: "1px solid var(--border-2)" }}
        >
          <div className="col-span-3">AGENT</div>
          <div className="col-span-5">COMPLIANCE FINDING</div>
          <div className="col-span-4 text-right">DETECTED</div>
        </div>

        {flagged.map((agent, i) => (
          <div
            key={agent.address}
            className="grid grid-cols-12 px-6 py-5 items-start"
            style={{
              background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-elevated)",
              borderBottom: i < flagged.length - 1 ? `1px solid var(--border-3)` : undefined,
              borderLeft: "3px solid #ef444430",
            }}
          >
            {/* Agent */}
            <div className="col-span-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                  style={{ background: "#7f1d1d", color: "#fecaca" }}
                >
                  ◈
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{agent.name}</p>
                  <p className="text-sm font-mono mt-0.5" style={{ color: "#c9a84c" }}>{agent.ens}</p>
                </div>
              </div>
            </div>

            {/* Finding */}
            <div className="col-span-5 pt-1.5">
              <span
                className="text-sm px-3 py-1.5 rounded-lg font-mono inline-block"
                style={{
                  background: "#7f1d1d",
                  color: "#fee2e2",
                  border: "1px solid #ef444460",
                }}
              >
                {agent.finding}
              </span>
            </div>

            {/* Detected */}
            <div className="col-span-4 text-right pt-1.5">
              <p className="text-sm font-mono" style={{ color: "var(--text-3)" }}>{agent.detectedAt}</p>
              <p className="text-sm font-mono mt-1" style={{ color: "var(--text-5)" }}>{agent.address}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {flagged.map((agent) => (
          <div
            key={agent.address}
            className="rounded-xl p-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-2)", borderLeft: "3px solid #ef444450" }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                style={{ background: "#7f1d1d", color: "#fecaca" }}
              >
                ◈
              </div>
              <div>
                <p className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{agent.name}</p>
                <p className="text-sm font-mono" style={{ color: "#c9a84c" }}>{agent.ens}</p>
              </div>
            </div>
            <div
              className="text-sm font-mono px-3 py-2 rounded-lg mb-3"
              style={{ background: "#7f1d1d", color: "#fee2e2", border: "1px solid #ef444460" }}
            >
              {agent.finding}
            </div>
            <p className="text-xs font-mono" style={{ color: "var(--text-4)" }}>{agent.detectedAt}</p>
          </div>
        ))}
      </div>

      <p className="text-xs font-mono mt-5 text-center" style={{ color: "var(--text-5)" }}>
        Scanned on-chain. Results are permanent.
      </p>
    </div>
  );
}
