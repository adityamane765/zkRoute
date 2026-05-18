"use client";

import { useEffect, useState } from "react";

const FAKE_EVENTS = [
  { provider: "ETH Momentum Alpha", type: "SIGNAL", asset: "ETH", dir: "LONG", pnl: "+2.3%" },
  { provider: "BTC Swing Desk", type: "PROOF", asset: "BTC", dir: null, pnl: "68% win rate verified" },
  { provider: "Multi-Asset Intraday", type: "SIGNAL", asset: "ETH", dir: "SHORT", pnl: "+1.1%" },
  { provider: "ETH Momentum Alpha", type: "SIGNAL", asset: "BTC", dir: "LONG", pnl: "+4.7%" },
  { provider: "BTC Swing Desk", type: "SIGNAL", asset: "BTC", dir: "SHORT", pnl: "-0.8%" },
  { provider: "Macro Quant", type: "SIGNAL", asset: "ETH", dir: "LONG", pnl: "+3.2%" },
];

export function LiveTicker() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % FAKE_EVENTS.length), 2800);
    return () => clearInterval(t);
  }, []);

  const ev = FAKE_EVENTS[index];
  const isProof = ev.type === "PROOF";
  const isWin = ev.pnl?.startsWith("+");

  return (
    <div className="flex items-center justify-center gap-6 text-[11px] text-gray-600">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff87] animate-pulse" />
        <span className="uppercase tracking-widest">Live activity</span>
      </div>
      <div
        key={index}
        className="flex items-center gap-2 animate-fade-in font-mono"
      >
        <span className="text-gray-500">{ev.provider}</span>
        {isProof ? (
          <span className="zk-badge text-[9px]">ZK proof submitted</span>
        ) : (
          <>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
              ev.dir === "LONG" ? "bg-[rgba(0,255,135,0.1)] text-[#00ff87]" : "bg-[rgba(239,68,68,0.1)] text-red-400"
            }`}>{ev.asset} {ev.dir}</span>
            <span className="text-gray-600">→ agent executed →</span>
            <span className={isWin ? "text-[#00ff87]" : "text-red-400"}>{ev.pnl}</span>
          </>
        )}
      </div>
    </div>
  );
}
