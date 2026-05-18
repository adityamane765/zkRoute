# contracts/

Solidity smart contracts for zkRoute, deployed on **Arc** (Circle's USDC L2).

All addresses referenced below are mirrored from
[`/deployments/arc-testnet.json`](../deployments/arc-testnet.json). Edit that
file when you deploy and the rest of the repo picks up the change via
[`scripts/load_addresses.sh`](../scripts/load_addresses.sh).

## Contracts

| Contract | Purpose | LoC |
|----------|---------|-----|
| [`ProviderRegistry.sol`](contracts/ProviderRegistry.sol) | Signal providers register here, post 100 USDC bond, can be slashed for fraud | ~135 |
| [`CommitReveal.sol`](contracts/CommitReveal.sol) | Per-signal commitment log; reveal verifies preimage and records outcome | ~110 |
| [`SignalMarket.sol`](contracts/SignalMarket.sol) | Buyer subscriptions, per-signal nanopayments, on-chain ZK proof verification, fee accounting | ~260 |
| [`Verifier.sol`](contracts/Verifier.sol) | Groth16 verifier. **Ships as a permissive stub** until the trusted setup runs | ~25 |
| [`MockERC20.sol`](contracts/MockERC20.sol) | Test USDC used on local Hardhat networks | ~20 |

### ProviderRegistry

| Function | Auth | Effect |
|----------|------|--------|
| `register(name, description, frequency, agentPublicKey)` | anyone | Transfers 100 USDC from caller to contract, records provider. Reverts if already registered or previously slashed. |
| `updateMetadata(name, description)` | provider | Update display strings only. |
| `deactivate()` | provider | Returns the 100 USDC stake. Provider becomes inactive but address is not blocked. |
| `slash(provider, reason)` | owner | Marks provider inactive + slashed. The 100 USDC moves to `slashedBalance` (not back to the provider). |
| `withdrawSlashedFunds(to)` | owner | Sends `slashedBalance` to `to`. **Only slashed funds — never active stakes.** |
| `pause()` / `unpause()` | owner | Stops new registrations. Does not affect existing providers. |

Storage:

```solidity
mapping(address => Provider) public providers;
address[] public providerList;
uint256 public slashedBalance;        // sum of slashed bonds awaiting treasury withdrawal
```

Reentrancy: `register`, `deactivate`, `withdrawSlashedFunds` are
`nonReentrant`. SafeERC20 used for all USDC moves.

### CommitReveal

A namespaced commit-reveal log. Each `(msg.sender, signalId)` pair stores at
most one commitment. Once committed, no one (not even the provider) can
re-commit that signalId.

| Function | Notes |
|----------|-------|
| `commit(bytes32 signalId, bytes32 hash)` | Records `hash` against `(msg.sender, signalId)`. Updates the rolling `commitmentRoot_` keccak chain. |
| `reveal(signalId, direction, assetId, salt, outcome)` | Reverts unless `keccak256(abi.encodePacked(signalId, direction, assetId, salt)) == storedHash`. Reveals must happen at least `MIN_REVEAL_DELAY_BLOCKS` (1) after commit, but no later than `MAX_REVEAL_WINDOW_BLOCKS` (50,000) after — preventing providers from holding many open commitments and selectively revealing winners months later. |
| `getCommitmentRoot(provider)` | Returns the rolling keccak root used as a public input to the ZK circuit. |
| `getCommitment(provider, signalId)` | Read-only access to a single commitment. |
| `getSignalCount(provider)` | Length of the provider's commitment history. |

The rolling root is updated **on commit** (not reveal), keeping `getCommitmentRoot`
O(1) for the ZK verifier to call.

### SignalMarket

Subscription, payment, and ZK-proof aggregator.

#### Subscription lifecycle

```
                       subscribe(provider, agent, pubkey, …, initialFloat)
                                      │
                                      ▼
                   ┌──────────────────────────────────┐
                   │  Subscription { active = true }  │
                   │  agent = <buyer's bot address>   │
                   │  float = <USDC>                  │
                   └─────────────┬────────────────────┘
                                 │
              ┌──────────────────┼───────────────────┐
              ▼                  ▼                   ▼
   processSignalPayment   depositFloat       unsubscribe (returns float)
   (callable by agent OR  (top up USDC)
    buyer; deducts float,
    splits fee + revenue)
```

#### Hard caps (enforced on subscribe/updateRiskBounds)

| Field | Cap |
|-------|-----|
| `maxPositionBps`  | ≤ 5,000 (50%) |
| `maxLeverageBps`  | between 10,000 (1x) and 100,000 (10x) |
| `dailyVarBps`     | ≤ 2,000 (20%) |
| `MIN_PROOF_INTERVAL_BLOCKS` | 10 (rate-limits proof spam) |

#### Fee accounting

`processSignalPayment(provider, buyer)` splits `signalPriceUsdc` into:

- `providerAmount = signalPriceUsdc - (signalPriceUsdc * 3% protocol fee)`
  → added to `providerRevenue[provider]`
- `fee`           → added to `treasuryBalance`

The three balances are mutually exclusive — buyer floats, provider revenue,
and treasury are all tracked separately. `withdrawFees` only withdraws
`treasuryBalance` (not other balances), `claimRevenue` only withdraws
`providerRevenue[msg.sender]`, and `unsubscribe` only returns the buyer's
remaining float.

#### Auth modifier

```solidity
modifier onlyAgentOrBuyer(address buyer, address provider) {
    Subscription storage sub = subscriptions[provider][buyer];
    require(msg.sender == buyer || msg.sender == sub.agent, "not authorized");
    _;
}
```

This is the fix to the original "only buyer" bug — the buyer pre-authorizes the
agent address at subscribe time, so the agent's own EOA can call
`processSignalPayment` on behalf of the buyer without holding the buyer's
private key.

#### ZK proof submission

```solidity
function submitStatsProof(
    uint256[2] calldata pA,
    uint256[2][2] calldata pB,
    uint256[2] calldata pC,
    uint256[4] calldata pubSignals  // [winRateBps, totalReturnBps, totalSignals, commitmentRoot]
) external whenNotPaused;
```

The contract calls `IZKVerifier(zkVerifier).verifyProof(pA, pB, pC, pubSignals)`.
On success, the stats are stored under `providerStats[msg.sender]` and the UI
can pull them.

Sanity checks:

- `pubSignals[3]` (commitmentRoot from the circuit) must equal
  `CommitReveal.getCommitmentRoot(msg.sender)` from the chain — preventing
  provider from proving against a different commitment set than the one
  publicly committed.
- `pubSignals[0]` (winRate) must be ≤ 10,000 bps.
- Submissions are rate-limited to once per 10 blocks per provider.

### Verifier (stub)

The shipped `Verifier.sol` returns `pubSignals[0] <= 10000`. **It accepts any
proof.** Replace it once the trusted setup is run; see
[circuits/README.md](../circuits/README.md). The deploy script refuses to
deploy the stub on `network=arc`.

To swap in the real verifier post-deploy:

```bash
# 1. Build the circuit (one-time)
cd circuits && npm run setup
# 2. The export writes contracts/contracts/Verifier.sol — re-deploy it
cd ../contracts
npx hardhat run scripts/deploy_verifier.js --network arc   # write this script
# 3. As contract owner, swap the address
cast send $SIGNAL_MARKET "setVerifier(address)" $NEW_VERIFIER \
  --rpc-url $ARC_RPC_URL --private-key $OWNER_KEY
```

## Building

```bash
npm install
npm run compile           # emits artifacts/ + cache/
```

The compiler is `solc 0.8.24` with `optimizer.runs = 200`. Adjust in
[`hardhat.config.js`](hardhat.config.js).

## Testing

```bash
npm test                  # runs Hardhat tests in test/
npm run coverage          # solidity-coverage (requires installed)
```

Test files cover:

| File | Coverage |
|------|----------|
| [test/ProviderRegistry.test.js](test/ProviderRegistry.test.js) | registration, stake handling, slashing, pause, name/desc bounds |
| [test/CommitReveal.test.js](test/CommitReveal.test.js) | commit/reveal happy path, replay protection, hash mismatch, max-window expiry, root isolation per provider |
| [test/SignalMarket.test.js](test/SignalMarket.test.js) | subscribe bounds, agent vs buyer auth, payment splits, treasury isolation, claimRevenue, pause, proof submission with stub verifier |

CI runs `npm test` on every push (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

## Deploying

### Local (Hardhat node)

```bash
npx hardhat node          # terminal 1
npm run deploy:local      # terminal 2
```

The deploy script auto-deploys a `MockERC20` USDC for local networks unless
`USDC_ADDRESS` is set.

### Arc testnet

1. Set in `.env`:
   ```
   ARC_RPC_URL=https://rpc.arc.network
   ARC_CHAIN_ID=421614
   ARC_PRIVATE_KEY=0x...
   USDC_ADDRESS=<from Circle docs>
   ```
2. Optional: set `ZK_VERIFIER_ADDRESS` if you've already deployed a real
   verifier. If unset on `arc`, the script **refuses to deploy** (won't ship
   a stub verifier to a public network).
3. Run:
   ```bash
   npm run deploy:arc
   ```
4. The script prints all addresses. Paste them into
   [`deployments/arc-testnet.json`](../deployments/arc-testnet.json), then run
   `scripts/load_addresses.sh >> .env` to propagate to other subtrees.

## Storage layout

A condensed map for auditors:

### ProviderRegistry

```
slot 0    Ownable.owner
slot 1    Pausable._paused
slot 2    ReentrancyGuard._status
slot 3    providers (mapping)
slot 4    providerList (dynamic array)
slot 5    providerIndex (mapping)
slot 6    slashedBalance (uint256)
```

### SignalMarket

```
slot 0    Ownable.owner
slot 1    Pausable._paused
slot 2    ReentrancyGuard._status
slot 3    zkVerifier (address)
slot 4    signalPriceUsdc (uint256)
slot 5    subscriptions (mapping)
slot 6    providerRevenue (mapping)
slot 7    providerStats (mapping)
slot 8    treasuryBalance (uint256)
```

(Immutables `usdc`, `registry`, `commitReveal` are embedded in code, not storage.)

## Gas notes

Optimizer set to `runs = 200`, biasing for deploy size on Arc. If you expect
many subscriptions per buyer, consider raising to `1_000_000` and accept the
larger deploy cost.

Approximate gas per common call (Hardhat, optimizer at 200):

| Call | Gas |
|------|-----|
| `ProviderRegistry.register` | ~190k (one cold SLOAD + USDC transfer) |
| `CommitReveal.commit`       | ~85k  (one SSTORE + array push + root update) |
| `CommitReveal.reveal`       | ~50k  (verify keccak, flip flags) |
| `SignalMarket.subscribe`    | ~165k (writes 8 storage slots + USDC transfer) |
| `SignalMarket.processSignalPayment` | ~70k  (updates float, revenue, treasury) |

## Inter-contract dependencies

```
ProviderRegistry ──┐
                   │
CommitReveal ──────┼──► SignalMarket
                   │       │
Verifier (Groth16) ┘       └── via setVerifier(addr) (mutable, owner-only)
```

`SignalMarket` calls `registry.getProvider(provider).active` on subscribe and
`commitReveal.getCommitmentRoot(provider)` on proof submission. Neither call
performs a state write — pure view calls.

## Files

```
contracts/
├── README.md                  # this file
├── .gitignore
├── hardhat.config.js
├── package.json
├── contracts/
│   ├── ProviderRegistry.sol
│   ├── CommitReveal.sol
│   ├── SignalMarket.sol
│   ├── Verifier.sol           # stub, swap post-trusted-setup
│   └── MockERC20.sol
├── scripts/
│   └── deploy.js
└── test/
    ├── ProviderRegistry.test.js
    ├── CommitReveal.test.js
    └── SignalMarket.test.js
```
