"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { X, Shield, Zap, CheckCircle2 } from "lucide-react";
import { shortAddr } from "../lib/utils";

interface Provider {
  address: string;
  name: string;
}

interface Props {
  provider: Provider;
  onClose: () => void;
}

export function SubscribeModal({ provider, onClose }: Props) {
  const { address } = useAccount();
  const [form, setForm] = useState({
    buyer_agent_pubkey: "",
    max_position_bps: 500,
    max_leverage_bps: 10000,
    daily_var_bps: 300,
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setStatus("submitting");
    const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${url}/buyer/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_address: provider.address,
          buyer_address: address,
          ...form,
        }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl overflow-hidden"
        >
          {/* Top glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-gradient-to-r from-transparent via-[#00ff87]/50 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div>
              <div className="font-semibold text-white text-sm">Subscribe to {provider.name}</div>
              <div className="text-[10px] text-gray-600 font-mono mt-0.5">{shortAddr(provider.address)}</div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] text-gray-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {status === "done" ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center text-center gap-4 py-10 px-6"
            >
              <div className="w-12 h-12 rounded-full bg-[rgba(0,255,135,0.1)] border border-[rgba(0,255,135,0.3)] flex items-center justify-center">
                <CheckCircle2 size={22} className="text-[#00ff87]" />
              </div>
              <div>
                <div className="font-semibold text-white mb-1">Subscribed</div>
                <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
                  Start your buyer agent to receive signals. Your dashboard shows positions and PnL — never raw signal content.
                </p>
              </div>
              <code className="text-[10px] text-gray-600 bg-white/[0.03] border border-white/[0.06] rounded px-3 py-2 w-full text-left">
                python -m agents.buyer.agent
              </code>
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-sm text-gray-300 transition-colors"
              >
                Close
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Pubkey */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Buyer Agent Public Key <span className="text-gray-600">(NaCl Box · 32B hex)</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.buyer_agent_pubkey}
                  onChange={(e) => setForm({ ...form, buyer_agent_pubkey: e.target.value })}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-gray-700 focus:outline-none focus:border-[rgba(0,255,135,0.35)] transition-colors"
                  placeholder="64 hex chars…"
                />
              </div>

              {/* Risk bounds */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
                  <Shield size={11} />
                  Risk Bounds
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Max Position", key: "max_position_bps", suffix: "%", divisor: 100, min: 100, max: 2000, step: 50 },
                    { label: "Max Leverage", key: "max_leverage_bps", suffix: "x", divisor: 10000, min: 10000, max: 50000, step: 10000 },
                    { label: "Daily VaR", key: "daily_var_bps", suffix: "%", divisor: 100, min: 50, max: 1000, step: 50 },
                  ].map((field) => {
                    const val = form[field.key as keyof typeof form] as number;
                    return (
                      <div key={field.key} className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
                        <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5">{field.label}</div>
                        <input
                          type="range"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={val}
                          onChange={(e) => setForm({ ...form, [field.key]: Number(e.target.value) })}
                          className="w-full accent-[#00ff87] h-1"
                        />
                        <div className="stat-num text-xs text-[#00ff87] mt-1">
                          {(val / field.divisor).toFixed(field.divisor === 10000 ? 1 : 0)}{field.suffix}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Info box */}
              <div className="flex items-start gap-2 bg-white/[0.02] border border-white/[0.05] rounded-lg p-3">
                <Zap size={11} className="text-[#00ff87] mt-0.5 shrink-0" />
                <p className="text-[10px] text-gray-600 leading-relaxed">
                  Your agent enforces these limits on every decrypted signal. If a provider suggests 10x DOGE and you set max 1x ETH/BTC, the signal is silently rejected.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] text-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-[#00ff87] hover:bg-[#00e87a] disabled:opacity-50 text-black transition-all hover:shadow-green-sm"
                >
                  {status === "submitting" ? "Subscribing…" : "Subscribe"}
                </button>
              </div>
              {status === "error" && (
                <p className="text-red-400 text-[10px] text-center">Failed — check inputs or backend connection.</p>
              )}
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
