"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddr } from "../lib/utils";
import { Wallet } from "lucide-react";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-gray-300 text-xs font-mono transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff87] animate-pulse-slow" />
        {shortAddr(address)}
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#00ff87] hover:bg-[#00e87a] text-black text-xs font-bold transition-all hover:shadow-green-sm"
    >
      <Wallet size={12} />
      Connect Wallet
    </button>
  );
}
