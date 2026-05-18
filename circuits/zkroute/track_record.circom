pragma circom 2.1.6;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

/**
 * TrackRecord — proves win rate and total return over N signals
 *
 * Public inputs (what everyone sees):
 *   - winRateBps      : wins / totalSignals * 10000
 *   - totalReturnBps  : cumulative return in bps
 *   - totalSignals    : number of signals in this proof
 *   - commitmentRoot  : rolling Poseidon hash of all signal commitments
 *
 * Private inputs (never revealed):
 *   - signalIds[N]    : unique IDs per signal
 *   - directions[N]   : 1=long, 0=short
 *   - salts[N]        : random salts used during commitment
 *   - outcomes[N]     : 1=win, 0=loss
 *   - returns[N]      : return in bps for each signal (signed via offset: 5000 = 0%)
 *
 * The circuit:
 *   1. Recomputes each commitment hash = Poseidon(signalId, direction, salt)
 *   2. Chains them into commitmentRoot = Poseidon(Poseidon(...), hash_i)
 *   3. Counts wins and sums returns
 *   4. Constrains winRateBps = wins * 10000 / N
 *   5. Constrains totalReturnBps = sum(returns) - N*5000  (remove offset)
 *
 * MVP: N = 100 (fixed-size, pad with dummy signals that have outcome=0, return=5000)
 */
template TrackRecord(N) {
    // Public
    signal input winRateBps;
    signal input totalReturnBps;
    signal input totalSignals;
    signal input commitmentRoot;

    // Private
    signal input signalIds[N];
    signal input directions[N];
    signal input salts[N];
    signal input outcomes[N];
    signal input returns[N];    // offset by 5000 (5000 = 0% return)

    // ── Step 1: Recompute commitments and chain into root ──────────────────
    component hashers[N];
    component chainers[N];
    signal roots[N+1];
    roots[0] <== 0;

    for (var i = 0; i < N; i++) {
        // Commitment hash per signal
        hashers[i] = Poseidon(3);
        hashers[i].inputs[0] <== signalIds[i];
        hashers[i].inputs[1] <== directions[i];
        hashers[i].inputs[2] <== salts[i];

        // Chain into running root
        chainers[i] = Poseidon(2);
        chainers[i].inputs[0] <== roots[i];
        chainers[i].inputs[1] <== hashers[i].out;
        roots[i+1] <== chainers[i].out;
    }

    // Commitment root must match public input
    roots[N] === commitmentRoot;

    // ── Step 2: Count wins and sum returns ─────────────────────────────────
    // outcomes[i] must be 0 or 1
    signal winSum[N+1];
    signal returnSum[N+1];
    winSum[0] <== 0;
    returnSum[0] <== 0;

    for (var i = 0; i < N; i++) {
        // Enforce binary outcome
        outcomes[i] * (outcomes[i] - 1) === 0;

        winSum[i+1] <== winSum[i] + outcomes[i];
        returnSum[i+1] <== returnSum[i] + returns[i];
    }

    // ── Step 3: Constrain public stats ─────────────────────────────────────
    // totalSignals is public — must equal N
    totalSignals === N;

    // winRateBps = winSum[N] * 10000 / N
    // To avoid division in circuit: winRateBps * N === winSum[N] * 10000
    winRateBps * N === winSum[N] * 10000;

    // totalReturnBps = returnSum[N] - N * 5000  (remove offset encoding)
    totalReturnBps === returnSum[N] - N * 5000;
}

component main {public [winRateBps, totalReturnBps, totalSignals, commitmentRoot]} = TrackRecord(100);
