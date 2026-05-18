"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useSubscribe } from "../lib/onchain";
import { isAddressesConfigured } from "../lib/contracts";

interface Provider { address: string; name: string; }

export function SubscribeModal({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const { address } = useAccount();
  const chainConfigured = isAddressesConfigured();
  const [form, setForm] = useState({
    buyer_agent_pubkey: "",
    buyer_agent_address: "",
    initial_float_usdc:   "10",
    max_position_bps:  500,
    max_leverage_bps:  10000,
    daily_var_bps:     300,
  });
  const [backendStatus, setBackendStatus] = useState<"idle"|"submitting"|"done"|"error">("idle");
  const { state: chainStatus, error: chainError, txHash, submit: subscribeOnchain } = useSubscribe();

  const status: "idle"|"submitting"|"done"|"error" =
    chainStatus === "approving" || chainStatus === "submitting" || backendStatus === "submitting"
      ? "submitting"
      : chainStatus === "error" || backendStatus === "error"
      ? "error"
      : (chainConfigured ? chainStatus === "done" : backendStatus === "done") ? "done" : "idle";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;

    if (chainConfigured) {
      const agent = form.buyer_agent_address.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(agent)) {
        setBackendStatus("error");
        return;
      }
      await subscribeOnchain({
        provider: provider.address as `0x${string}`,
        agent: agent as `0x${string}`,
        buyerAgentPubKeyHex: form.buyer_agent_pubkey,
        maxPositionBps: form.max_position_bps,
        maxLeverageBps: form.max_leverage_bps,
        dailyVarBps: form.daily_var_bps,
        initialFloatUsdc: form.initial_float_usdc,
      });
    }
    setBackendStatus("submitting");
    try {
      const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const res = await fetch(`${url}/buyer/subscribe`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          provider_address: provider.address,
          buyer_address: address,
          buyer_agent_pubkey: form.buyer_agent_pubkey,
          max_position_bps: form.max_position_bps,
          max_leverage_bps: form.max_leverage_bps,
          daily_var_bps: form.daily_var_bps,
        }),
      });
      setBackendStatus(res.ok ? "done" : "error");
    } catch { setBackendStatus("error"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="relative w-full max-w-sm rounded-2xl border border-[#0f1a11] bg-[#0c110d] p-6 shadow-2xl">

        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="mb-1 font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">subscribe</p>
            <h2 className="text-sm font-semibold text-white">{provider.name}</h2>
          </div>
          <button onClick={onClose} className="font-mono text-[#1e2d20] hover:text-[#3d5040] transition-colors text-lg leading-none">×</button>
        </div>

        {status === "done" ? (
          <div>
            <p className="mb-3 font-mono text-sm text-[#52e07c]">subscribed ✓</p>
            <p className="mb-5 text-sm text-[#4a5e4e] leading-relaxed">
              Start your buyer agent to receive signals.
              Your dashboard shows positions and PnL — never signal content.
            </p>
            {txHash && (
              <div className="mb-3 break-all font-mono text-[10px] text-[#2d3d30]">tx: {txHash}</div>
            )}
            <code className="block w-full rounded-lg border border-[#0f1a11] bg-[#090c0a] px-3 py-2 font-mono text-[10px] text-[#2d3d30]">
              python -m agents.buyer.agent
            </code>
            <button onClick={onClose}
              className="mt-4 w-full rounded-lg border border-[#162018] py-2 font-mono text-xs text-[#2d3d30] hover:text-[#4a5e4e] transition-colors">
              close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">

            <div>
              <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">
                Buyer agent public key
              </label>
              <input required value={form.buyer_agent_pubkey}
                onChange={e => setForm({...form, buyer_agent_pubkey: e.target.value})}
                className="w-full rounded-xl border border-[#162018] bg-[#090c0a] px-3 py-2.5 font-mono text-xs text-[#c4d4c6] placeholder-[#1e2d20] focus:border-[#52e07c]/30 focus:outline-none transition-colors"
                placeholder="64 hex chars (NaCl box pubkey)" />
            </div>

            {chainConfigured && (
              <>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">
                    Buyer agent EVM address
                  </label>
                  <input required value={form.buyer_agent_address}
                    onChange={e => setForm({...form, buyer_agent_address: e.target.value})}
                    className="w-full rounded-xl border border-[#162018] bg-[#090c0a] px-3 py-2.5 font-mono text-xs text-[#c4d4c6] placeholder-[#1e2d20] focus:border-[#52e07c]/30 focus:outline-none transition-colors"
                    placeholder="0x... (agent's wallet, authorized to call processSignalPayment)" />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">
                    Initial float (USDC)
                  </label>
                  <input required type="number" step="0.01" min="0.1" value={form.initial_float_usdc}
                    onChange={e => setForm({...form, initial_float_usdc: e.target.value})}
                    className="w-full rounded-xl border border-[#162018] bg-[#090c0a] px-3 py-2.5 font-mono text-xs text-[#c4d4c6] focus:border-[#52e07c]/30 focus:outline-none transition-colors"
                    placeholder="10" />
                  <p className="mt-1 font-mono text-[10px] text-[#1e2d20]">
                    funds signal nanopayments. ~1000 signals at $0.01 each per $10.
                  </p>
                </div>
              </>
            )}

            {/* risk sliders */}
            <div>
              <label className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">Risk bounds</label>
              <div className="flex flex-col gap-3">
                {[
                  { label:"max position",  key:"max_position_bps",  min:50,    max:5000,  step:50,    div:100,   suffix:"%" },
                  { label:"max leverage",  key:"max_leverage_bps",  min:10000, max:50000, step:10000, div:10000, suffix:"x" },
                  { label:"daily var",     key:"daily_var_bps",     min:50,    max:2000,  step:50,    div:100,   suffix:"%" },
                ].map(f => {
                  const val = form[f.key as keyof typeof form] as number;
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-4">
                      <span className="w-24 shrink-0 font-mono text-[10px] text-[#2d3d30]">{f.label}</span>
                      <input type="range" min={f.min} max={f.max} step={f.step} value={val}
                        onChange={e => setForm({...form, [f.key]: Number(e.target.value)})}
                        className="flex-1 accent-[#52e07c] h-px" />
                      <span className="w-10 text-right font-mono text-xs text-[#52e07c]">
                        {(val / f.div).toFixed(f.div === 10000 ? 1 : 0)}{f.suffix}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-[#162018] py-2.5 font-mono text-xs text-[#2d3d30] hover:text-[#4a5e4e] transition-colors">
                cancel
              </button>
              <button type="submit" disabled={status === "submitting"}
                className="flex-1 rounded-lg border border-[#52e07c]/30 bg-[#52e07c]/05 py-2.5 font-mono text-xs text-[#52e07c] hover:bg-[#52e07c]/10 hover:border-[#52e07c]/50 transition-all disabled:opacity-40">
                {status === "submitting"
                  ? (chainStatus === "approving" ? "approving..." : "subscribing...")
                  : "subscribe →"}
              </button>
            </div>

            {status === "error" && (
              <p className="font-mono text-[10px] text-red-400/70 break-all">
                failed{chainError ? `: ${chainError}` : ""}.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
