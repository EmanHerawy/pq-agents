import type { Metadata } from "next";
import "./globals.css";
import { NavLinks } from "./components/NavLinks";

export const metadata: Metadata = {
  title: "Post Quantum Agent — ETHGlobal Cannes 2026",
  description: "The quantum-safe AI agent economy. Only ML-DSA-44 agents may trade.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      {/* No-flash theme script — runs before React hydrates */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>
        <Header />
        <main className="flex-1 flex flex-col">{children}</main>
        <ActivityFeed />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "var(--header-bg)",
        backdropFilter: "blur(12px)",
        borderColor: "#c9a84c30",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-3" style={{ textDecoration: "none" }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
            style={{ background: "linear-gradient(135deg, #c9a84c, #7a6130)", color: "#05080f", boxShadow: "0 0 12px #c9a84c30" }}
          >
            ✦
          </div>
          <div>
            <span
              className="text-lg font-semibold tracking-wide"
              style={{ fontFamily: "'Playfair Display', serif", color: "#c9a84c" }}
            >
              Post Quantum Agent
            </span>
            <span
              className="ml-2 text-xs px-2 py-0.5 rounded-full border"
              style={{ borderColor: "#c9a84c40", color: "#c9a84c", fontFamily: "monospace" }}
            >
              CANNES 2026
            </span>
          </div>
        </a>

        <NavLinks />
      </div>
    </header>
  );
}

function ActivityFeed() {
  const events = [
    "trader.eth bought market-analysis from analyst.eth · 12 USDC · just now",
    "researcher.eth sold trend-report to swarm-7.eth · 8 USDC · 42s ago",
    "writer.eth ❌ rejected — no ML-DSA-44 key · Wall of Shame",
    "analyst.eth bought data-feed from oracle.eth · 5 USDC · 2m ago",
    "my-agent.eth completed research task for trader.eth · 15 USDC · 3m ago",
    "bot-xyz.eth ❌ rejected — ECDSA only · Wall of Shame",
  ];

  // Duplicate for seamless loop
  const doubled = [...events, ...events];

  return (
    <div
      className="border-t overflow-hidden"
      style={{ background: "var(--bg-deep)", borderColor: "#c9a84c20", height: "36px" }}
    >
      <div className="flex items-center h-full">
        {/* Live badge */}
        <div
          className="flex-shrink-0 flex items-center gap-1.5 px-4 border-r h-full"
          style={{ borderColor: "#c9a84c20" }}
        >
          <span className="w-1.5 h-1.5 rounded-full pulse-gold" style={{ background: "#c9a84c" }} />
          <span className="text-xs font-mono" style={{ color: "#c9a84c" }}>LIVE</span>
        </div>

        {/* Ticker */}
        <div className="flex-1 overflow-hidden relative">
          <div className="ticker-track flex gap-12 whitespace-nowrap">
            {doubled.map((e, i) => (
              <span key={i} className="text-xs font-mono flex-shrink-0" style={{ color: "var(--text-3)" }}>
                {e.includes("❌") ? (
                  <span style={{ color: "#ef444490" }}>{e}</span>
                ) : (
                  <span>
                    <span style={{ color: "#c9a84c" }}>✦</span>{" "}
                    {e}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
