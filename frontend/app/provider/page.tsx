"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { ConnectButton } from "../../components/ConnectButton";
import { useProviderRegister } from "../../lib/onchain";
import { isAddressesConfigured } from "../../lib/contracts";

const FREQS = [
  { v:"HFT",             l:"hft",       s:"< 1h"      },
  { v:"Intraday",        l:"intraday",  s:"1h – 4h"   },
  { v:"MediumFrequency", l:"med-freq",  s:"4h – daily" },
  { v:"Swing",           l:"swing",     s:"multi-day"  },
  { v:"Macro",           l:"macro",     s:"weeks+"     },
];

export default function ProviderPage() {
  const { address, isConnected } = useAccount();
  const [form, setForm] = useState({ name:"", description:"", frequency:"Swing", agent_public_key:"" });
  const [backendStatus, setBackendStatus] = useState<"idle"|"submitting"|"done"|"error">("idle");
  const chainConfigured = isAddressesConfigured();
  const { state: chainStatus, error: chainError, txHash, submit: submitOnchain } = useProviderRegister();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;

    if (chainConfigured) {
      // 1. on-chain register (stakes 100 USDC)
      await submitOnchain({
        name: form.name,
        description: form.description,
        frequency: form.frequency,
        agentPubKeyHex: form.agent_public_key,
      });
    }
    // 2. mirror to backend so the marketplace can display the provider immediately
    setBackendStatus("submitting");
    try {
      const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const res = await fetch(`${url}/providers/register`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, address }),
      });
      setBackendStatus(res.ok ? "done" : "error");
    } catch { setBackendStatus("error"); }
  };

  const status: "idle"|"submitting"|"done"|"error" =
    chainStatus === "approving" || chainStatus === "submitting" || backendStatus === "submitting"
      ? "submitting"
      : chainStatus === "error" || backendStatus === "error"
      ? "error"
      : (chainConfigured ? chainStatus === "done" : backendStatus === "done") ? "done" : "idle";

  return (
    <div className="min-h-screen bg-[#090c0a] text-[#d4ddd6]">

      <nav className="border-b border-[#0f1a11] px-8 py-4 flex items-center justify-between">
        <Link href="/" className="font-mono text-xs text-[#2d3d30] hover:text-[#52e07c] transition-colors">← zkRoute</Link>
        <ConnectButton />
      </nav>

      <div className="mx-auto max-w-lg px-8 py-14">

        <div className="mb-10">
          <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">for signal providers</p>
          <h1 className="mb-2 text-2xl font-bold text-white">List your strategy</h1>
          <p className="text-sm text-[#4a5e4e] leading-relaxed">
            Stake 100 USDC. Keep your strategy private forever.
            Subscribers pay $0.01/signal. Revenue accrues in USYC between payouts.
          </p>
        </div>

        {/* how */}
        <div className="mb-10 flex flex-col gap-4 border-b border-[#0f1a11] pb-10">
          {[
            { n:"01", t:"stake + register",    d:"100 USDC bond on Arc. Returned on deactivation." },
            { n:"02", t:"run provider agent",  d:"Agent commits signal hashes before market moves." },
            { n:"03", t:"get paid per signal", d:"$0.01 USDC per signal delivered to subscribers." },
          ].map(s => (
            <div key={s.n} className="flex gap-4">
              <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] text-[#1e2d20]">{s.n}</span>
              <div>
                <div className="text-sm font-medium text-[#c4d4c6]">{s.t}</div>
                <div className="text-sm text-[#3a5040]">{s.d}</div>
              </div>
            </div>
          ))}
        </div>

        {status === "done" ? (
          <div className="rounded-2xl border border-[#0f1a11] bg-[#0c110d] p-8">
            <p className="mb-3 font-mono text-sm text-[#52e07c]">registered ✓</p>
            {chainConfigured ? (
              <p className="mb-6 text-sm text-[#4a5e4e] leading-relaxed">
                100 USDC staked on Arc. Your listing is live in the marketplace.
              </p>
            ) : (
              <p className="mb-6 text-sm text-[#4a5e4e] leading-relaxed">
                Backend listing created. Set <code className="text-[#52e07c]">NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS</code> to enable the on-chain stake step.
              </p>
            )}
            {txHash && (
              <div className="mb-4 break-all font-mono text-[10px] text-[#2d3d30]">tx: {txHash}</div>
            )}
            <div className="flex flex-col gap-1.5 font-mono text-[11px] text-[#2d3d30]">
              <div>next: python -m agents.provider.agent</div>
            </div>
          </div>
        ) : !isConnected ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-[#4a5e4e]">Connect wallet to register.</p>
            <ConnectButton />
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-6">

            <div>
              <label className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">Strategy name</label>
              <input required value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full rounded-xl border border-[#162018] bg-[#0c110d] px-4 py-3 text-sm text-[#c4d4c6] placeholder-[#1e2d20] focus:border-[#52e07c]/30 focus:outline-none transition-colors"
                placeholder="e.g. ETH RSI Momentum" />
            </div>

            <div>
              <label className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">Description</label>
              <textarea required rows={3} value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
                className="w-full resize-none rounded-xl border border-[#162018] bg-[#0c110d] px-4 py-3 text-sm text-[#c4d4c6] placeholder-[#1e2d20] focus:border-[#52e07c]/30 focus:outline-none transition-colors"
                placeholder="What market conditions does your strategy target? No need to reveal the logic." />
            </div>

            <div>
              <label className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">Frequency</label>
              <div className="flex flex-wrap gap-2">
                {FREQS.map(f => (
                  <button key={f.v} type="button"
                    onClick={() => setForm({...form, frequency: f.v})}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                      form.frequency === f.v
                        ? "border-[#52e07c]/35 bg-[#52e07c]/06 text-[#52e07c]"
                        : "border-[#162018] text-[#2d3d30] hover:border-[#1e2d20] hover:text-[#3d5040]"
                    }`}>
                    {f.l} <span className="opacity-50">· {f.s}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">
                Agent public key <span className="normal-case tracking-normal text-[#1e2d20]">(NaCl box · 32B hex)</span>
              </label>
              <input required value={form.agent_public_key}
                onChange={e => setForm({...form, agent_public_key: e.target.value})}
                className="w-full rounded-xl border border-[#162018] bg-[#0c110d] px-4 py-3 font-mono text-xs text-[#c4d4c6] placeholder-[#1e2d20] focus:border-[#52e07c]/30 focus:outline-none transition-colors"
                placeholder="64 hex chars" />
              <p className="mt-1.5 font-mono text-[10px] text-[#1e2d20]">
                generate: python -c &quot;from agents.shared.crypto import generate_keypair; print(generate_keypair())&quot;
              </p>
            </div>

            <div className="rounded-xl border border-[#162018] bg-[#0c110d] px-4 py-3 font-mono text-[11px] text-[#1e2d20]">
              100 USDC stake required · returned on deactivation · slashed only for fraudulent ZK proofs
            </div>

            <button type="submit" disabled={status === "submitting"}
              className="rounded-lg border border-[#52e07c]/30 bg-[#52e07c]/05 py-2.5 font-mono text-sm text-[#52e07c] transition-all hover:bg-[#52e07c]/10 hover:border-[#52e07c]/50 disabled:opacity-40">
              {status === "submitting" ? "registering..." : "register provider →"}
            </button>

            {status === "error" && (
              <p className="font-mono text-xs text-red-400/70 break-all">
                registration failed{chainError ? `: ${chainError}` : ""}.
              </p>
            )}
            {chainConfigured && (chainStatus === "approving" || chainStatus === "submitting") && (
              <p className="font-mono text-[10px] text-[#2d3d30]">
                {chainStatus === "approving" ? "step 1/2 · approving USDC..." : "step 2/2 · staking 100 USDC..."}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
