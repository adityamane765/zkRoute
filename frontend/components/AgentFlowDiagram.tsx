"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";

const STEPS = [
  { id: 1, side: "provider", label: "Generate Signal", detail: "Private strategy → directional call" },
  { id: 2, side: "provider", label: "Commit Hash On-Chain", detail: "Hash locked on Arc before market moves" },
  { id: 3, side: "provider", label: "Encrypt to Buyer Agent", detail: "NaCl box: only buyer agent can decrypt" },
  { id: 4, side: "channel",  label: "Encrypted Relay", detail: "Signal travels encrypted — no human sees it" },
  { id: 5, side: "buyer",   label: "Decrypt & Risk-Check", detail: "Agent validates against your configured bounds" },
  { id: 6, side: "buyer",   label: "Execute Trade", detail: "Circle Wallet executes. $0.01 nanopayment fired." },
  { id: 7, side: "buyer",   label: "Report PnL to You", detail: "You see: 'ETH LONG +2.3%'. Never the signal." },
];

export function AgentFlowDiagram() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative">
      {/* Column headers */}
      <div className="grid grid-cols-3 gap-4 mb-6 text-center">
        {[
          { label: "Provider Agent", color: "text-[#00ff87]" },
          { label: "Encrypted Channel", color: "text-[#00c2ff]" },
          { label: "Buyer Agent", color: "text-purple-400" },
        ].map((c) => (
          <div key={c.label} className={`text-sm font-bold tracking-wide ${c.color} uppercase`}>
            {c.label}
          </div>
        ))}
      </div>

      {/* Step rows */}
      <div className="relative space-y-2">
        {/* Vertical connector line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[#00ff87]/20 via-[#00c2ff]/20 to-purple-500/20" />

        {STEPS.map((step, i) => {
          const isActive = active === i;
          return (
            <motion.div
              key={step.id}
              initial={false}
              animate={isActive ? { scale: 1.01 } : { scale: 1 }}
              className={`grid grid-cols-3 gap-4 rounded-lg transition-all duration-300 ${
                isActive ? "bg-white/[0.03]" : ""
              }`}
            >
              {/* Provider column */}
              <div className={`flex justify-end pr-4 py-3 ${step.side === "provider" ? "opacity-100" : "opacity-20"}`}>
                {step.side === "provider" && (
                  <div className={`text-right rounded-lg px-3 py-2 transition-all duration-300 ${
                    isActive
                      ? "bg-[rgba(0,255,135,0.1)] border border-[rgba(0,255,135,0.2)]"
                      : "bg-white/[0.025] border border-white/5"
                  }`}>
                    <div className="text-xs font-semibold text-white">{step.label}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{step.detail}</div>
                  </div>
                )}
              </div>

              {/* Center / Channel */}
              <div className="flex items-center justify-center py-3">
                {step.side === "channel" ? (
                  <div className={`relative flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300 ${
                    isActive
                      ? "bg-[rgba(0,194,255,0.12)] border border-[rgba(0,194,255,0.25)]"
                      : "bg-white/[0.02] border border-white/5"
                  }`}>
                    <motion.div
                      animate={isActive ? { x: [0, 4, 0] } : {}}
                      transition={{ repeat: Infinity, duration: 0.8 }}
                      className="w-1 h-1 rounded-full bg-[#00c2ff]"
                    />
                    <span className="text-[10px] text-[#00c2ff] font-mono">{step.label}</span>
                    <motion.div
                      animate={isActive ? { x: [0, 4, 0] } : {}}
                      transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }}
                      className="w-1 h-1 rounded-full bg-[#00c2ff]"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <motion.div
                      animate={isActive ? { opacity: [0.2, 0.8, 0.2] } : { opacity: 0.15 }}
                      transition={{ repeat: Infinity, duration: 1.2 }}
                      className="w-1 h-1 rounded-full bg-gray-500"
                    />
                    <div className={`h-px transition-all duration-300 ${
                      isActive ? "w-16 bg-gradient-to-r from-[#00ff87]/40 to-[#00c2ff]/40" : "w-8 bg-white/10"
                    }`} />
                    <motion.div
                      animate={isActive ? { opacity: [0.2, 0.8, 0.2] } : { opacity: 0.15 }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: 0.3 }}
                      className="w-1 h-1 rounded-full bg-gray-500"
                    />
                  </div>
                )}
              </div>

              {/* Buyer column */}
              <div className={`flex justify-start pl-4 py-3 ${step.side === "buyer" ? "opacity-100" : "opacity-20"}`}>
                {step.side === "buyer" && (
                  <div className={`rounded-lg px-3 py-2 transition-all duration-300 ${
                    isActive
                      ? "bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)]"
                      : "bg-white/[0.025] border border-white/5"
                  }`}>
                    <div className="text-xs font-semibold text-white">{step.label}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{step.detail}</div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center justify-center gap-6 text-[11px] text-gray-600">
        {[
          { color: "bg-[#00ff87]", label: "Provider Agent" },
          { color: "bg-[#00c2ff]", label: "Encrypted Channel" },
          { color: "bg-purple-400", label: "Buyer Agent" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${l.color}`} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
