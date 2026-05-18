"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Shield, Zap, Code2, ArrowRight } from "lucide-react";
import { ConnectButton } from "../../components/ConnectButton";
import { GlowCard } from "../../components/ui/GlowCard";
import { Badge } from "../../components/ui/Badge";

const FREQUENCIES = [
  { value: "HFT",             label: "High-Frequency",          sub: "< 1 hour holding" },
  { value: "Intraday",        label: "Intraday",                sub: "1h – 4h holding" },
  { value: "MediumFrequency", label: "Medium-Frequency",        sub: "4h – daily" },
  { value: "Swing",           label: "Swing",                   sub: "Multi-day" },
  { value: "Macro",           label: "Macro",                   sub: "Weeks+" },
];

const STEPS = [
  { n: "1", title: "Register + Stake", body: "Stake 100 USDC on Arc. Bond is returned when you deactivate. Slashed only for fraudulent ZK proofs." },
  { n: "2", title: "Run Provider Agent", body: "Your agent commits signal hashes on-chain before market moves. Encrypt signals to subscriber agents." },
  { n: "3", title: "Get Paid Per Signal", body: "$0.01 USDC per signal delivered. Revenue accrues in USYC for yield between payouts. Claim anytime." },
];

export default function ProviderOnboarding() {
  const { address, isConnected } = useAccount();
  const [form, setForm] = useState({ name: "", description: "", frequency: "Swing", agent_public_key: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${url}/providers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, address }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 relative z-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12"
      >
        <Badge variant="green" className="mb-4">For Signal Providers</Badge>
        <h1 className="text-4xl font-bold mb-3">
          Sell your edge.<br />
          <span className="text-gradient">Keep your strategy.</span>
        </h1>
        <p className="text-gray-500 max-w-xl leading-relaxed">
          Stake 100 USDC. Your strategy stays private — subscribers&apos; agents execute signals they can&apos;t read.
          Track record verified by ZK proofs. Revenue in USDC, yield in USYC.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8">
        {/* Left: steps + info */}
        <div className="space-y-6">
          {/* How it works steps */}
          <div className="space-y-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <GlowCard className="flex items-start gap-4 p-4">
                  <div className="w-7 h-7 rounded-lg bg-[rgba(0,255,135,0.1)] border border-[rgba(0,255,135,0.2)] flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-[#00ff87]">{s.n}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm mb-0.5">{s.title}</div>
                    <div className="text-xs text-gray-500 leading-relaxed">{s.body}</div>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </div>

          {/* Revenue estimate */}
          <GlowCard className="p-5">
            <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Zap size={14} className="text-[#00ff87]" />
              Revenue estimate
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { signals: "4/day", monthly: "$1.20/mo" },
                { signals: "24/day", monthly: "$7.20/mo" },
                { signals: "96/day", monthly: "$28.80/mo" },
              ].map((r) => (
                <div key={r.signals} className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.05]">
                  <div className="stat-num text-sm text-[#00ff87]">{r.monthly}</div>
                  <div className="text-[9px] text-gray-600 mt-1 uppercase tracking-widest">{r.signals} signal</div>
                  <div className="text-[9px] text-gray-700">@ $0.01/signal × subscribers</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-3">Per subscriber. Scale linearly with subscriber count.</p>
          </GlowCard>

          {/* CLI command */}
          <GlowCard className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-white mb-3">
              <Code2 size={13} className="text-gray-400" />
              Generate your agent keypair
            </div>
            <div className="bg-[#080a0f] border border-white/[0.06] rounded-lg p-3 font-mono text-[11px] text-[#00ff87] overflow-x-auto">
              python -c &quot;from agents.shared.crypto import generate_keypair; sk, pk = generate_keypair(); print(&apos;SK:&apos;, sk); print(&apos;PK:&apos;, pk)&quot;
            </div>
            <p className="text-[10px] text-gray-600 mt-2">Set SK as PROVIDER_SIGNING_KEY in .env. Paste PK below.</p>
          </GlowCard>
        </div>

        {/* Right: registration form */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <AnimatePresence mode="wait">
            {status === "done" ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <GlowCard className="p-8 text-center flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[rgba(0,255,135,0.1)] border border-[rgba(0,255,135,0.3)] flex items-center justify-center">
                    <CheckCircle2 size={26} className="text-[#00ff87]" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-lg mb-1">Registered</div>
                    <p className="text-gray-500 text-sm">Now stake 100 USDC on Arc to activate your listing.</p>
                  </div>
                  <div className="w-full space-y-2 text-left">
                    {[
                      "Approve 100 USDC on ProviderRegistry contract",
                      "Call registry.register(...) to lock stake",
                      "Start: python -m agents.provider.agent",
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
                        <ArrowRight size={11} className="text-[#00ff87] mt-0.5 shrink-0" />
                        {step}
                      </div>
                    ))}
                  </div>
                </GlowCard>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <GlowCard className="p-6">
                  <div className="text-sm font-semibold text-white mb-5">Register Provider</div>

                  {!isConnected ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <p className="text-sm text-gray-500 text-center">Connect your wallet to register</p>
                      <ConnectButton />
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Strategy Name</label>
                        <input
                          required
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[rgba(0,255,135,0.35)] transition-colors"
                          placeholder="e.g. ETH RSI Momentum"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
                        <textarea
                          required
                          value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })}
                          rows={3}
                          className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[rgba(0,255,135,0.35)] transition-colors resize-none"
                          placeholder="What market conditions does your strategy target? (Don't reveal the logic itself.)"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">Signal Frequency</label>
                        <div className="grid grid-cols-1 gap-1.5">
                          {FREQUENCIES.map((f) => (
                            <button
                              key={f.value}
                              type="button"
                              onClick={() => setForm({ ...form, frequency: f.value })}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all duration-150 text-xs ${
                                form.frequency === f.value
                                  ? "bg-[rgba(0,255,135,0.07)] border-[rgba(0,255,135,0.25)] text-white"
                                  : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.12]"
                              }`}
                            >
                              <span className="font-medium">{f.label}</span>
                              <span className={form.frequency === f.value ? "text-[#00ff87]" : "text-gray-600"}>{f.sub}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Agent Public Key</label>
                        <input
                          required
                          value={form.agent_public_key}
                          onChange={(e) => setForm({ ...form, agent_public_key: e.target.value })}
                          className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2.5 text-xs font-mono text-white placeholder-gray-700 focus:outline-none focus:border-[rgba(0,255,135,0.35)] transition-colors"
                          placeholder="64 hex chars (PK from keypair generation above)"
                        />
                      </div>

                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/[0.04] border border-amber-500/[0.15]">
                        <Shield size={11} className="text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-amber-500/80 leading-relaxed">
                          Registration requires staking <strong>100 USDC</strong> on Arc. Returned on deactivation. Slashed only for fraudulent ZK proofs.
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={status === "submitting"}
                        className="w-full py-3 rounded-lg text-sm font-bold btn-primary disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {status === "submitting" ? "Registering…" : <>Register Provider <ArrowRight size={14} /></>}
                      </button>

                      {status === "error" && (
                        <p className="text-red-400 text-xs text-center">Registration failed — check your inputs.</p>
                      )}
                    </form>
                  )}
                </GlowCard>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
