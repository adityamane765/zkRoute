"use client";

import { TrendingUp, TrendingDown, Zap, Activity } from "lucide-react";
import { GlowCard } from "./ui/GlowCard";
import { Badge } from "./ui/Badge";
import { bpsToPercent, shortAddr } from "../lib/utils";

const FREQ_CONFIG: Record<string, { label: string; color: string }> = {
  HFT:             { label: "HFT",        color: "bg-red-500/10 text-red-400 border-red-500/20" },
  Intraday:        { label: "Intraday",   color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  MediumFrequency: { label: "Med-Freq",   color: "bg-blue-500/10 text-[#00c2ff] border-blue-500/20" },
  Swing:           { label: "Swing",      color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  Macro:           { label: "Macro",      color: "bg-white/5 text-gray-400 border-white/10" },
};

interface Provider {
  address: string;
  name: string;
  description: string;
  frequency: string;
  win_rate_bps: number | null;
  total_return_bps: number | null;
  total_signals: number | null;
  last_proof_block: number | null;
}

interface Props {
  provider: Provider;
  onSubscribe: () => void;
}

export function ProviderCard({ provider: p, onSubscribe }: Props) {
  const hasProof = p.last_proof_block != null;
  const winRate = p.win_rate_bps != null ? bpsToPercent(p.win_rate_bps) : null;
  const totalReturn = p.total_return_bps != null ? bpsToPercent(p.total_return_bps) : null;
  const returnPositive = (p.total_return_bps ?? 0) >= 0;
  const freq = FREQ_CONFIG[p.frequency] ?? { label: p.frequency, color: "bg-white/5 text-gray-400 border-white/10" };

  return (
    <GlowCard className="flex flex-col h-full">
      {/* Top bar */}
      <div className="p-4 pb-0 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-white text-sm truncate">{p.name}</div>
          <div className="text-[10px] text-gray-600 font-mono mt-0.5">{shortAddr(p.address)}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`freq-pill border ${freq.color}`}>{freq.label}</span>
          {hasProof && (
            <span className="zk-badge">
              <span className="w-1 h-1 rounded-full bg-[#00ff87]" />
              ZK
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="px-4 pt-3 text-[11px] text-gray-500 leading-relaxed line-clamp-2 flex-1">
        {p.description}
      </p>

      {/* Stats */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-px rounded-lg overflow-hidden border border-white/[0.05]">
        <div className="bg-white/[0.02] px-2.5 py-2.5 flex flex-col gap-0.5">
          <div className="text-[9px] text-gray-600 uppercase tracking-widest">Win Rate</div>
          <div className="stat-num text-sm text-white">{winRate != null ? `${winRate}%` : "—"}</div>
        </div>
        <div className="bg-white/[0.02] px-2.5 py-2.5 flex flex-col gap-0.5">
          <div className="text-[9px] text-gray-600 uppercase tracking-widest">Return</div>
          <div className={`stat-num text-sm flex items-center gap-0.5 ${returnPositive ? "text-[#00ff87]" : "text-red-400"}`}>
            {totalReturn != null ? (
              <>
                {returnPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {returnPositive ? "+" : ""}{totalReturn}%
              </>
            ) : "—"}
          </div>
        </div>
        <div className="bg-white/[0.02] px-2.5 py-2.5 flex flex-col gap-0.5">
          <div className="text-[9px] text-gray-600 uppercase tracking-widest">Signals</div>
          <div className="stat-num text-sm text-white flex items-center gap-0.5">
            <Activity size={10} className="text-gray-600" />
            {p.total_signals ?? "—"}
          </div>
        </div>
      </div>

      {!hasProof && (
        <div className="mx-4 mt-2 text-[10px] text-amber-500/70 bg-amber-500/5 border border-amber-500/15 rounded px-2 py-1.5 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-amber-500/70 shrink-0" />
          Track record not yet ZK-verified
        </div>
      )}

      {/* Subscribe button */}
      <div className="p-4 pt-3">
        <button
          onClick={onSubscribe}
          className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 border border-[rgba(0,255,135,0.15)] bg-[rgba(0,255,135,0.05)] text-[#00ff87] hover:bg-[rgba(0,255,135,0.12)] hover:border-[rgba(0,255,135,0.3)] hover:shadow-green-sm"
        >
          <Zap size={11} />
          Subscribe · $0.01/signal
        </button>
      </div>
    </GlowCard>
  );
}
