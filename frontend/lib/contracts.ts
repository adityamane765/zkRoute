// Minimal ABIs maintained by hand. Keep in sync with contracts/contracts/*.sol.
// We only include the surface the frontend needs.

export const FREQUENCY_TO_ENUM: Record<string, number> = {
  HFT: 0,
  Intraday: 1,
  MediumFrequency: 2,
  Swing: 3,
  Macro: 4,
};

export const PROVIDER_REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "frequency", type: "uint8" },
      { name: "agentPublicKey", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "STAKE_AMOUNT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getProvider",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "addr", type: "address" },
          { name: "name", type: "string" },
          { name: "description", type: "string" },
          { name: "frequency", type: "uint8" },
          { name: "agentPublicKey", type: "bytes" },
          { name: "stakedAt", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "slashed", type: "bool" },
        ],
      },
    ],
  },
] as const;

export const SIGNAL_MARKET_ABI = [
  {
    type: "function",
    name: "subscribe",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "agent", type: "address" },
      { name: "buyerAgentPubKey", type: "bytes" },
      { name: "maxPositionBps", type: "uint256" },
      { name: "maxLeverageBps", type: "uint256" },
      { name: "dailyVarBps", type: "uint256" },
      { name: "initialFloat", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unsubscribe",
    stateMutability: "nonpayable",
    inputs: [{ name: "provider", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "depositFloat",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "newAgent", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateRiskBounds",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "maxPositionBps", type: "uint256" },
      { name: "maxLeverageBps", type: "uint256" },
      { name: "dailyVarBps", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRevenue",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "getSubscription",
    stateMutability: "view",
    inputs: [
      { name: "provider", type: "address" },
      { name: "buyer", type: "address" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "active", type: "bool" },
          { name: "float", type: "uint256" },
          { name: "buyerAgentPubKey", type: "bytes" },
          { name: "agent", type: "address" },
          { name: "maxPositionBps", type: "uint256" },
          { name: "maxLeverageBps", type: "uint256" },
          { name: "dailyVarBps", type: "uint256" },
          { name: "signalCount", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "providerRevenue",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export function addr(name: string): `0x${string}` {
  const v = process.env[name];
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new Error(`Missing or invalid env address: ${name}`);
  }
  return v as `0x${string}`;
}

export const ADDRESSES = {
  USDC: (process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  PROVIDER_REGISTRY: (process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  SIGNAL_MARKET: (process.env.NEXT_PUBLIC_SIGNAL_MARKET_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  COMMIT_REVEAL: (process.env.NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
} as const;

export function isAddressesConfigured(): boolean {
  return ADDRESSES.USDC !== "0x0000000000000000000000000000000000000000"
    && ADDRESSES.PROVIDER_REGISTRY !== "0x0000000000000000000000000000000000000000"
    && ADDRESSES.SIGNAL_MARKET !== "0x0000000000000000000000000000000000000000";
}
