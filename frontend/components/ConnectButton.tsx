"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect }    = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button onClick={() => disconnect()}
        className="font-mono text-xs text-[#2d3d30] hover:text-[#52e07c] transition-colors">
        {address.slice(0,6)}…{address.slice(-4)} ×
      </button>
    );
  }

  return (
    <button onClick={() => connect({ connector: injected() })}
      className="rounded-lg border border-[#52e07c]/30 px-4 py-1.5 font-mono text-xs text-[#52e07c] transition-all hover:bg-[#52e07c]/08 hover:border-[#52e07c]/50">
      connect wallet
    </button>
  );
}
