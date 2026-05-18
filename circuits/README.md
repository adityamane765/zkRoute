# circuits/

Groth16 circuit that proves a signal provider's track record without revealing
the individual signals.

## What the circuit proves

Given:

- **Public inputs:** `winRateBps`, `totalReturnBps`, `totalSignals`,
  `commitmentRoot` (the rolling keccak chain stored in
  [`CommitReveal.sol`](../contracts/contracts/CommitReveal.sol)).
- **Private inputs:** `signalIds[N]`, `directions[N]`, `salts[N]`,
  `outcomes[N]`, `returns[N]` (offset-encoded so 5000 = 0% return).

The circuit asserts:

1. **Commitments match.** For every i, `Poseidon(signalId, direction, salt)`
   equals the i-th input to the rolling root. The chained root equals
   `commitmentRoot`. This pins the provider to a specific set of signals.
2. **Outcomes are binary.** `outcomes[i] * (outcomes[i] - 1) == 0`.
3. **Win rate is correct.** `winRateBps * N == sum(outcomes) * 10000`.
4. **Total return is correct.** `totalReturnBps == sum(returns) - N * 5000`.

A passing proof = "I committed N signals on-chain that, evaluated against
their actual outcomes, produce exactly these public stats." The individual
trades, salts, and outcomes are never revealed.

## Circuit parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| `N`       | 100   | Fixed-size signal window. Pad with neutral dummy signals if you have fewer. |
| Hash      | Poseidon | Snark-friendly. Two variants used: 3-input for per-signal hash, 2-input for chaining. |
| Curve     | bn128 | Required by snarkjs Groth16. |
| Ptau size | 2^18  | Sufficient for N=100. ~4 GB download. |

`N` is a compile-time constant — to change it, edit the last line of
[`track_record.circom`](zkroute/track_record.circom) and re-run the setup.

## Files

```
circuits/
├── README.md
├── .gitignore
├── package.json
├── zkroute/
│   └── track_record.circom     # the circuit
├── scripts/
│   ├── setup.sh                # one-time Groth16 trusted setup
│   └── prove.js                # generate a proof for one provider's history
└── build/                      # (gitignored) — wasm, r1cs, zkey, verification_key.json
```

## Prerequisites

```bash
# circom 2.1.6 (https://github.com/iden3/circom)
git clone https://github.com/iden3/circom.git
cd circom && cargo install --path circom

# snarkjs (global)
npm i -g snarkjs

# circuit deps (Poseidon, comparators, bitify)
cd circuits
npm install
```

## Trusted setup

```bash
cd circuits
bash scripts/setup.sh
```

The script:

1. Compiles `track_record.circom` → `build/track_record.r1cs`,
   `build/track_record.wasm`, `build/track_record.sym`.
2. Downloads `powersOfTau28_hez_final_18.ptau` (~4 GB) from Iden3's S3 if not
   already present.
3. Runs Phase 2 setup with a single dev contribution. **For production, replace
   this single contribution with a multi-party ceremony.**
4. Exports `build/verification_key.json` and
   `../contracts/contracts/Verifier.sol`.

Expected runtime: ~10 minutes on a fast laptop, dominated by the Phase 1 download.

> The shipped `Verifier.sol` is a permissive stub. After this script runs, the
> file is overwritten with the real Groth16 verifier. Commit the new file or
> deploy it directly — either way, swap it in via `SignalMarket.setVerifier`.

## Generating a proof

The provider agent emits `signals.json` via
[`save_signal_history`](../agents/provider/agent.py). Then:

```bash
cd circuits
node scripts/prove.js --signals signals.json --out proof.json
```

The output `proof.json` contains:

```jsonc
{
  "proof":         { /* Groth16 a, b, c */ },
  "publicSignals": ["6800", "2340", "100", "<root>"],
  "calldata":      "0x..., [..], [..], [..]",   // ready for submitStatsProof
  "stats": {
    "winRateBps":     "6800",
    "totalReturnBps": "2340",
    "totalSignals":   "100",
    "commitmentRoot": "<root>"
  }
}
```

Submit on-chain:

```bash
cast send $SIGNAL_MARKET \
  "submitStatsProof(uint256[2],uint256[2][2],uint256[2],uint256[4])" \
  $(jq -r '.calldata' proof.json) \
  --rpc-url $ARC_RPC_URL --private-key $PROVIDER_KEY
```

(Replace with hardhat/web3.py call as appropriate.)

## Padding

If the provider has fewer than `N=100` real signals, `prove.js` pads with
dummy signals having:

```js
direction = 0
outcome   = 0
returnBps = 5000   // offset encoding for 0%
signalId  = deterministic from index
salt      = deterministic from index
```

The dummy signals contribute 0 wins and 0 net return, but their commitments
**are still chained into the root**, so the on-chain `commitmentRoot` must
match — i.e., the provider must also have committed all 100 signals
(real + padding) on Arc. The provider agent does this automatically.

## Verifier swap procedure

The whole point of the stub is to let you deploy the rest of the system before
the (expensive, ceremony-bound) trusted setup. To upgrade:

1. Run `bash scripts/setup.sh`. The new `Verifier.sol` is written to
   `contracts/contracts/Verifier.sol`.
2. Recompile + deploy:
   ```bash
   cd ../contracts
   npm run compile
   npx hardhat run scripts/deploy_verifier.js --network arc
   # output: NEW_VERIFIER=0x...
   ```
3. As `SignalMarket` owner:
   ```bash
   cast send $SIGNAL_MARKET "setVerifier(address)" $NEW_VERIFIER \
     --rpc-url $ARC_RPC_URL --private-key $OWNER_KEY
   ```
4. Update [`deployments/arc-testnet.json`](../deployments/arc-testnet.json):
   set `contracts.Verifier.address` to `$NEW_VERIFIER`.

## Performance notes

| Phase | Approx. time (M2 MacBook) |
|-------|---------------------------|
| `circom` compile | ~5 s |
| Phase 1 download | ~3 min (4 GB) |
| `groth16 setup` | ~30 s |
| Single contribution | ~10 s |
| `solidityverifier` export | ~2 s |
| Proof generation (N=100) | ~2–5 s |
| On-chain verification gas | ~280k |

## Why Poseidon, not keccak?

Keccak is cheap in Solidity but expensive in a SNARK (~50k constraints per
hash). Poseidon is the opposite — designed to be efficient inside ZK circuits.

We use Poseidon **inside the circuit** for chaining commitments, and keccak
**on-chain** for the `commitmentRoot` view in `CommitReveal.sol`. The two
must agree: the circuit's `commitmentRoot` public output is the chained
Poseidon hash, while `CommitReveal` exposes a chained keccak hash. **They are
not the same value.**

> **Important:** Today the on-chain commitment root in `CommitReveal.sol` is a
> chained keccak, and the circuit produces a chained Poseidon. The on-chain
> equality check in `SignalMarket.submitStatsProof` therefore compares
> *the value the provider claims as `commitmentRoot` to the chained keccak
> in CommitReveal*. To make these align, either (a) move the on-chain
> aggregation into the circuit by passing each `signalId` as a public input
> (expensive) or (b) switch the on-chain root to also use Poseidon via an
> in-EVM Poseidon implementation. **This mismatch is a known issue tracked
> as part of the trusted-setup work** and must be resolved before relying on
> proofs in production.

## License

Inherits the repo's MIT license. Snarkjs and circomlib are MIT/Apache.
