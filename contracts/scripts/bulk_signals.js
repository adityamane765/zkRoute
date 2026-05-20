/**
 * Bulk-generate 100 (signalId, direction, salt, outcome) tuples, commit them
 * all to the new CommitReveal, then reveal them all. Persists the data to
 * /tmp/bulk_signals.json so the prover can use it.
 *
 * Run as the PROVIDER (not the deployer) so its address owns the signals:
 *   PROVIDER_AGENT_PRIVATE_KEY=... \
 *     npx hardhat run scripts/bulk_signals.js --network arc
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const crypto = require("crypto");

const N = 100;
const ASSETS = ["ETH", "BTC"];

function randBytes32() {
  return "0x" + crypto.randomBytes(32).toString("hex");
}

async function main() {
  const wallet = new ethers.Wallet(process.env.PROVIDER_AGENT_PRIVATE_KEY, ethers.provider);
  const cr = (await ethers.getContractAt("CommitReveal", process.env.COMMIT_REVEAL_ADDRESS)).connect(wallet);

  console.log(`Provider EOA: ${wallet.address}`);
  console.log(`CommitReveal: ${process.env.COMMIT_REVEAL_ADDRESS}`);
  console.log(`Generating ${N} signals...\n`);

  // 1. Generate the signal data
  const signals = [];
  for (let i = 0; i < N; i++) {
    const signalId = randBytes32();
    const salt     = randBytes32();
    const direction = Math.random() < 0.5 ? 0 : 1;
    const asset    = ASSETS[i % ASSETS.length];
    const assetId  = ethers.keccak256(ethers.toUtf8Bytes(asset));
    const hash     = ethers.solidityPackedKeccak256(
      ["bytes32", "uint8", "bytes32", "bytes32"],
      [signalId, direction, assetId, salt]
    );
    // 65% win rate; outcome is purely demo
    const outcome  = Math.random() < 0.65 ? 1 : 0;
    // return: +200bps if win, -150bps if loss (offset by +5000 for the circuit)
    const returnBps = (outcome ? 200 : -150) + 5000;
    signals.push({ signalId, salt, direction, asset, assetId, hash, outcome, returnBps });
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const BATCH = 5;
  const BATCH_GAP_MS = 1500;

  // 2. Commit in small batches to avoid overwhelming Canteen's RPC.
  console.log(`→ Committing ${N} signals (batches of ${BATCH})…`);
  let nonce = await ethers.provider.getTransactionCount(wallet.address, "pending");
  const t0 = Date.now();
  for (let i = 0; i < N; i += BATCH) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH, N); j++) {
      batch.push(cr.commit(signals[j].signalId, signals[j].hash, { nonce: nonce++ }));
    }
    const sent = await Promise.all(batch);
    await Promise.all(sent.map(t => t.wait()));
    process.stdout.write(`  ${i + batch.length}/${N}\r`);
    if (i + BATCH < N) await sleep(BATCH_GAP_MS);
  }
  console.log(`\n  ✓ ${N} commits landed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 3. Reveal in the same batched pattern.
  console.log(`\n→ Revealing ${N} signals (batches of ${BATCH})…`);
  nonce = await ethers.provider.getTransactionCount(wallet.address, "pending");
  const t1 = Date.now();
  for (let i = 0; i < N; i += BATCH) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH, N); j++) {
      const s = signals[j];
      batch.push(cr.reveal(s.signalId, s.direction, s.assetId, s.salt, !!s.outcome, { nonce: nonce++ }));
    }
    const sent = await Promise.all(batch);
    await Promise.all(sent.map(t => t.wait()));
    process.stdout.write(`  ${i + batch.length}/${N}\r`);
    if (i + BATCH < N) await sleep(BATCH_GAP_MS);
  }
  console.log(`\n  ✓ ${N} reveals landed in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  // 4. Confirm on-chain count
  const revealedCount = await cr.revealedCount(wallet.address);
  console.log(`\nOn-chain revealedCount(${wallet.address}) = ${revealedCount}`);

  // 5. Persist for the prover. The circuit expects:
  //   signalId, direction, salt, outcome, returnBps
  fs.writeFileSync(
    "/tmp/bulk_signals.json",
    JSON.stringify(
      signals.map(s => ({
        signalId:  s.signalId,
        direction: s.direction,
        salt:      s.salt,
        outcome:   s.outcome,
        returnBps: s.returnBps,
        // also pass the on-chain keccak hash for verifySignalBatch on submission
        hash:      s.hash,
      })),
      null, 2
    )
  );
  console.log(`\nWrote ${N} signals to /tmp/bulk_signals.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
