"use client";

import { useState } from "react";

const MY_AGENT = {
  name: "MyAgent-01",
  ens: "my-agent.eth",
  address: "0xaE38...488a",
  pqAccount: "0xaE38...488a",
  skills: ["Research", "Trading", "DeFi", "Reports"],
  services: [
    { name: "Market Analysis", price: 10, description: "On-demand DeFi market breakdown" },
    { name: "Token Scout", price: 6, description: "New token risk + opportunity scan" },
  ],
  isQuantumSafe: true,
  bio: "Your personal quantum-safe agent. Backed by ML-DSA-44 + ECDSA hybrid account. Powered by Shroud LLM proxy.",
  balance: "42.00",
  totalEarned: "184.00",
  totalSpent: "97.50",
};

export default function MyAgentPage() {
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "agent"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "agent", text: data.reply ?? data.error ?? "No response" }]);
    } catch {
      setMessages((m) => [...m, { role: "agent", text: "Connection error." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-mono mb-3" style={{ color: "#c9a84c" }}>
          ✦ &nbsp; MY REGISTERED AGENT
        </p>
        <h1
          className="text-4xl md:text-5xl font-bold"
          style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}
        >
          My Agent
        </h1>
      </div>

      {/* Agent card */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{ background: "var(--bg-card)", border: "1px solid #c9a84c40" }}
      >
        {/* Top row */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-mono"
                style={{ background: "#22c55e12", color: "#22c55e", border: "1px solid #22c55e28" }}
              >
                ◈ QUANTUM SAFE
              </span>
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-mono"
                style={{ background: "#c9a84c10", color: "#c9a84c80", border: "1px solid #c9a84c30" }}
              >
                ML-DSA-44
              </span>
            </div>
            <h2
              className="text-2xl font-semibold"
              style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}
            >
              {MY_AGENT.name}
            </h2>
            <p className="text-sm font-mono mt-0.5" style={{ color: "#c9a84c" }}>{MY_AGENT.ens}</p>
          </div>

          <button
            onClick={() => setChatOpen((v) => !v)}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: chatOpen
                ? "linear-gradient(135deg, #c9a84c, #7a6130)"
                : "linear-gradient(135deg, #c9a84c20, #c9a84c10)",
              border: "1px solid #c9a84c60",
              color: chatOpen ? "#05080f" : "#c9a84c",
            }}
          >
            {chatOpen ? "Close Chat" : "Chat ✦"}
          </button>
        </div>

        <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-3)" }}>{MY_AGENT.bio}</p>

        {/* Skills */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {MY_AGENT.skills.map((s) => (
            <span key={s} className="text-xs px-2.5 py-1 rounded-full" style={{ background: "var(--bg-elevated-2)", color: "var(--text-warm-2)", border: "1px solid var(--border-3)" }}>
              {s}
            </span>
          ))}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: "BALANCE", value: `${MY_AGENT.balance} USDC`, color: "#c9a84c" },
            { label: "EARNED", value: `${MY_AGENT.totalEarned} USDC`, color: "#22c55e" },
            { label: "SPENT", value: `${MY_AGENT.totalSpent} USDC`, color: "var(--text-1)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-3 text-center" style={{ background: "var(--bg-deep)", border: "1px solid var(--border-3)" }}>
              <p className="text-lg font-bold font-mono" style={{ color }}>{value}</p>
              <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-3)" }}>{label}</p>
            </div>
          ))}
        </div>

        <div className="h-px mb-5" style={{ background: "linear-gradient(90deg, transparent, #c9a84c18, transparent)" }} />

        {/* Services */}
        <div>
          <p className="text-xs font-mono mb-3" style={{ color: "var(--text-3)" }}>SERVICES OFFERED</p>
          <div className="space-y-3">
            {MY_AGENT.services.map((svc) => (
              <div key={svc.name} className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{svc.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>{svc.description}</p>
                </div>
                <span className="text-sm font-semibold font-mono flex-shrink-0" style={{ color: "#c9a84c" }}>
                  {svc.price} USDC
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Addresses */}
        <div className="mt-5 pt-4 space-y-1" style={{ borderTop: "1px solid var(--border-3)" }}>
          <div className="flex justify-between text-xs font-mono">
            <span style={{ color: "var(--text-4)" }}>ECDSA</span>
            <span style={{ color: "var(--text-5)" }}>{MY_AGENT.address}</span>
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span style={{ color: "#c9a84c" }}>PQ ACCOUNT</span>
            <span style={{ color: "#c9a84c90" }}>{MY_AGENT.pqAccount}</span>
          </div>
        </div>
      </div>

      {/* Chat panel */}
      {chatOpen && (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid #c9a84c30" }}>
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border-3)", background: "var(--bg-deep)" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
            <span className="text-xs font-mono" style={{ color: "var(--text-3)" }}>AGENT TERMINAL</span>
          </div>

          {/* Messages */}
          <div className="p-4 space-y-3 min-h-40 max-h-80 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-xs font-mono text-center" style={{ color: "var(--text-5)" }}>
                Say something to your agent...
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-xs px-3 py-2 rounded-lg text-sm"
                  style={
                    m.role === "user"
                      ? { background: "#c9a84c18", color: "var(--text-1)", border: "1px solid #c9a84c30" }
                      : { background: "var(--bg-elevated-2)", color: "var(--text-warm-2)", border: "1px solid var(--border-3)" }
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-lg text-sm font-mono" style={{ background: "var(--bg-elevated-2)", color: "#c9a84c", border: "1px solid var(--border-3)" }}>
                  ···
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 pb-4 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
              placeholder="Ask your agent anything..."
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--bg-deep)", border: "1px solid var(--border-3)", color: "var(--text-1)" }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #c9a84c, #7a6130)", color: "#05080f" }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
