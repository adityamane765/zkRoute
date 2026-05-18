/**
 * prove.js — generates a Groth16 proof for a provider's track record
 *
 * Usage:
 *   node scripts/prove.js --signals signals.json --out proof.json
 *
 * signals.json format:
 * [
 *   { "signalId": "0x...", "direction": 1, "salt": "0x...", "outcome": 1, "returnBps": 5230 },
 *   ...
 * ]
 * returnBps is offset by 5000: 5230 = +230bps win, 4800 = -200bps loss, 5000 = 0%
 */

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

const N = 100; // must match circuit parameter
const RETURN_OFFSET = 5000n;

async function main() {
  const args = process.argv.slice(2);
  const signalsPath = args[args.indexOf("--signals") + 1] || "signals.json";
  const outPath = args[args.indexOf("--out") + 1] || "proof.json";

  const raw = JSON.parse(fs.readFileSync(signalsPath));
  if (raw.length > N) throw new Error(`Too many signals (max ${N})`);

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Pad to N with dummy signals (outcome=0, return=5000=neutral)
  const signals = [...raw];
  while (signals.length < N) {
    signals.push({
      signalId: "0x" + BigInt(signals.length + 0xDEAD).toString(16).padStart(64, "0"),
      direction: 0,
      salt: "0x" + BigInt(signals.length + 0xBEEF).toString(16).padStart(64, "0"),
      outcome: 0,
      returnBps: 5000,
    });
  }

  // Build input arrays
  const signalIds = signals.map(s => BigInt(s.signalId));
  const directions = signals.map(s => BigInt(s.direction));
  const salts = signals.map(s => BigInt(s.salt));
  const outcomes = signals.map(s => BigInt(s.outcome));
  const returns = signals.map(s => BigInt(s.returnBps));

  // Compute commitment root (Poseidon chained)
  let root = 0n;
  const commitmentHashes = [];
  for (let i = 0; i < N; i++) {
    const h = poseidon([signalIds[i], directions[i], salts[i]]);
    const hBig = F.toObject(h);
    commitmentHashes.push(hBig);
    const chained = poseidon([root, hBig]);
    root = F.toObject(chained);
  }

  // Compute public stats
  const wins = outcomes.reduce((a, b) => a + b, 0n);
  const returnSum = returns.reduce((a, b) => a + b, 0n);
  const totalSignals = BigInt(N);
  const winRateBps = (wins * 10000n) / totalSignals;
  const totalReturnBps = returnSum - totalSignals * RETURN_OFFSET;

  const input = {
    winRateBps: winRateBps.toString(),
    totalReturnBps: totalReturnBps.toString(),
    totalSignals: totalSignals.toString(),
    commitmentRoot: root.toString(),
    signalIds: signalIds.map(String),
    directions: directions.map(String),
    salts: salts.map(String),
    outcomes: outcomes.map(String),
    returns: returns.map(String),
  };

  console.log("Generating witness...");
  const wasmPath = path.resolve(__dirname, "../build/track_record_js/track_record.wasm");
  const zkeyPath = path.resolve(__dirname, "../build/track_record_final.zkey");
  const vkeyPath = path.resolve(__dirname, "../build/verification_key.json");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  // Verify locally before returning
  const vKey = JSON.parse(fs.readFileSync(vkeyPath));
  const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  if (!valid) throw new Error("Proof verification failed locally!");

  // Export calldata for on-chain submitStatsProof
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);

  const output = {
    proof,
    publicSignals,
    calldata,
    stats: {
      winRateBps: winRateBps.toString(),
      totalReturnBps: totalReturnBps.toString(),
      totalSignals: totalSignals.toString(),
      commitmentRoot: root.toString(),
    },
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Proof written to ${outPath}`);
  console.log(`Win rate: ${winRateBps}bps (${Number(winRateBps)/100}%)`);
  console.log(`Total return: ${totalReturnBps}bps`);
}

main().catch(e => { console.error(e); process.exit(1); });
