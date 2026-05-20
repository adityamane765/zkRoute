# Variable-N circuit hardening (BLOCKERS.md #14)

## Problem

The current `track_record.circom` is compiled at `N=100`. Providers must
submit exactly 100 real signals to `submitStatsProof`, because:

- The contract requires `signalIds.length == pubSignals[2]` (`totalSignals`).
- The circuit doesn't constrain padded positions — so a malicious prover
  could populate the "padding" with real losses they want to hide and submit
  a smaller `totalSignals` than reality.

## The fix (drafted, requires new trusted setup)

Add a `LessThan` comparator per position, gating each signal's contribution
to `winSum` and `returnSum` by `isReal[i] = (i < totalSignals)`. Force
padded positions to `(outcome=0, return=5000)`:

```circom
component isLT[N];
signal isReal[N];
for (var i = 0; i < N; i++) {
    isLT[i] = LessThan(8);            // N=100 fits in 8 bits
    isLT[i].in[0] <== i;
    isLT[i].in[1] <== totalSignals;
    isReal[i] <== isLT[i].out;
}

signal winContrib[N];
signal retOffset[N];

for (var i = 0; i < N; i++) {
    outcomes[i] * (outcomes[i] - 1) === 0;
    // Padded positions MUST have outcome=0 and return=5000
    (1 - isReal[i]) * outcomes[i] === 0;
    (1 - isReal[i]) * (returns[i] - 5000) === 0;

    winContrib[i] <== isReal[i] * outcomes[i];
    winSum[i+1] <== winSum[i] + winContrib[i];

    retOffset[i] <== returns[i] - 5000;
    returnSum[i+1] <== returnSum[i] + isReal[i] * retOffset[i];
}

winCount === winSum[N];
totalReturnBps === returnSum[N];   // cleaner — sum is already offset-corrected

// Defense in depth: totalSignals ∈ [1, N]
component nonZero = GreaterThan(8);
nonZero.in[0] <== totalSignals;
nonZero.in[1] <== 0;
nonZero.out === 1;

component capN = LessEqThan(8);
capN.in[0] <== totalSignals;
capN.in[1] <== N;
capN.out === 1;
```

## Why this isn't shipped yet

Any change to the circuit invalidates the existing trusted-setup zkey
(`circuits/build/track_record_final.zkey`). Shipping this would require:

1. Recompiling the circuit (~5 s).
2. Re-running `npm run setup` to regenerate the zkey from the existing
   ptau (~30 s).
3. Re-exporting `Verifier.sol` (~2 s).
4. Deploying the new `Groth16Verifier` to Arc (~10 s + gas).
5. Calling `SignalMarket.setVerifier(newAddress)` from the owner (~5 s + gas).
6. Updating `.env` + `deployments/arc-testnet.json` with the new verifier
   address.

We're currently a few hours after a fresh trusted setup. Re-doing it for
this hardening on its own is wasteful. The right time to ship this is
**bundled with blocker #5** (Poseidon binding fix) — both require a fresh
ceremony, so we do them together.

## When to ship

Wire this in **at the same time** as the Option B Poseidon hash binding from
BLOCKERS.md #5. Both touch the circuit; a single trusted-setup ceremony
covers both improvements.
