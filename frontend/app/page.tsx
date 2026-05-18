"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Zap, Lock, TrendingUp, Activity } from "lucide-react";
import { GlowCard } from "../components/ui/GlowCard";
import { LiveTicker } from "../components/LiveTicker";
import { AgentFlowDiagram } from "../components/AgentFlowDiagram";

const FEATURES = [
  {
    icon: Shield,
    title: "ZK-Proven Track Records",
    body: "Win rates and returns are verified on-chain with Groth16 proofs. Not screenshots. Not self-reported.",
    color: "text-[#00ff87]",
    bg: "bg-[rgba(0,255,135,0.08)]",
  },
  {
    icon: Lock,
    title: "Encrypted Execution",
    body: "Signals are encrypted to your buyer agent's public key. You see positions and PnL — never raw signal logic.",
    color: "text-[#00c2ff]",
    bg: "bg-[rgba(0,194,255,0.08)]",
  },
  {
    icon: Zap,
    title: "Arc Nanopayments",
    body: "$0.01 per signal. No volatile gas. Instant USDC settlement on Arc's sub-second L1.",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  {
    icon: Activity,
    title: "Commit-Reveal Integrity",
    body: "Every signal hash-committed on-chain before market moves. Backdating is cryptographically impossible.",
    color: "text-[#00ff87]",
    bg: "bg-[rgba(0,255,135,0.08)]",
  },
  {
    icon: TrendingUp,
    title: "Risk-Bounded Agent",
    body: "Set position limits, leverage caps, daily VaR, and allowed assets. Agent rejects anything outside bounds.",
    color: "text-[#00c2ff]",
    bg: "bg-[rgba(0,194,255,0.08)]",
  },
  {
    icon: Shield,
    title: "Provably Non-Fakeable",
    body: "Provider bonds slashed for fraudulent proofs. Cryptographic guarantees, not trust.",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
];

const STATS = [
  { label: "Per-signal cost", value: "$0.01", sub: "in USDC on Arc" },
  { label: "Finality", value: "<1s", sub: "sub-second commits" },
  { label: "ZK proof time", value: "~8s", sub: "Groth16 locally" },
  { label: "Strategy privacy", value: "100%", sub: "never revealed" },
];

export default function Home() {
  return (
    <div className="relative z-10">

      {/* ── HERO ── */}
      <section
        className="relative flex flex-col items-center justify-center px-6 text-center overflow-hidden pt-20 pb-20"
        style={{ minHeight: "calc(100vh - 56px)" }}
      >
        {/* glow orbs */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,255,135,0.07) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 30% 70%, rgba(0,194,255,0.05) 0%, transparent 70%)",
          }}
        />

        {/* live badge */}
        <div className="relative mb-6 inline-flex items-center gap-2 rounded-full border border-[rgba(0,255,135,0.2)] bg-[rgba(0,255,135,0.06)] px-4 py-1.5 text-[11px] font-semibold text-[#00ff87] uppercase tracking-widest">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00ff87] animate-pulse" />
          Powered by Arc · Settled in USDC
        </div>

        {/* headline */}
        <h1 className="relative mb-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] max-w-4xl">
          Alpha you can{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #00ff87 0%, #00c2ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            verify.
          </span>
          <br />
          Strategies you never see.
        </h1>

        {/* sub */}
        <p className="relative mb-8 max-w-2xl text-lg text-gray-400 leading-relaxed">
          Agent-to-agent signal marketplace. Track records are ZK-proven on Arc.
          Your autonomous agent executes trades — you see PnL, never the raw signal.
          Reverse-engineering becomes computationally intractable.
        </p>

        {/* CTAs */}
        <div className="relative flex flex-wrap gap-3 justify-center mb-12">
          <Link
            href="/marketplace"
            className="flex items-center gap-2 rounded-lg bg-[#00ff87] px-7 py-3 text-sm font-bold text-black transition-all hover:bg-[#00e87a] hover:shadow-[0_0_30px_rgba(0,255,135,0.35)]"
          >
            Browse Providers <ArrowRight size={15} />
          </Link>
          <Link
            href="/provider"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-7 py-3 text-sm font-semibold text-gray-300 transition-all hover:border-white/20 hover:text-white"
          >
            List Your Strategy
          </Link>
        </div>

        {/* stats strip */}
        <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-white/[0.06]">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.06]">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1 bg-white/[0.02] px-4 py-5">
                <div className="font-mono text-2xl font-bold text-[#00ff87]">{s.value}</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500">{s.label}</div>
                <div className="text-[10px] text-gray-700">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ticker */}
        <div className="relative mt-10 w-full">
          <LiveTicker />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold mb-3">How it works</h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Two autonomous agents. One encrypted channel. Zero signal leakage.
          </p>
        </div>
        <AgentFlowDiagram />
      </section>

      {/* ── FEATURES ── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold mb-3">Built different</h2>
          <p className="text-gray-500">Cryptographic guarantees. Not vibes.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <GlowCard key={f.title} className="flex flex-col gap-3 p-5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${f.bg}`}>
                <f.icon size={16} className={f.color} />
              </div>
              <div>
                <div className="mb-1 font-semibold text-white">{f.title}</div>
                <div className="text-sm leading-relaxed text-gray-500">{f.body}</div>
              </div>
            </GlowCard>
          ))}
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="px-6 py-24">
        <div
          className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/[0.06] p-12 text-center"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,255,135,0.04) 0%, rgba(0,194,255,0.04) 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(0,255,135,0.08) 0%, transparent 70%)",
            }}
          />
          <h2 className="relative mb-4 text-4xl font-bold">
            Sell your edge.
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #00ff87 0%, #00c2ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Keep your strategy.
            </span>
          </h2>
          <p className="relative mb-8 text-gray-400">
            Stake 100 USDC. Subscribers pay $0.01/signal. Revenue accrues in USYC between payouts.
            Your alpha stays yours — cryptographically.
          </p>
          <div className="relative flex flex-wrap justify-center gap-3">
            <Link
              href="/provider"
              className="flex items-center gap-2 rounded-lg bg-[#00ff87] px-7 py-3 text-sm font-bold text-black hover:bg-[#00e87a] hover:shadow-[0_0_30px_rgba(0,255,135,0.35)] transition-all"
            >
              Register as Provider <ArrowRight size={14} />
            </Link>
            <Link
              href="/marketplace"
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-7 py-3 text-sm font-semibold text-gray-300 hover:border-white/20 hover:text-white transition-all"
            >
              Explore Marketplace
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.04] px-6 py-8 text-center text-[11px] text-gray-700">
        <span className="font-mono">zkRoute</span> · Built on Arc · Payments in USDC · ZK proofs via Groth16
      </footer>

    </div>
  );
}
