"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, SlidersHorizontal } from "lucide-react";
import { ProviderCard } from "../../components/ProviderCard";
import { SubscribeModal } from "../../components/SubscribeModal";

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

const FREQ_FILTERS = [
  { value: "all", label: "All" },
  { value: "Swing", label: "Swing" },
  { value: "MediumFrequency", label: "Med-Freq" },
  { value: "Intraday", label: "Intraday" },
  { value: "HFT", label: "HFT" },
];

const DEMO_PROVIDERS: Provider[] = [
  {
    address: "0x1111111111111111111111111111111111111111",
    name: "ETH Momentum Alpha",
    description: "Medium-frequency ETH strategy targeting momentum regime shifts. Tuned on 3 years of order-flow data.",
    frequency: "MediumFrequency",
    win_rate_bps: 6800,
    total_return_bps: 2340,
    total_signals: 47,
    last_proof_block: 100000,
  },
  {
    address: "0x2222222222222222222222222222222222222222",
    name: "BTC Swing Desk",
    description: "Multi-day BTC swing trades based on on-chain analytics and macro indicators. Low frequency, high conviction.",
    frequency: "Swing",
    win_rate_bps: 5900,
    total_return_bps: 1820,
    total_signals: 23,
    last_proof_block: 99800,
  },
  {
    address: "0x3333333333333333333333333333333333333333",
    name: "Multi-Asset Intraday",
    description: "High-cadence signals across ETH and BTC. Tight execution windows, sub-4h holding periods.",
    frequency: "Intraday",
    win_rate_bps: 6200,
    total_return_bps: 890,
    total_signals: 134,
    last_proof_block: 100100,
  },
  {
    address: "0x4444444444444444444444444444444444444444",
    name: "Macro Quant Fund",
    description: "Macro-driven directional bets. Fed policy, stablecoin flows, institutional positioning.",
    frequency: "Macro",
    win_rate_bps: null,
    total_return_bps: null,
    total_signals: null,
    last_proof_block: null,
  },
];

export default function Marketplace() {
  const [providers, setProviders] = useState<Provider[]>(DEMO_PROVIDERS);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Provider | null>(null);
  const [sortBy, setSortBy] = useState<"winRate" | "return" | "signals">("winRate");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    fetch(`${url}/providers/`)
      .then((r) => r.json())
      .then((data) => { if (data?.length) setProviders(data); })
      .catch(() => {});
  }, []);

  const filtered = providers
    .filter((p) => filter === "all" || p.frequency === filter)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "winRate") return (b.win_rate_bps ?? -1) - (a.win_rate_bps ?? -1);
      if (sortBy === "return") return (b.total_return_bps ?? -Infinity) - (a.total_return_bps ?? -Infinity);
      return (b.total_signals ?? -1) - (a.total_signals ?? -1);
    });

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 relative z-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold mb-1">Signal Marketplace</h1>
        <p className="text-gray-500 text-sm">
          All stats ZK-proven on Arc. Strategies are never revealed — only your agent decrypts.
        </p>
      </motion.div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers..."
            className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,135,0.3)] transition-colors"
          />
        </div>

        {/* Frequency filter */}
        <div className="flex gap-1.5 flex-wrap">
          {FREQ_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                filter === f.value
                  ? "bg-[#00ff87] text-black shadow-green-sm"
                  : "bg-white/[0.03] border border-white/[0.07] text-gray-400 hover:text-white hover:border-white/[0.15]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 ml-auto">
          <SlidersHorizontal size={12} className="text-gray-600" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="bg-white/[0.03] border border-white/[0.07] rounded-lg px-2 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-[rgba(0,255,135,0.3)]"
          >
            <option value="winRate">Sort: Win Rate</option>
            <option value="return">Sort: Return</option>
            <option value="signals">Sort: Signals</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <AnimatePresence mode="popLayout">
        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {filtered.map((p, i) => (
            <motion.div
              key={p.address}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <ProviderCard provider={p} onSubscribe={() => setSelected(p)} />
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      {filtered.length === 0 && (
        <div className="text-center text-gray-600 py-20 text-sm">No providers match your filters.</div>
      )}

      {selected && <SubscribeModal provider={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
