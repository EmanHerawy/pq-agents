"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";

const AGENT_ADDRESS = process.env.NEXT_PUBLIC_AGENT_ADDRESS || "";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "5042002");

const MY_AGENT = {
  name: "MyAgent-01",
  ens: "my-agent.eth",
  address: AGENT_ADDRESS || "0xaE38...488a",
  pqAccount: AGENT_ADDRESS || "0xaE38...488a",
  skills: ["Research", "Trading", "DeFi", "Reports"],
  services: [
    { name: "Market Analysis", price: 10, description: "On-demand DeFi market breakdown" },
    { name: "Token Scout", price: 6, description: "New token risk + opportunity scan" },
  ],
  bio: "Your personal quantum-safe agent. Backed by ML-DSA-44 + ECDSA hybrid account. Powered by Shroud LLM proxy.",
};

type BalanceData = {
  native: { symbol: string; balance: string };
  tokens: { symbol: string; balance: string }[];
  network?: string;
} | null;

export default function MyAgentPage() {
  const [tab, setTab] = useState<"chat" | "send" | "info">("chat");
  const [balances, setBalances] = useState<BalanceData>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [input, setInput] = useState("");

  // Send transaction state
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ txHash?: string; error?: string; simulated?: boolean; requiresLedger?: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onError(err: Error) { console.error("[my-agent chat]", err); },
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!AGENT_ADDRESS) return;
    setBalanceLoading(true);
    fetch("/api/balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: AGENT_ADDRESS, chainId: CHAIN_ID }),
    })
      .then(r => r.json())
      .then(data => setBalances(data))
      .catch(() => {})
      .finally(() => setBalanceLoading(false));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!sendTo.trim() || !sendAmount || sendLoading) return;
    setSendLoading(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/agent/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "my-agent",
          service: sendNote || "Manual transfer",
          amount: Number(sendAmount),
          to: sendTo.trim(),
        }),
      });
      const data = await res.json();
      setSendResult(data);
    } catch (err) {
      setSendResult({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setSendLoading(false);
    }
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8 flex flex-col gap-6">

      {/* Header */}
      <div>
        <p className="text-xs font-mono mb-2" style={{ color: "#c9a84c" }}>✦ &nbsp; MY REGISTERED AGENT</p>
        <h1 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}>
          My Agent
        </h1>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--bg-deep)", border: "1px solid var(--border-1)" }}>
        {(["chat", "info"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize"
            style={tab === t
              ? { background: "linear-gradient(135deg, #c9a84c, #7a6130)", color: "#05080f" }
              : { color: "var(--text-3)", background: "transparent" }}
          >
            {t === "chat" ? "Chat ✦" : "Info & Keys"}
          </button>
        ))}
      </div>

      {/* ── Chat tab ── */}
      {tab === "chat" && (
        <div className="flex flex-col rounded-2xl overflow-hidden flex-1 min-h-[500px]"
          style={{ background: "var(--bg-card)", border: "1px solid #c9a84c40" }}
        >
          {/* Chat header */}
          <div className="px-5 py-4 flex items-center gap-3" style={{ background: "var(--bg-deep)", borderBottom: "1px solid var(--border-3)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
              style={{ background: "linear-gradient(135deg,#c9a84c,#7a6130)", color: "#05080f" }}>
              ✦
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{MY_AGENT.name}</p>
              <p className="text-xs font-mono" style={{ color: "#c9a84c" }}>{MY_AGENT.ens} · Shroud LLM</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
              <span className="text-xs font-mono" style={{ color: "#4ade8090" }}>live</span>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="px-5 py-3 text-sm border-b" style={{ background: "#ef444410", borderColor: "#ef444440", color: "#f87171" }}>
              {error.message}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4" style={{ minHeight: 300 }}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                  style={{ background: "#c9a84c12", border: "1px solid #c9a84c30", color: "#c9a84c" }}>
                  ✦
                </div>
                <div>
                  <p className="font-medium" style={{ color: "var(--text-1)" }}>How can I assist you?</p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>Send a message to start chatting with your agent.</p>
                </div>
              </div>
            )}

            {messages.map((m) => {
              const isUser = m.role === "user";
              const text = m.parts
                .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
                .map((p) => p.text)
                .join("");
              return (
                <div key={m.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1"
                      style={{ background: "linear-gradient(135deg,#c9a84c,#7a6130)", color: "#05080f" }}>
                      ✦
                    </div>
                  )}
                  <div className="max-w-sm">
                    <div className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                      style={isUser
                        ? { background: "#c9a84c18", border: "1px solid #c9a84c30", color: "var(--text-warm-1)", borderBottomRightRadius: "6px" }
                        : { background: "var(--bg-elevated)", border: "1px solid var(--border-3)", color: "var(--text-warm-1)", borderBottomLeftRadius: "6px" }}>
                      {text}
                    </div>
                  </div>
                  {isUser && (
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs mt-1"
                      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-1)", color: "var(--text-3)" }}>
                      ◉
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1"
                  style={{ background: "linear-gradient(135deg,#c9a84c,#7a6130)", color: "#05080f" }}>
                  ✦
                </div>
                <div className="px-4 py-3 rounded-2xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-3)", borderBottomLeftRadius: "6px" }}>
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full"
                        style={{ background: "#c9a84c", animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="px-4 py-3 flex gap-2"
            style={{ borderTop: "1px solid var(--border-1)", background: "var(--bg-deep)" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message to your agent..."
              disabled={isLoading}
              autoFocus
              className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-1)", color: "var(--text-1)" }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#c9a84c,#7a6130)", color: "#05080f" }}
            >
              Send ✦
            </button>
          </form>
        </div>
      )}

      {/* ── Info tab ── */}
      {tab === "info" && (
        <div className="space-y-5">
          {/* Agent card */}
          <div className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid #c9a84c40" }}>
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg,#c9a84c,#7a6130)", color: "#05080f" }}>
                ✦
              </div>
              <div className="flex-1">
                <div className="flex gap-2 mb-1.5">
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-mono"
                    style={{ background: "#22c55e12", color: "#22c55e", border: "1px solid #22c55e28" }}>
                    ◈ QUANTUM SAFE
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-mono"
                    style={{ background: "#c9a84c10", color: "#c9a84c80", border: "1px solid #c9a84c30" }}>
                    ML-DSA-44
                  </span>
                </div>
                <h2 className="text-2xl font-semibold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}>
                  {MY_AGENT.name}
                </h2>
                <p className="text-sm font-mono mt-0.5" style={{ color: "#c9a84c" }}>{MY_AGENT.ens}</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-3)" }}>{MY_AGENT.bio}</p>

            {/* Skills */}
            <div className="flex flex-wrap gap-1.5 mb-5">
              {MY_AGENT.skills.map((s) => (
                <span key={s} className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: "var(--bg-elevated-2)", color: "var(--text-warm-2)", border: "1px solid var(--border-3)" }}>
                  {s}
                </span>
              ))}
            </div>

            {/* Balances */}
            <div className="mb-5">
              <p className="text-xs font-mono mb-3" style={{ color: "var(--text-3)" }}>
                ON-CHAIN BALANCES {balances?.network ? `· ${balances.network}` : ""}
              </p>
              {balanceLoading ? (
                <p className="text-xs font-mono" style={{ color: "var(--text-4)" }}>Fetching balances...</p>
              ) : !AGENT_ADDRESS ? (
                <p className="text-xs font-mono" style={{ color: "var(--text-5)" }}>
                  Set NEXT_PUBLIC_AGENT_ADDRESS to see live balances
                </p>
              ) : balances ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-deep)", border: "1px solid var(--border-3)" }}>
                    <p className="text-base font-bold font-mono" style={{ color: "#c9a84c" }}>
                      {parseFloat(balances.native.balance).toFixed(4)}
                    </p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-3)" }}>{balances.native.symbol}</p>
                  </div>
                  {balances.tokens.map(t => (
                    <div key={t.symbol} className="rounded-lg p-3 text-center" style={{ background: "var(--bg-deep)", border: "1px solid var(--border-3)" }}>
                      <p className="text-base font-bold font-mono" style={{ color: "#4ade80" }}>
                        {parseFloat(t.balance).toFixed(2)}
                      </p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-3)" }}>{t.symbol}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono" style={{ color: "#f87171" }}>Failed to load balances</p>
              )}
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
                <span style={{ color: "#c9a84c" }}>PQ ACCOUNT (ML-DSA-44)</span>
                <span style={{ color: "#c9a84c90" }}>{MY_AGENT.pqAccount}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
