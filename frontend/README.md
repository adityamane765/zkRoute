# frontend/

Next.js 14 (App Router) marketplace + dashboard. Wagmi + viem for wallet/RPC.
Tailwind for styling. Recharts for the equity curve. GSAP for the landing
canvas. The aesthetic is intentionally heavy on monospace, low-contrast greens,
and a dot-matrix orb — it's part of the brand.

## Project layout

```
frontend/
├── README.md
├── .gitignore
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── next.config.js
├── postcss.config.js
├── vercel.json
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout: <Providers> wraps everything
│   ├── globals.css               # Tailwind directives + custom keyframes
│   ├── page.tsx                  # Landing: orb canvas + ticker + how-it-works
│   ├── marketplace/
│   │   └── page.tsx              # Browse providers, ZK-verified stats, subscribe
│   ├── provider/
│   │   └── page.tsx              # List your strategy, stake on chain
│   └── buyer/
│       └── page.tsx              # Portfolio dashboard (positions + PnL only)
├── components/
│   ├── Providers.tsx             # WagmiProvider + QueryClient
│   ├── ConnectButton.tsx         # Injected wallet connect
│   ├── SubscribeModal.tsx        # Subscribe flow (approve + on-chain + backend mirror)
│   ├── OrbCanvas.tsx             # Hero canvas (GSAP)
│   ├── Ticker.tsx                # Scrolling event ticker
│   └── charts/
│       └── EquityCurve.tsx       # Recharts area chart
└── lib/
    ├── contracts.ts              # Hand-maintained ABIs + address resolver
    ├── onchain.ts                # Approve-then-call hooks (register, subscribe, deposit)
    └── utils.ts
```

## Pages

### `/` (landing)

Dot-matrix orb hero, scrolling ticker, four-step "how it works" list, footer.
Single-page no-data. Component: [`OrbCanvas`](components/OrbCanvas.tsx) +
[`Ticker`](components/Ticker.tsx).

### `/marketplace`

Lists active providers. Pulls from `GET /providers/`, with a hardcoded
fallback for offline demo. Each card shows:

- Provider address (truncated)
- ZK-PROVEN badge if `last_proof_block` is set
- Name + description
- $0.01/signal price chip
- Frequency, win rate, total return, signal count
- "subscribe →" opens [`SubscribeModal`](components/SubscribeModal.tsx)

Search box filters by name or frequency (client-side).

### `/provider`

Register a new strategy. Three sections:

1. **How it works** (3 steps)
2. **Form**: name, description, frequency (5 chips), agent public key (NaCl
   hex)
3. **On-chain register**: when addresses are configured, the submit button
   triggers USDC approve → `ProviderRegistry.register(...)` → backend mirror

If `NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS` is unset, the page degrades to
backend-only registration (no stake) for local UI iteration.

### `/buyer`

Portfolio dashboard. Pulls from `GET /buyer/dashboard/{address}`. Shows:

- Total PnL, open positions, total signals run, signal cost spent
- Equity curve (cumulative PnL)
- Position list (asset, direction, size %, entry price, PnL, open date)

**Critically: no raw signal content is ever rendered.** The signal logic stays
encrypted at the agent level; the dashboard only ever sees the resulting
positions.

## On-chain integration

### Configured-vs-unconfigured

The app checks `isAddressesConfigured()` from [`lib/contracts.ts`](lib/contracts.ts).
If addresses are zero, on-chain flows are hidden and only the backend mirrors
run. This is intentional so the UI is usable for local development before any
contracts are deployed.

### Hooks

| Hook | Triggers |
|------|----------|
| `useProviderRegister` | `USDC.approve` → `ProviderRegistry.register` |
| `useSubscribe` | `USDC.approve(initialFloat)` → `SignalMarket.subscribe` |
| `useDepositFloat` | `USDC.approve(amount)` → `SignalMarket.depositFloat` |

Each returns `{ state, error, txHash, submit }` with state machine
`idle | approving | submitting | done | error`.

### ABIs

[`lib/contracts.ts`](lib/contracts.ts) hand-maintains a minimal ABI per
contract — just the methods the frontend calls, not the full ABI emitted by
Hardhat. Reasons:

- **Stable.** Adding a contract function doesn't change the ABI bundled into
  the frontend.
- **Type-narrow.** Wagmi/viem can infer types from a `const`-asserted ABI.
- **Lightweight.** No `artifacts/` import means no bundler tweaks.

When you change a contract's externally-called signature, update both the
Solidity file **and** `lib/contracts.ts`.

## Wallet setup

The app uses wagmi's `injected()` connector — works with MetaMask, Rabby,
Coinbase Wallet, OKX, etc. The chain definition in
[`components/Providers.tsx`](components/Providers.tsx) reads:

```ts
const arc = defineChain({
  id: parseInt(process.env.NEXT_PUBLIC_ARC_CHAIN_ID || "1234"),
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.arc.io"] } },
});
```

`NEXT_PUBLIC_*` env vars are the only way to ship a different chain or RPC.

## Environment

Set in `frontend/.env.local` (gitignored). Single source of truth is
[`deployments/arc-testnet.json`](../deployments/arc-testnet.json); run
[`scripts/load_addresses.sh`](../scripts/load_addresses.sh) to emit ready-to-paste
lines.

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_ARC_CHAIN_ID=421614
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.arc.network

# Filled after `cd contracts && npm run deploy:arc`
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_SIGNAL_MARKET_ADDRESS=0x...
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x...
```

## Running

```bash
npm install
npm run dev               # http://localhost:3000
```

```bash
npm run build             # production build
npm run start             # serve the build
npm run lint              # next lint
```

## Styling tokens

The design system lives in three places:

- [`tailwind.config.ts`](tailwind.config.ts) — colors, fonts, spacing
- [`app/globals.css`](app/globals.css) — keyframes (`ticker`, `blink`,
  `fade-up`)
- Inline `style={...}` in landing (`OrbCanvas`, hero wordmark) where Tailwind
  classes are too restrictive

Core colors (used everywhere as hex literals):

| Token | Hex | Where |
|-------|-----|-------|
| `bg`            | `#090c0a` | Page background |
| `bg-card`       | `#0c110d` | Cards / inputs |
| `border-card`   | `#0f1a11` | Card border |
| `border-input`  | `#162018` | Input border |
| `text-primary`  | `#d4ddd6` | Body text |
| `text-muted`    | `#4a5e4e` | Secondary text |
| `text-faint`    | `#2d3d30` | Captions, dividers |
| `accent`        | `#52e07c` | "ZK proven" green, links, primary CTAs |

## Deployment

This project ships [`vercel.json`](vercel.json); deploying to Vercel works
out of the box. For self-hosted:

```bash
docker build -t zkroute-frontend .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_BACKEND_URL=https://api.example.com \
  -e NEXT_PUBLIC_ARC_CHAIN_ID=421614 \
  -e NEXT_PUBLIC_ARC_RPC_URL=https://rpc.arc.network \
  zkroute-frontend
```

(No Dockerfile shipped today — `next start` works as the entry point if you
roll your own.)

## Common issues

| Symptom | Fix |
|---------|-----|
| `Cannot find module 'wagmi'` after `npm install` | Delete `frontend/node_modules` and `package-lock.json`, then `npm install` again. The repo's lockfile was generated with the current dep set; partial installs can leave it inconsistent. |
| Subscribe button stuck on "approving..." | Check console — the USDC approve tx was probably rejected/replaced. The hook will surface the error in the `chainError` state. |
| Provider page shows backend-only success | Means `NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS` is unset or zero. Run `scripts/load_addresses.sh > .env.local` from the frontend dir. |
| Hero canvas not rendering | GSAP requires client-side; this is already `"use client"`. If the build is using a strict CSP, allow inline canvas. |
| Equity curve empty | The dashboard demo data only loads when `address` is set and the backend returns ≥1 position. With no positions, it shows `no data`. |
