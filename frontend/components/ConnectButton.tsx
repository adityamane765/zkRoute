"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect }    = useConnect();
  const { disconnect } = useDisconnect();

  // Wagmi reads from localStorage which only exists in the browser.
  // Server renders the disconnected state; we render the connected state only
  // after mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (mounted && isConnected && address) {
    return (
      <button onClick={() => disconnect()}
        className="font-mono text-xs text-[#2d3d30] hover:text-[#52e07c] transition-colors">
        {address.slice(0,6)}…{address.slice(-4)} ×
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      // Until mounted, the button is inert — clicking it on the server-rendered
      // markup would no-op anyway because wagmi isn't wired yet.
      disabled={!mounted}
      suppressHydrationWarning
      className="rounded-lg border border-[#52e07c]/30 px-4 py-1.5 font-mono text-xs text-[#52e07c] transition-all hover:bg-[#52e07c]/08 hover:border-[#52e07c]/50 disabled:opacity-60">
      connect wallet
    </button>
  );
}
