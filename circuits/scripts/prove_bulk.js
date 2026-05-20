/**
 * prove_bulk.js — adapter that reads /tmp/bulk_signals.json (from
 * contracts/scripts/bulk_signals.js), mod-reduces field-exceeding values,
 * and produces a Groth16 proof ready to submit to SignalMarket.submitStatsProof.
 *
 *   node scripts/prove_bulk.js --in /tmp/bulk_signals.json --out /tmp/proof.json
 *
 * The signalIds passed to submitStatsProof are the FULL on-chain bytes32
 * (so verifySignalBatch can find them via mapping lookup). The circuit's
 * internal field elements are the mod-r versions — this is fine because the
 * contract doesn't constrain them to be equal.
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

const N = 100;
const RETURN_OFFSET = 5000n;
// BN254 scalar field
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function modR(hex) {
  return BigInt(hex) % R;
}

async function main() {
  const args = process.argv.slice(2);
  const inPath  = args[args.indexOf("--in")  + 1] || "/tmp/bulk_signals.json";
  const outPath = args[args.indexOf("--out") + 1] || "/tmp/proof.json";

  const signals = JSON.parse(fs.readFileSync(inPath));
  if (signals.length !== N) {
    throw new Error(`expected exactly ${N} signals, got ${signals.length}`);
  }

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Circuit inputs (all field-element-friendly)
  const signalIds  = signals.map(s => modR(s.signalId).toString());
  const directions = signals.map(s => BigInt(s.direction).toString());
  const salts      = signals.map(s => modR(s.salt).toString());
  const outcomes   = signals.map(s => BigInt(s.outcome).toString());
  const returns    = signals.map(s => BigInt(s.returnBps).toString());

  // Compute the same Poseidon root the circuit will produce
  let root = 0n;
  for (let i = 0; i < N; i++) {
    const h = poseidon([BigInt(signalIds[i]), BigInt(directions[i]), BigInt(salts[i])]);
    const hBig = F.toObject(h);
    const chained = poseidon([root, hBig]);
    root = F.toObject(chained);
  }

  const wins = outcomes.reduce((a, b) => a + BigInt(b), 0n);
  const returnSum = returns.reduce((a, b) => a + BigInt(b), 0n);
  const totalSignals = BigInt(N);
  const winRateBps = (wins * 10000n) / totalSignals;
  const totalReturnBps = returnSum - totalSignals * RETURN_OFFSET;

  console.log(`signals:        ${N}`);
  console.log(`wins:           ${wins}`);
  console.log(`winRateBps:     ${winRateBps}  (=${Number(winRateBps) / 100}%)`);
  console.log(`totalReturnBps: ${totalReturnBps}`);
  console.log(`commitmentRoot: ${root}`);

  const input = {
    winRateBps: winRateBps.toString(),
    totalReturnBps: totalReturnBps.toString(),
    totalSignals: totalSignals.toString(),
    commitmentRoot: root.toString(),
    signalIds, directions, salts, outcomes, returns,
  };

  const wasmPath = path.resolve(__dirname, "../build/track_record_js/track_record.wasm");
  const zkeyPath = path.resolve(__dirname, "../build/track_record_final.zkey");
  const vkeyPath = path.resolve(__dirname, "../build/verification_key.json");

  console.log("\n→ generating proof…");
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  console.log(`  proof generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log("→ verifying locally…");
  const vKey = JSON.parse(fs.readFileSync(vkeyPath));
  const ok = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  if (!ok) throw new Error("local verification failed");
  console.log("  ✓ local verify passed");

  // Format calldata for submitStatsProof
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  // The on-chain submitStatsProof also needs the bytes32 signalIds + hashes.
  const onChainSignalIds = signals.map(s => s.signalId);
  const onChainHashes    = signals.map(s => s.hash);

  fs.writeFileSync(outPath, JSON.stringify({
    proof, publicSignals, calldata,
    signalIds: onChainSignalIds,
    hashes:    onChainHashes,
    stats: {
      winRateBps:     winRateBps.toString(),
      totalReturnBps: totalReturnBps.toString(),
      totalSignals:   totalSignals.toString(),
      commitmentRoot: root.toString(),
    },
  }, null, 2));
  console.log(`\nproof written to ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
