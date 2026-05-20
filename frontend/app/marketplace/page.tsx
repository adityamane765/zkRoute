"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SubscribeModal } from "../../components/SubscribeModal";
import { ConnectButton } from "../../components/ConnectButton";

interface Provider {
  address: string;
  name: string;
  description: string;
  frequency: string;
  win_count: number | null;
  win_rate_bps: number | null;
  total_return_bps: number | null;
  total_signals: number | null;
  last_proof_block: number | null;
}

const DEMO: Provider[] = [
  { address:"0x1111111111111111111111111111111111111111", name:"ETH Momentum Alpha",   description:"Medium-frequency ETH strategy targeting momentum regime shifts.",              frequency:"MediumFrequency", win_count:32,  win_rate_bps:6800, total_return_bps:2340, total_signals:47,  last_proof_block:100000 },
  { address:"0x2222222222222222222222222222222222222222", name:"BTC Swing Desk",        description:"Multi-day BTC swing trades based on on-chain analytics and macro data.",     frequency:"Swing",           win_count:14,  win_rate_bps:5900, total_return_bps:1820, total_signals:23,  last_proof_block:99800  },
  { address:"0x3333333333333333333333333333333333333333", name:"Multi-Asset Intraday",  description:"High-cadence signals across ETH and BTC. Sub-4h holding periods.",          frequency:"Intraday",        win_count:83,  win_rate_bps:6200, total_return_bps:890,  total_signals:134, last_proof_block:100100 },
  { address:"0x4444444444444444444444444444444444444444", name:"Macro Quant",           description:"Macro-driven directional bets. Fed policy, stablecoin flows, positioning.", frequency:"Macro",           win_count:null,win_rate_bps:null, total_return_bps:null, total_signals:null,last_proof_block:null   },
];

const FREQ_LABEL: Record<string,string> = {
  HFT:"hft", Intraday:"intraday", MediumFrequency:"med-freq", Swing:"swing", Macro:"macro",
};

export default function Marketplace() {
  const [providers, setProviders] = useState<Provider[]>(DEMO);
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Provider | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    fetch(`${url}/providers/`).then(r => r.json())
      .then(d => { if (d?.length) setProviders(d); }).catch(() => {});
  }, []);

  const q = search.trim().toLowerCase();
  const list = q ? providers.filter(p =>
    p.name.toLowerCase().includes(q) || p.frequency.toLowerCase().includes(q)
  ) : providers;

  return (
    <div className="min-h-screen bg-[#090c0a] text-[#d4ddd6]">

      <nav className="border-b border-[#0f1a11] px-8 py-4 flex items-center justify-between">
        <Link href="/" className="font-mono text-xs text-[#2d3d30] hover:text-[#52e07c] transition-colors">← zkRoute</Link>
        <div className="flex items-center gap-4">
          <Link href="/provider" className="font-mono text-xs text-[#2d3d30] hover:text-[#52e07c] transition-colors">list strategy →</Link>
          <ConnectButton />
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-8 py-14">

        {/* header */}
        <div className="mb-10">
          <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">ZK-verified · Arc · USDC</p>
          <h1 className="text-2xl font-bold text-white">Signal Marketplace</h1>
          <p className="mt-1 text-sm text-[#4a5e4e]">
            {list.length} provider{list.length !== 1 ? "s" : ""} · strategies never revealed
          </p>
        </div>

        {/* search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search providers..."
          className="mb-8 w-full rounded-xl border border-[#162018] bg-[#0c110d] px-4 py-3 font-mono text-sm text-[#c4d4c6] placeholder-[#1e2d20] focus:border-[#52e07c]/30 focus:outline-none transition-colors"
        />

        {/* list */}
        <div className="flex flex-col gap-3">
          {list.map(p => {
            const hasProof = p.last_proof_block != null;
            // Prefer win_count (new circuit) over legacy win_rate_bps.
            const wr = p.win_count != null && p.total_signals
              ? ((p.win_count / p.total_signals) * 100).toFixed(1)
              : p.win_rate_bps != null ? (p.win_rate_bps / 100).toFixed(1) : null;
            const ret = p.total_return_bps != null ? (p.total_return_bps / 100).toFixed(1) : null;
            const up  = (p.total_return_bps ?? 0) >= 0;

            return (
              <div key={p.address}
                className="group rounded-2xl border border-[#0f1a11] bg-[#0c110d] p-5 transition-colors duration-200 hover:border-[#1a2d1c]">

                {/* top row */}
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[#1e2d20]">
                        {p.address.slice(0,6)}…{p.address.slice(-4)}
                      </span>
                      {hasProof && (
                        <span className="rounded border border-[#52e07c]/20 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-[#52e07c]/70 uppercase">
                          zk proven
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-white">{p.name}</div>
                    <div className="mt-0.5 text-sm text-[#4a5e4e]">{p.description}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-semibold text-[#52e07c]">$0.01</div>
                    <div className="font-mono text-[10px] text-[#1e2d20]">per signal</div>
                  </div>
                </div>

                {/* bottom row */}
                <div className="flex items-center justify-between border-t border-[#0f1a11] pt-3">
                  <div className="flex items-center gap-4 font-mono text-[11px]">
                    <span className="text-[#1e2d20]">{FREQ_LABEL[p.frequency] ?? p.frequency}</span>
                    {wr  && <span className="text-[#3a5040]">{wr}% win</span>}
                    {ret && <span className={up ? "text-[#52e07c]" : "text-red-400/70"}>{up?"+":""}{ret}%</span>}
                    {p.total_signals && <span className="text-[#1e2d20]">{p.total_signals} signals</span>}
                  </div>
                  <button
                    onClick={() => setSelected(p)}
                    className="font-mono text-xs text-[#2d3d30] transition-colors hover:text-[#52e07c]">
                    subscribe →
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {list.length === 0 && (
          <p className="font-mono text-sm text-[#1e2d20]">no results for &quot;{search}&quot;</p>
        )}
      </div>

      {selected && <SubscribeModal provider={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
