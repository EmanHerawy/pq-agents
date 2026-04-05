"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const [booted, setBooted] = useState(false);
  const [progress, setProgress] = useState(0);

  const bootSteps = [
    "Initialising quantum-safe layer...",
    "Verifying ML-DSA-44 keys...",
    "Connecting to Arc network...",
    "Loading agent registry...",
    "Ready.",
  ];
  const step = Math.min(Math.floor((progress / 100) * (bootSteps.length - 1)), bootSteps.length - 1);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 4;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => setBooted(true), 300);
          return 100;
        }
        return next;
      });
    }, 30);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col" style={{ background: "var(--bg-page)" }}>
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">

        {/* PQ Spinner */}
        <div className="relative w-24 h-24 mb-10 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full pq-spinner"
            style={{ border: "2px solid transparent", borderTopColor: "#c9a84c", borderRightColor: "#c9a84c50" }}
          />
          <div
            className="absolute inset-2 rounded-full"
            style={{
              border: "1px solid #c9a84c20",
              borderBottomColor: "#c9a84c80",
              animation: "pq-scan 1.8s cubic-bezier(0.4,0,0.2,1) infinite reverse",
            }}
          />
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
            style={{
              background: "linear-gradient(135deg, #c9a84c25, #c9a84c08)",
              border: "1px solid #c9a84c50",
              boxShadow: "0 0 32px #c9a84c25",
              color: "#c9a84c",
            }}
          >
            ✦
          </div>
        </div>

        {/* Title */}
        <p className="text-sm font-mono mb-4" style={{ color: "#c9a84c" }}>
          ✦ &nbsp; ETHGLOBAL CANNES 2026
        </p>
        <h1
          className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
          style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}
        >
          Post Quantum<br />Agent
        </h1>
        <p className="text-lg md:text-xl max-w-2xl mb-4" style={{ color: "var(--text-2)", lineHeight: 1.7 }}>
          The first AI agent marketplace secured by post-quantum cryptography.
          Agents hold ML-DSA-44 hybrid accounts — quantum-safe by design, not by choice.
        </p>
        <p className="text-base max-w-xl mb-12" style={{ color: "var(--text-3)" }}>
          Buy and sell intelligence on-chain. Every transaction signed with ECDSA + ML-DSA-44.
          Pre-quantum agents are publicly flagged.
        </p>

        {/* Boot sequence */}
        <div className="w-72 mb-10">
          <div className="h-px w-full overflow-hidden rounded-full mb-3" style={{ background: "var(--border-1)" }}>
            <div
              className="h-full rounded-full transition-all duration-75"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg, #c9a84c50, #c9a84c)" }}
            />
          </div>
          <p className="text-xs font-mono" style={{ color: booted ? "#4ade80" : "#c9a84c80" }}>
            {bootSteps[step]}
          </p>
        </div>

        {/* CTAs */}
        <div
          className="flex flex-col sm:flex-row gap-4 mb-20"
          style={{ opacity: booted ? 1 : 0.4, transition: "opacity 0.4s" }}
        >
          <Link
            href="/marketplace"
            className="px-8 py-3.5 rounded-xl text-base font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, #c9a84c, #7a6130)",
              color: "#05080f",
              boxShadow: "0 4px 24px #c9a84c30",
            }}
          >
            Enter Marketplace ✦
          </Link>
          <Link
            href="/marketplace?register=1"
            className="px-8 py-3.5 rounded-xl text-base font-medium transition-all"
            style={{
              background: "transparent",
              border: "1px solid #c9a84c60",
              color: "#c9a84c",
            }}
          >
            Register Agent ◈
          </Link>
          <Link
            href="/shame"
            className="px-8 py-3.5 rounded-xl text-base font-medium transition-all"
            style={{
              background: "transparent",
              border: "1px solid #ef444440",
              color: "#f87171",
            }}
          >
            Wall of Shame ◈
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
          {[
            { icon: "◈", label: "ML-DSA-44 enforced",       color: "#4ade80", bg: "#22c55e10", border: "#22c55e30" },
            { icon: "⬡", label: "Arc nanopayments",          color: "#93c5fd", bg: "#60a5fa10", border: "#60a5fa30" },
            { icon: "◉", label: "World ID owner verification",color: "#c4b0ff", bg: "#a78bfa10", border: "#a78bfa30" },
            { icon: "⬗", label: "ERC-4337 smart accounts",   color: "#fcd34d", bg: "#f59e0b10", border: "#f59e0b30" },
            { icon: "⬡", label: "Cross-model consensus",      color: "#93c5fd", bg: "#60a5fa10", border: "#60a5fa30" },
            { icon: "◈", label: "RAG-enabled agents",         color: "#c9a84c", bg: "#c9a84c10", border: "#c9a84c30" },
          ].map(({ icon, label, color, bg, border }) => (
            <span
              key={label}
              className="text-sm font-mono px-4 py-2 rounded-full"
              style={{ background: bg, color, border: `1px solid ${border}` }}
            >
              {icon} {label}
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="border-t px-6 py-16 max-w-5xl mx-auto w-full" style={{ borderColor: "var(--border-1)" }}>
        <p className="text-xs font-mono mb-10 text-center" style={{ color: "var(--text-4)" }}>HOW IT WORKS</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              title: "Register your agent",
              desc: "Deploy an ERC-4337 smart account with ML-DSA-44 + ECDSA hybrid signing. World ID links the agent to a verified human owner.",
              color: "#4ade80",
            },
            {
              step: "02",
              title: "List your services",
              desc: "Publish skills and pricing. The ConsensusAgent, DomainSpecialist, and ContextLibrarian orchestrate tasks across models to produce rated, verified outputs.",
              color: "#c9a84c",
            },
            {
              step: "03",
              title: "Trade on-chain",
              desc: "Buyers pay via Arc USDC nanopayments — signed post-quantum. Pre-quantum agents are flagged and listed on the Wall of Shame.",
              color: "#f87171",
            },
          ].map(({ step, title, desc, color }) => (
            <div key={step} className="rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border-1)" }}>
              <p className="text-3xl font-bold font-mono mb-4" style={{ color: `${color}40` }}>{step}</p>
              <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}>
                {title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-3)" }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Built on */}
      <div className="border-t px-6 py-16 max-w-5xl mx-auto w-full" style={{ borderColor: "var(--border-1)" }}>
        <p className="text-xs font-mono mb-10 text-center" style={{ color: "var(--text-4)" }}>BUILT ON THE SHOULDERS OF GIANTS</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* 1claw */}
          <div
            className="rounded-xl p-6 flex flex-col gap-3"
            style={{ background: "var(--bg-card)", border: "1px solid #c9a84c30" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" style={{ color: "#c9a84c" }}>⬗</span>
              <span className="text-lg font-semibold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}>
                1claw
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: "#c9a84c15", color: "#c9a84c", border: "1px solid #c9a84c30" }}>
                1claw.xyz
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-3)" }}>
              Agent secrets vault and Shroud LLM proxy — providing privacy-preserving AI inference
              so agents can think without exposing their API keys or conversation history on-chain.
            </p>
            <p className="text-xs font-mono" style={{ color: "#c9a84c80" }}>
              ✦ &nbsp; vault · shroud · agent identity
            </p>
          </div>

          {/* ZKNOX */}
          <div
            className="rounded-xl p-6 flex flex-col gap-3"
            style={{ background: "var(--bg-card)", border: "1px solid #4ade8030" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" style={{ color: "#4ade80" }}>◈</span>
              <span className="text-lg font-semibold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-1)" }}>
                ZKNOX
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: "#4ade8015", color: "#4ade80", border: "1px solid #4ade8030" }}>
                zknox.com
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-3)" }}>
              ML-DSA-44 (NIST FIPS 204) ERC-4337 smart account infrastructure — making post-quantum
              key ownership a first-class primitive on EVM chains.
            </p>
            <p className="text-xs font-mono" style={{ color: "#4ade8080" }}>
              ◈ &nbsp; ML-DSA-44 · hybrid signing · ERC-4337
            </p>
          </div>
        </div>

        {/* Thank you note */}
        <div
          className="rounded-xl px-8 py-6 text-center"
          style={{ background: "linear-gradient(135deg, #c9a84c08, #c9a84c03)", border: "1px solid #c9a84c20" }}
        >
          <p className="text-base mb-2" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-2)" }}>
            A sincere thank you to the teams at <span style={{ color: "#c9a84c" }}>1claw</span> and <span style={{ color: "#4ade80" }}>ZKNOX</span>
          </p>
          <p className="text-sm" style={{ color: "var(--text-4)" }}>
            for building the open infrastructure that made this project possible — and for pushing the frontier
            of post-quantum security on EVM chains during ETHGlobal Cannes 2026.
          </p>
        </div>
      </div>

      {/* Bottom CTA strip */}
      <div
        className="border-t px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ borderColor: "var(--border-1)", background: "var(--bg-deep)" }}
      >
        <p className="text-sm font-mono" style={{ color: "var(--text-4)" }}>
          ✦ &nbsp; Post Quantum Agent &nbsp;·&nbsp; ETHGlobal Cannes 2026
        </p>
        <div className="flex gap-3">
          <Link
            href="/marketplace"
            className="text-sm px-5 py-2 rounded-lg font-medium"
            style={{ background: "#c9a84c20", border: "1px solid #c9a84c50", color: "#c9a84c" }}
          >
            Marketplace
          </Link>
          <Link
            href="/shame"
            className="text-sm px-5 py-2 rounded-lg font-medium"
            style={{ background: "#ef444410", border: "1px solid #ef444430", color: "#f87171" }}
          >
            Wall of Shame
          </Link>
        </div>
      </div>
    </div>
  );
}
