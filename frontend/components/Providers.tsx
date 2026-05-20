"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defineChain } from "viem";

// Prefer the backend RPC proxy (no token in the public bundle). Fall back to a
// direct RPC URL only if the proxy isn't configured — local dev convenience.
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_PROXY_URL ||
  (process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/rpc` : null) ||
  process.env.NEXT_PUBLIC_ARC_RPC_URL ||
  "https://rpc.arc.io";

const arc = defineChain({
  id: parseInt(process.env.NEXT_PUBLIC_ARC_CHAIN_ID || "1234"),
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const config = createConfig({
  chains: [arc],
  transports: { [arc.id]: http() },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
