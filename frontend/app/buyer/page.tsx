"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Activity, Shield, Eye, EyeOff, Wallet } from "lucide-react";
import { EquityCurve } from "../../components/charts/EquityCurve";
import { ConnectButton } from "../../components/ConnectButton";
import { GlowCard } from "../../components/ui/GlowCard";
import { Badge } from "../../components/ui/Badge";
import { bpsToPercent, shortAddr } from "../../lib/utils";

interface Position {
  asset: string;
  direction: string;
  size_pct: number;
  entry_price: number;
  current_price: number | null;
  pnl_bps: number | null;
  open_time: string;
}

interface Dashboard {
  buyer: string;
  open_positions: number;
  total_positions: number;
  total_pnl_bps: number;
  positions: Position[];
}

const DEMO_DASHBOARD: Dashboard = {
  buyer: "0xDEMO",
  open_positions: 3,
  total_positions: 14,
  total_pnl_bps: 847,
  positions: [
    { asset: "ETH", direction: "LONG",  size_pct: 3, entry_price: 3241.50, current_price: 3409.20, pnl_bps: 517,   open_time: "2025-05-17T08:00:00Z" },
    { asset: "BTC", direction: "SHORT", size_pct: 2, entry_price: 68200.00, current_price: 67100.00, pnl_bps: 161, open_time: "2025-05-17T12:00:00Z" },
    { asset: "ETH", direction: "LONG",  size_pct: 3, entry_price: 3180.00, current_price: 3409.20, pnl_bps: 720,  open_time: "2025-05-16T20:00:00Z" },
    { asset: "BTC", direction: "LONG",  size_pct: 2, entry_price: 65000.00, current_price: 68200.00, pnl_bps: 492, open_time: "2025-05-15T10:00:00Z" },
    { asset: "ETH", direction: "SHORT", size_pct: 3, entry_price: 3500.00, current_price: 3241.50, pnl_bps: 738,  open_time: "2025-05-14T16:00:00Z" },
    { asset: "ETH", direction: "LONG",  size_pct: 2, entry_price: 3100.00, current_price: 3241.50, pnl_bps: 456,  open_time: "2025-05-13T09:00:00Z" },
    { asset: "BTC", direction: "SHORT", size_pct: 2, entry_price: 70000.00, current_price: 68200.00, pnl_bps: 257, open_time: "2025-05-12T14:00:00Z" },
  ],
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function BuyerDashboard() {
  const { address, isConnected } = useAccount();
  const [dashboard, setDashboard] = useState<Dashboard>(DEMO_DASHBOARD);
  const [showSignalWarning, setShowSignalWarning] = useState(false);

  useEffect(() => {
    if (!address) return;
    const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    fetch(`${url}/buyer/dashboard/${address}`)
      .then((r) => r.json())
      .then((data) => { if (data?.positions?.length) setDashboard(data); })
      .catch(() => {});
  }, [address]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 relative z-10">
        <div className="w-14 h-14 rounded-2xl bg-[rgba(0,255,135,0.08)] border border-[rgba(0,255,135,0.2)] flex items-center justify-center">
          <Wallet size={22} className="text-[#00ff87]" />
        </div>
        <div className="text-center">
          <div className="font-semibold text-white mb-1">Connect to view your portfolio</div>
          <p className="text-gray-500 text-sm">Your agent executes trades. You see PnL — never the raw signals.</p>
        </div>
        <ConnectButton />
      </div>
    );
  }

  const totalPnl = dashboard.total_pnl_bps;
  const totalPct = bpsToPercent(totalPnl);
  const isUp = totalPnl >= 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 relative z-10">
      <motion.div variants={container} initial="hidden" animate="show">
        {/* Header */}
        <motion.div variants={item} className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Portfolio</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-mono">{shortAddr(address!)}</span>
              <span className="text-gray-700">·</span>
              <span>{dashboard.open_positions} open positions</span>
            </div>
          </div>
          {/* Signal privacy notice */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:border-white/[0.12] transition-colors"
            onClick={() => setShowSignalWarning(!showSignalWarning)}
          >
            <EyeOff size={12} className="text-gray-500" />
            <span className="text-[10px] text-gray-500">Signal content hidden</span>
          </div>
        </motion.div>

        {/* Privacy callout (dismissible) */}
        {showSignalWarning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-[rgba(0,255,135,0.04)] border border-[rgba(0,255,135,0.15)]"
          >
            <Shield size={14} className="text-[#00ff87] mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-white mb-0.5">Raw signals are never shown here — by design</div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Your buyer agent decrypts and executes signals autonomously. You configured the risk bounds.
                What you see below is what your agent did and how it performed — not the underlying strategy logic.
                This protects the provider&apos;s edge and makes reverse-engineering computationally intractable.
              </p>
            </div>
          </motion.div>
        )}

        {/* Stats row */}
        <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Total PnL",
              value: `${isUp ? "+" : ""}${totalPct}%`,
              sub: `${Math.abs(totalPnl)}bps`,
              color: isUp ? "text-[#00ff87]" : "text-red-400",
              icon: isUp ? TrendingUp : TrendingDown,
            },
            {
              label: "Open Positions",
              value: dashboard.open_positions.toString(),
              sub: "active right now",
              color: "text-white",
              icon: Activity,
            },
            {
              label: "Total Signals",
              value: dashboard.total_positions.toString(),
              sub: "executed by agent",
              color: "text-white",
              icon: Activity,
            },
            {
              label: "Signal Cost",
              value: `$${(dashboard.total_positions * 0.01).toFixed(2)}`,
              sub: "$0.01 × signals",
              color: "text-[#00c2ff]",
              icon: Activity,
            },
          ].map((s) => (
            <GlowCard key={s.label} className="p-4 flex flex-col gap-1">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest">{s.label}</div>
              <div className={`stat-num text-2xl ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-gray-600">{s.sub}</div>
            </GlowCard>
          ))}
        </motion.div>

        {/* Equity curve */}
        <motion.div variants={item}>
          <GlowCard className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-white">Equity Curve</div>
              <Badge variant="green">Live</Badge>
            </div>
            <EquityCurve positions={dashboard.positions} />
          </GlowCard>
        </motion.div>

        {/* Positions table */}
        <motion.div variants={item}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-white">Positions</div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <EyeOff size={10} />
              Signal content not visible
            </div>
          </div>

          <GlowCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    {["Asset", "Direction", "Size", "Entry", "Current", "PnL", "Opened"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-gray-600 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.positions.map((pos, i) => {
                    const pnlPct = pos.pnl_bps != null ? bpsToPercent(pos.pnl_bps) : null;
                    const up = (pos.pnl_bps ?? 0) >= 0;
                    return (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="table-row-hover border-b border-white/[0.03] last:border-0"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-white">{pos.asset}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                            pos.direction === "LONG"
                              ? "bg-[rgba(0,255,135,0.1)] text-[#00ff87] border border-[rgba(0,255,135,0.2)]"
                              : "bg-[rgba(239,68,68,0.1)] text-red-400 border border-red-400/20"
                          }`}>
                            {pos.direction}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-400">{pos.size_pct.toFixed(1)}%</td>
                        <td className="px-4 py-3 font-mono text-gray-400">${pos.entry_price.toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-gray-300">
                          {pos.current_price ? `$${pos.current_price.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {pnlPct != null ? (
                            <span className={`stat-num flex items-center gap-1 ${up ? "text-[#00ff87]" : "text-red-400"}`}>
                              {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                              {up ? "+" : ""}{pnlPct}%
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(pos.open_time).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>

              {dashboard.positions.length === 0 && (
                <div className="text-center text-gray-600 py-12 text-sm">
                  No positions yet. Subscribe to a provider in the marketplace.
                </div>
              )}
            </div>
          </GlowCard>
        </motion.div>
      </motion.div>
    </div>
  );
}
