"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { ConnectButton } from "../../components/ConnectButton";
import { EquityCurve } from "../../components/charts/EquityCurve";

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => { setM(true); }, []);
  return m;
}

interface Position {
  asset: string; direction: string; size_pct: number;
  entry_price: number; current_price: number | null;
  pnl_bps: number | null; open_time: string;
}
interface Dashboard {
  buyer: string; open_positions: number; total_positions: number;
  total_pnl_bps: number; positions: Position[];
}

const DEMO: Dashboard = {
  buyer: "0xDEMO", open_positions: 3, total_positions: 14, total_pnl_bps: 847,
  positions: [
    { asset:"ETH", direction:"LONG",  size_pct:3, entry_price:3241.50, current_price:3409.20, pnl_bps:517,  open_time:"2025-05-17T08:00:00Z" },
    { asset:"BTC", direction:"SHORT", size_pct:2, entry_price:68200,   current_price:67100,   pnl_bps:161,  open_time:"2025-05-17T12:00:00Z" },
    { asset:"ETH", direction:"LONG",  size_pct:3, entry_price:3180,    current_price:3409.20, pnl_bps:720,  open_time:"2025-05-16T20:00:00Z" },
    { asset:"BTC", direction:"LONG",  size_pct:2, entry_price:65000,   current_price:68200,   pnl_bps:492,  open_time:"2025-05-15T10:00:00Z" },
    { asset:"ETH", direction:"SHORT", size_pct:3, entry_price:3500,    current_price:3241.50, pnl_bps:738,  open_time:"2025-05-14T16:00:00Z" },
    { asset:"ETH", direction:"LONG",  size_pct:2, entry_price:3100,    current_price:3241.50, pnl_bps:456,  open_time:"2025-05-13T09:00:00Z" },
    { asset:"BTC", direction:"SHORT", size_pct:2, entry_price:70000,   current_price:68200,   pnl_bps:257,  open_time:"2025-05-12T14:00:00Z" },
  ],
};

export default function Portfolio() {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<Dashboard>(DEMO);
  const mounted = useMounted();

  useEffect(() => {
    if (!address) return;
    const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    fetch(`${url}/buyer/dashboard/${address}`)
      .then(r => r.json()).then(d => { if (d?.positions?.length) setData(d); }).catch(() => {});
  }, [address]);

  const isUp  = data.total_pnl_bps >= 0;
  const total = (data.total_pnl_bps / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-[#090c0a] text-[#d4ddd6]">

      <nav className="border-b border-[#0f1a11] px-8 py-4 flex items-center justify-between">
        <Link href="/" className="font-mono text-xs text-[#2d3d30] hover:text-[#52e07c] transition-colors">← zkRoute</Link>
        <ConnectButton />
      </nav>

      {!mounted || !isConnected ? (
        <div className="flex flex-col items-center gap-4 pt-40 text-center">
          <p className="text-sm text-[#4a5e4e]">Connect wallet to view your portfolio.</p>
          <ConnectButton />
        </div>
      ) : (
        <div className="mx-auto max-w-2xl px-8 py-14">

          <div className="mb-10">
            <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">
              {address!.slice(0,6)}…{address!.slice(-4)} · signals never shown
            </p>
            <h1 className="text-2xl font-bold text-white">Portfolio</h1>
          </div>

          {/* summary */}
          <div className="mb-10 flex items-center gap-10 border-b border-[#0f1a11] pb-10">
            {[
              { label:"total pnl",       val: `${isUp?"+":""}${total}%`,                  color: isUp?"text-[#52e07c]":"text-red-400" },
              { label:"open positions",  val: String(data.open_positions),                 color: "text-white" },
              { label:"signals run",     val: String(data.total_positions),                color: "text-white" },
              { label:"signal cost",     val: `$${(data.total_positions * 0.01).toFixed(2)}`, color: "text-[#3a5040]" },
            ].map((s, i, a) => (
              <div key={s.label} className="flex items-center gap-10">
                <div>
                  <div className={`font-mono text-xl font-semibold ${s.color}`}>{s.val}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-[#2d3d30]">{s.label}</div>
                </div>
                {i < a.length - 1 && <div className="h-6 w-px bg-[#0f1a11]" />}
              </div>
            ))}
          </div>

          {/* chart */}
          <div className="mb-10">
            <p className="mb-4 font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">equity curve</p>
            <EquityCurve positions={data.positions} />
          </div>

          {/* positions */}
          <div>
            <p className="mb-4 font-mono text-[10px] tracking-[0.2em] text-[#2d3d30] uppercase">positions · signal content hidden</p>
            <div className="flex flex-col gap-2">
              {data.positions.map((p, i) => {
                const pnlPct = p.pnl_bps != null ? (p.pnl_bps / 100).toFixed(2) : null;
                const up = (p.pnl_bps ?? 0) >= 0;
                return (
                  <div key={i}
                    className="flex items-center justify-between rounded-xl border border-[#0f1a11] bg-[#0c110d] px-4 py-3">
                    <div className="flex items-center gap-4 font-mono text-sm">
                      <span className="w-8 font-semibold text-white">{p.asset}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] ${
                        p.direction === "LONG"
                          ? "border-[#52e07c]/20 text-[#52e07c]/70"
                          : "border-red-400/20 text-red-400/70"
                      }`}>{p.direction.toLowerCase()}</span>
                      <span className="text-[#1e2d20] text-xs">{p.size_pct}%</span>
                      <span className="text-[#2d3d30] text-xs">${p.entry_price.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-5 font-mono text-sm">
                      {pnlPct && (
                        <span className={up ? "text-[#52e07c]" : "text-red-400"}>
                          {up ? "+" : ""}{pnlPct}%
                        </span>
                      )}
                      <span className="text-[#1e2d20] text-xs">
                        {new Date(p.open_time).toLocaleDateString("en-US", { month:"short", day:"numeric" })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
