#!/bin/bash
# Full Groth16 trusted setup for track_record circuit
# Run once after compiling the circuit

set -e
mkdir -p build

echo "=== Compiling circuit ==="
circom zkroute/track_record.circom --r1cs --wasm --sym -o build/

echo "=== Phase 1: Powers of Tau (2^18 sufficient for N=100) ==="
# Download pre-existing ptau file (avoids running full ceremony)
if [ ! -f build/powersOfTau28_hez_final_18.ptau ]; then
  curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_18.ptau \
    -o build/powersOfTau28_hez_final_18.ptau
fi

echo "=== Phase 2: Circuit-specific setup ==="
npx snarkjs groth16 setup build/track_record.r1cs build/powersOfTau28_hez_final_18.ptau build/track_record_0.zkey

echo "=== Contribute randomness (non-interactive for dev) ==="
echo "zkRoute dev contribution $(date)" | npx snarkjs zkey contribute \
  build/track_record_0.zkey build/track_record_final.zkey --name="dev" -v

echo "=== Export verification key ==="
npx snarkjs zkey export verificationkey build/track_record_final.zkey build/verification_key.json

echo "=== Export Solidity verifier ==="
npx snarkjs zkey export solidityverifier build/track_record_final.zkey ../contracts/contracts/Verifier.sol

echo "=== Done. Add Verifier.sol address to .env as ZK_VERIFIER_ADDRESS ==="
