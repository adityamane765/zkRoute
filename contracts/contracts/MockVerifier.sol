// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockVerifier
 * @notice Permissive verifier used exclusively by Hardhat tests that exercise
 *         SignalMarket logic AROUND the verifier (rate-limiting, root mismatch,
 *         pause behaviour). Real proofs are checked by the snarkjs-exported
 *         `Groth16Verifier` in Verifier.sol. This contract is NEVER deployed
 *         to a real network — the deploy script only uses Groth16Verifier.
 */
contract MockVerifier {
    function verifyProof(
        uint256[2] calldata /* pA */,
        uint256[2][2] calldata /* pB */,
        uint256[2] calldata /* pC */,
        uint256[4] calldata pubSignals
    ) external pure returns (bool) {
        // Match the original stub's smell-check: winRate must be ≤ 100%.
        return pubSignals[0] <= 10_000;
    }
}
