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
    // Local Hardhat default; Anvil also uses this. Anything else is an error.
    uint256 private constant HARDHAT_CHAIN_ID = 31337;

    constructor() {
        // Refuse to deploy outside a local dev chain. Prevents an accidental
        // `npx hardhat run scripts/deploy.js --network arc` from putting a
        // permissive verifier on a public network.
        require(block.chainid == HARDHAT_CHAIN_ID, "MockVerifier: local-only");
    }

    function verifyProof(
        uint256[2] calldata /* pA */,
        uint256[2][2] calldata /* pB */,
        uint256[2] calldata /* pC */,
        uint256[4] calldata pubSignals
    ) external pure returns (bool) {
        // Smell check only: first public input bounded. The real verifier
        // would do a pairing check.
        return pubSignals[0] <= 10_000;
    }
}
