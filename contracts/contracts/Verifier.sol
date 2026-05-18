// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Verifier (development stub)
 * @notice This is a temporary placeholder that satisfies the IZKVerifier interface so
 *         contracts compile and integration tests run before the real trusted setup
 *         output is wired in. Once `npm run setup` produces `circuits/build/track_record_final.zkey`,
 *         run `npm run export-verifier` (from circuits/) to OVERWRITE this file with the
 *         real Groth16 verifier exported by snarkjs.
 *
 *         The stub accepts any proof. It MUST be replaced before mainnet deployment.
 *         For safety, deployments to `arc` or `mainnet` networks check that the
 *         deployed verifier's runtime bytecode hash is not the stub's.
 */
contract Verifier {
    bool public immutable IS_STUB = true;

    function verifyProof(
        uint256[2] calldata /* pA */,
        uint256[2][2] calldata /* pB */,
        uint256[2] calldata /* pC */,
        uint256[4] calldata pubSignals
    ) external pure returns (bool) {
        // Minimal sanity: pubSignals[0] (winRateBps) cannot exceed 10_000 (=100%).
        // Real verifier enforces this via the circuit; this is a smell check only.
        return pubSignals[0] <= 10_000;
    }
}
