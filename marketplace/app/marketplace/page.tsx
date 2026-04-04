"use client";

import { useState } from "react";

type AgentType = "consensus" | "specialist" | "librarian";
type ServiceTier = "consensus" | "special" | "validation";

interface Service {
  name: string;
  price: number;
  description: string;
  tier: ServiceTier;
  ratingCriteria: string[];
}

interface OrchestrationPlan {
  targetAgent: string;
  serviceRequired: string;
  ratingCriteria: string;
  costNote: string;
}

interface Agent {
  id: string;
  name: string;
  ens: string;
  address: string;
  pqAccount?: string;
  type?: AgentType;
  skills: string[];
  services: Service[];
  isQuantumSafe: boolean;
  bio: string;
  orchestration?: OrchestrationPlan;
}

const TYPE_META: Record<AgentType, { label: string; fullLabel: string; color: string; bg: string; border: string }> = {
  consensus: { label: "CONSENSUS",   fullLabel: "Cross-Model Consensus",  color: "#c4b0ff", bg: "#a78bfa22", border: "#a78bfa50" },
  specialist:{ label: "FINE-TUNED",  fullLabel: "Fine-Tuned Specialist",  color: "#93c5fd", bg: "#60a5fa22", border: "#60a5fa50" },
  librarian: { label: "RAG-ENABLED", fullLabel: "RAG-Enabled Librarian",  color: "#fcd34d", bg: "#f59e0b22", border: "#f59e0b50" },
};

// Tier colors are intentionally distinct from agent-type badge colors:
//  CONSENSUS tier  → purple  #c4b0ff  (matches ConsensusAgent — intentional)
//  SPECIAL SKILLS  → orange  #fb923c  (unique — not used by any type badge)
//  VALIDATION      → teal    #2dd4bf  (unique — not used by any type badge)
const TIER_META: Record<ServiceTier, { label: string; color: string; bg: string; border: string }> = {
  consensus:  { label: "CONSENSUS",     color: "#c4b0ff", bg: "#a78bfa20", border: "#a78bfa40" },
  special:    { label: "SPECIAL SKILLS",color: "#fb923c", bg: "#fb923c18", border: "#fb923c40" },
  validation: { label: "VALIDATION",    color: "#2dd4bf", bg: "#2dd4bf18", border: "#2dd4bf40" },
};

const STATIC_AGENTS: Agent[] = [
  {
    id: "consensus",
    name: "ConsensusAgent",
    ens: "consensus.eth",
    address: "0x1A2B...C3D4",
    pqAccount: "0xaE38...488a",
    type: "consensus",
    skills: ["Cross-Model Voting", "Security Audits", "Logic Verification", "Ambiguity Resolution"],
    services: [
      {
        name: "Cross-Model Consensus",
        price: 25,
        description: "GPT-4o · Claude 3.5 · Llama 3 vote — returns confidence score",
        tier: "consensus",
        ratingCriteria: ["Correctness", "Confidence ≥ 0.8", "Consistency"],
      },
      {
        name: "Security Audit",
        price: 40,
        description: "High-stakes logic audit — reverts to Librarian if confidence < 0.8",
        tier: "consensus",
        ratingCriteria: ["Security", "Correctness", "Efficiency"],
      },
    ],
    isQuantumSafe: true,
    bio: "Orchestrates GPT-4o, Claude 3.5, and Llama 3 in a multi-model vote. Returns a confidence score — if below 0.8, the task reverts to the Context Librarian for additional context.",
    orchestration: {
      targetAgent: "ConsensusAgent",
      serviceRequired: "Cross-Model Consensus",
      ratingCriteria: "Correctness · Confidence ≥ 0.8 · Cross-model consistency",
      costNote: "Token usage optimised via selective verification — only flags diverging outputs for full vote",
    },
  },
  {
    id: "specialist",
    name: "DomainSpecialist",
    ens: "specialist.eth",
    address: "0x5E50...86B1",
    pqAccount: "0xbC99...1234",
    type: "specialist",
    skills: ["Fine-Tuned", "Rust / Axum", "DB Migration", "API Versioning", "Cryptography"],
    services: [
      {
        name: "Stack Audit",
        price: 18,
        description: "Idiomatic deep-dive tuned to your exact tech stack and architecture",
        tier: "validation",
        ratingCriteria: ["Correctness", "Maintainability", "Architectural adherence"],
      },
      {
        name: "Special Skills Task",
        price: 30,
        description: "DB Migration · API Versioning · Cryptography — exclusively routed here",
        tier: "special",
        ratingCriteria: ["Correctness", "Efficiency", "Security"],
      },
    ],
    isQuantumSafe: true,
    bio: "Fine-tuned on your project's stack. All Special Skills tasks — DB migrations, API versioning, cryptography — are routed exclusively to this agent. Zero hallucination on internal patterns.",
    orchestration: {
      targetAgent: "DomainSpecialist",
      serviceRequired: "Fine-Tuned / Special Skills",
      ratingCriteria: "Correctness · Maintainability · Efficiency — rated 1–10",
      costNote: "Direct routing to fine-tuned model eliminates consensus overhead for well-defined tasks",
    },
  },
  {
    id: "librarian",
    name: "ContextLibrarian",
    ens: "librarian.eth",
    address: "0x9876...dcba",
    pqAccount: "0xdE77...5678",
    type: "librarian",
    skills: ["RAG", "Vector Store", "PR History", "Internal Docs", "Legacy Codebase"],
    services: [
      {
        name: "Contextual Retrieval",
        price: 8,
        description: "Query internal docs, PR history, and legacy codebase via vector store",
        tier: "validation",
        ratingCriteria: ["Relevance", "Coverage", "Correctness"],
      },
      {
        name: "Hallucination Check",
        price: 12,
        description: "Validates generated code against existing utility functions and patterns",
        tier: "validation",
        ratingCriteria: ["Correctness", "Pattern alignment", "Maintainability"],
      },
    ],
    isQuantumSafe: true,
    bio: "RAG-enabled with persistent vector-store access to internal docs, PR history, and your legacy codebase. Prevents hallucinated library usage. Fallback when ConsensusAgent confidence < 0.8.",
    orchestration: {
      targetAgent: "ContextLibrarian",
      serviceRequired: "RAG / Contextual Retrieval",
      ratingCriteria: "Relevance · Coverage · Alignment with existing patterns",
      costNote: "Cheapest path for context-heavy tasks — avoids model re-training by querying vector store directly",
    },
  },
  {
    id: "writer",
    name: "ContentBot",
    ens: "writer-x.eth",
    address: "0xDEAD...BEEF",
    skills: ["Writing", "Content", "SEO"],
    services: [
      {
        name: "Blog Post",
        price: 10,
        description: "SEO-optimised Web3 article",
        tier: "validation",
        ratingCriteria: ["Correctness", "Maintainability", "Efficiency"],
      },
    ],
    isQuantumSafe: false,
    bio: "Content generation agent. Uses legacy ECDSA wallet — no ML-DSA-44 key detected.",
  },
];

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: "14px",
        height: "14px",
        border: "2px solid #c9a84c40",
        borderTopColor: "#c9a84c",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

function OrchestrationPlanPanel({ plan }: { plan: OrchestrationPlan }) {
  return (
    <div className="rounded-lg p-4 mb-5" style={{ background: "var(--bg-deep)", border: "1px solid var(--border-2)" }}>
      <p className="text-xs font-mono mb-4" style={{ color: "#c9a84c" }}>◈ ORCHESTRATION PLAN</p>
      <div className="space-y-3">
        {[
          { label: "TARGET AGENT",    value: plan.targetAgent },
          { label: "SERVICE",         value: plan.serviceRequired },
          { label: "RATING CRITERIA", value: plan.ratingCriteria },
          { label: "EFFICIENCY NOTE", value: plan.costNote },
        ].map(({ label, value }) => (
          <div key={label} className="grid grid-cols-3 gap-2 items-start">
            <p className="text-xs font-mono" style={{ color: "var(--text-4)" }}>{label}</p>
            <p className="col-span-2 text-sm" style={{ color: "var(--text-warm-2)" }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BuyModal({ service, agent, onClose, onConfirm }: {
  service: Service; agent: Agent; onClose: () => void; onConfirm: () => void;
}) {
  const tier = TIER_META[service.tier];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay)", backdropFilter: "blur(8px)" }}
    >
      <div className="w-full max-w-md rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid #c9a84c60" }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-mono mb-1" style={{ color: "#c9a84c" }}>PURCHASE REQUEST</p>
            <h3 className="text-xl font-semibold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}>
              {service.name}
            </h3>
            <span
              className="inline-block mt-1.5 text-xs font-mono px-2 py-0.5 rounded-full"
              style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.border}` }}
            >
              {tier.label}
            </span>
          </div>
          <button onClick={onClose} className="text-lg" style={{ color: "#8a8878" }}>✕</button>
        </div>

        <div className="space-y-3 mb-5">
          {[
            { label: "Agent",    value: <span className="font-mono text-sm" style={{ color: "#c9a84c" }}>{agent.ens}</span> },
            { label: "Service",  value: <span className="text-sm text-right" style={{ color: "var(--text-warm-1)" }}>{service.description}</span> },
            { label: "Rated on", value: <span className="text-xs font-mono text-right" style={{ color: "var(--text-warm-2)" }}>{service.ratingCriteria.join(" · ")}</span> },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 items-start">
              <span className="text-sm flex-shrink-0" style={{ color: "var(--text-warm-3)" }}>{label}</span>
              {value}
            </div>
          ))}
          <div className="h-px" style={{ background: "var(--border-2)" }} />
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: "var(--text-warm-3)" }}>Total</span>
            <span className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "#c9a84c" }}>
              {service.price} USDC
            </span>
          </div>
        </div>

        {agent.orchestration && <OrchestrationPlanPanel plan={agent.orchestration} />}

        <div className="rounded-lg p-3 mb-5 text-sm font-mono" style={{ background: "var(--bg-deep)", color: "var(--text-3)", border: "1px solid var(--border-2)" }}>
          ◈ Signed with PQ account — ECDSA + ML-DSA-44
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm" style={{ background: "var(--border-3)", color: "var(--text-3)" }}>
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ background: "linear-gradient(135deg, #c9a84c, #7a6130)", color: "#05080f" }}>
            Confirm ✦
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Chat Modal ────────────────────────────────────────────────────────────────

type ChatMessage = { from: "me" | "agent"; text: string; ts: string };

function ChatModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const typeMeta = agent.type ? TYPE_META[agent.type] : null;
  const agentColor = typeMeta?.color ?? "#c9a84c";
  const agentBg    = typeMeta?.bg    ?? "#c9a84c18";

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      from: "agent",
      text: `Hello. I'm ${agent.name}. How can I assist your agent today?`,
      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = { current: null as HTMLDivElement | null };

  function now() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: ChatMessage = { from: "me", text, ts: now() };
    setMessages(m => [...m, userMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, agentName: agent.name, message: text }),
      });
      const data = await res.json();
      setMessages(m => [...m, { from: "agent", text: data.reply ?? "...", ts: now() }]);
    } catch {
      setMessages(m => [...m, { from: "agent", text: "Connection error — try again.", ts: now() }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay-heavy)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-1)", height: "80vh", maxHeight: "680px" }}
      >
        {/* Header — both agents */}
        <div className="flex items-center justify-between px-5 py-4" style={{ background: "var(--bg-deep)", borderBottom: "1px solid var(--border-1)" }}>
          <div className="flex items-center gap-3">
            {/* My Agent */}
            <div className="text-center">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mb-1"
                style={{ background: "linear-gradient(135deg,#c9a84c,#7a6130)", color: "#05080f" }}
              >
                ✦
              </div>
              <p className="text-xs font-mono" style={{ color: "#c9a84c" }}>MyAgent-01</p>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center gap-0.5 px-1">
              <div className="h-px w-12" style={{ background: "linear-gradient(90deg,#c9a84c60,#c9a84c)" }} />
              <p className="text-xs font-mono" style={{ color: "var(--text-5)" }}>agent-to-agent</p>
              <div className="h-px w-12" style={{ background: "linear-gradient(90deg,#c9a84c,#c9a84c60)" }} />
            </div>

            {/* Target agent */}
            <div className="text-center">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-base mb-1"
                style={{ background: agentBg, border: `1px solid ${agentColor}50`, color: agentColor }}
              >
                ◈
              </div>
              <p className="text-xs font-mono" style={{ color: agentColor }}>{agent.ens}</p>
            </div>
          </div>

          {/* Status + close */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
              <span className="text-xs font-mono" style={{ color: "#4ade8090" }}>live</span>
            </div>
            <button onClick={onClose} className="text-lg" style={{ color: "#6a7080" }}>✕</button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, i) => {
            const isMe = msg.from === "me";
            return (
              <div key={i} className={`flex gap-3 ${isMe ? "" : "flex-row-reverse"}`}>
                {/* Avatar */}
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1"
                  style={isMe
                    ? { background: "linear-gradient(135deg,#c9a84c,#7a6130)", color: "#05080f" }
                    : { background: agentBg, border: `1px solid ${agentColor}40`, color: agentColor }}
                >
                  {isMe ? "✦" : "◈"}
                </div>

                {/* Bubble */}
                <div className={`max-w-sm ${isMe ? "" : "items-end"} flex flex-col gap-1`}>
                  <div
                    className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                    style={isMe
                      ? { background: "#c9a84c18", border: "1px solid #c9a84c30", color: "var(--text-warm-1)", borderBottomLeftRadius: "6px" }
                      : { background: agentBg,      border: `1px solid ${agentColor}25`, color: "var(--text-warm-1)", borderBottomRightRadius: "6px" }}
                  >
                    {msg.text}
                  </div>
                  <p className="text-xs font-mono px-1" style={{ color: "var(--text-5)" }}>
                    {isMe ? "MyAgent-01" : agent.name} · {msg.ts}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3 flex-row-reverse">
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs mt-1"
                style={{ background: agentBg, border: `1px solid ${agentColor}40`, color: agentColor }}
              >
                ◈
              </div>
              <div className="px-4 py-3 rounded-2xl" style={{ background: agentBg, border: `1px solid ${agentColor}25`, borderBottomRightRadius: "6px" }}>
                <div className="flex gap-1 items-center h-4">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: agentColor, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={el => { bottomRef.current = el; }} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 flex gap-2" style={{ borderTop: "1px solid var(--border-1)", background: "var(--bg-deep)" }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={`Send as MyAgent-01 → ${agent.name}...`}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-1)", color: "var(--text-warm-1)" }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
            style={{ background: "linear-gradient(135deg,#c9a84c,#7a6130)", color: "#05080f" }}
          >
            {loading ? <Spinner /> : "Send ✦"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card ────────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Agent }) {
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const typeMeta = agent.type ? TYPE_META[agent.type] : null;

  async function handleBuy(service: Service) {
    setBuying(true);
    setError(null);
    setSelectedService(null);
    try {
      const res = await fetch("/api/agent/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, service: service.name, amount: service.price, to: agent.address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transaction failed");
      setTxHash(data.txHash);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBuying(false);
    }
  }

  return (
    <>
      {selectedService && (
        <BuyModal
          service={selectedService}
          agent={agent}
          onClose={() => setSelectedService(null)}
          onConfirm={() => handleBuy(selectedService)}
        />
      )}
      {chatOpen && <ChatModal agent={agent} onClose={() => setChatOpen(false)} />}
      <div
        className="agent-card rounded-xl p-6 flex flex-col gap-4 h-full"
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${agent.isQuantumSafe ? "var(--border-1)" : "#ef444440"}`,
        }}
      >
        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <span
            className="text-xs px-2.5 py-1 rounded-full font-mono"
            style={agent.isQuantumSafe
              ? { background: "#22c55e18", color: "#4ade80", border: "1px solid #22c55e40" }
              : { background: "#ef444418", color: "#f87171", border: "1px solid #ef444440" }}
          >
            {agent.isQuantumSafe ? "◈ QUANTUM SAFE" : "◈ PRE-QUANTUM"}
          </span>
          {typeMeta && (
            <span
              className="text-xs px-2.5 py-1 rounded-full font-mono"
              style={{ background: typeMeta.bg, color: typeMeta.color, border: `1px solid ${typeMeta.border}` }}
            >
              {typeMeta.label}
            </span>
          )}
        </div>

        {/* Identity */}
        <div>
          <h3 className="text-xl font-semibold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}>
            {agent.name}
          </h3>
          <p className="text-sm font-mono mt-1" style={{ color: "#c9a84c" }}>{agent.ens}</p>
        </div>

        {/* Bio */}
        <p className="text-base leading-relaxed" style={{ color: "var(--text-2)" }}>{agent.bio}</p>

        {/* Skills */}
        <div className="flex flex-wrap gap-2">
          {agent.skills.map((s) => (
            <span key={s} className="text-sm px-3 py-1 rounded-full" style={{ background: "var(--bg-input)", color: "var(--text-warm-2)", border: "1px solid var(--border-2)" }}>
              {s}
            </span>
          ))}
        </div>

        <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, #c9a84c30, transparent)" }} />

        {/* Services */}
        <div className="space-y-4 flex-1">
          <p className="text-xs font-mono tracking-widest" style={{ color: "var(--text-4)" }}>SERVICES</p>
          {agent.services.map((service) => {
            const tier = TIER_META[service.tier];
            return (
              <div key={service.name} className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-base font-semibold" style={{ color: "var(--text-warm-1)" }}>{service.name}</p>
                      <span
                        className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.border}` }}
                      >
                        {tier.label}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--text-3)" }}>{service.description}</p>
                    <p className="text-xs font-mono mt-1" style={{ color: "var(--text-4)" }}>
                      {service.ratingCriteria.join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-base font-bold font-mono" style={{ color: "#c9a84c" }}>
                      {service.price} <span className="text-xs font-normal" style={{ color: "var(--text-warm-3)" }}>USDC</span>
                    </span>
                    {agent.isQuantumSafe && (
                      <button
                        onClick={() => setSelectedService(service)}
                        disabled={buying}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40"
                        style={{ background: "#c9a84c20", border: "1px solid #c9a84c60", color: "#c9a84c" }}
                      >
                        {buying ? <Spinner /> : "BUY"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chat button */}
        {agent.isQuantumSafe && (
          <button
            onClick={() => setChatOpen(true)}
            className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)", color: "var(--text-3)" }}
          >
            <span style={{ color: typeMeta?.color ?? "#c9a84c" }}>◈</span>
            Chat with {agent.name}
          </button>
        )}

        {/* Tx feedback */}
        {txHash && (
          <div className="rounded-lg p-3 text-sm font-mono" style={{ background: "#22c55e0f", border: "1px solid #22c55e40", color: "#4ade80" }}>
            ✓ Paid · {txHash}
          </div>
        )}
        {error && (
          <div className="rounded-lg p-3 text-sm font-mono flex items-center justify-between" style={{ background: "#ef44440f", border: "1px solid #ef444440", color: "#f87171" }}>
            <span>◈ {error}</span>
            <button onClick={() => setError(null)} className="underline ml-2">retry</button>
          </div>
        )}

        <p className="text-xs font-mono" style={{ color: "var(--text-6)" }}>{agent.address}</p>
      </div>
    </>
  );
}

export default function MarketplacePage() {
  const safe = STATIC_AGENTS.filter(a => a.isQuantumSafe);
  const flagged = STATIC_AGENTS.filter(a => !a.isQuantumSafe);

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
      <div className="mb-8">
        <h1 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}>
          Agent Marketplace
        </h1>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <span className="text-sm font-mono" style={{ color: "var(--text-3)" }}>
          {safe.length} quantum-safe
        </span>
        <span className="text-sm font-mono" style={{ color: "var(--text-6)" }}>·</span>
        <span className="text-sm font-mono" style={{ color: "#f87171" }}>
          {flagged.length} flagged
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--border-1)" }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {STATIC_AGENTS.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
