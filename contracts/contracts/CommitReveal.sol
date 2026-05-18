// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CommitReveal
 * @notice Providers commit a hash of each signal before the market moves.
 *         After the market resolves they reveal + prove against the commitment.
 *         Arc's sub-second finality makes the commit window tight — cheating requires
 *         predicting the future, not just being fast.
 *
 *         Commitment: keccak256(abi.encodePacked(signalId, direction, assetId, salt))
 *         Signal details are never stored on-chain, only the hash.
 */
contract CommitReveal {
    struct Commitment {
        bytes32 hash;       // keccak256 of signal params + salt
        uint256 blockNumber;
        uint256 timestamp;
        bool revealed;
    }

    // provider => signalId => Commitment
    mapping(address => mapping(bytes32 => Commitment)) public commitments;

    // provider => ordered list of signal IDs (for ZK proof generation)
    mapping(address => bytes32[]) public signalHistory;

    // Minimum blocks before reveal is allowed (anti-cherry-pick: can't reveal same block)
    uint256 public constant MIN_REVEAL_DELAY_BLOCKS = 1;

    event SignalCommitted(address indexed provider, bytes32 indexed signalId, bytes32 hash, uint256 blockNumber);
    event SignalRevealed(address indexed provider, bytes32 indexed signalId, bool outcome);

    function commit(bytes32 signalId, bytes32 hash) external {
        require(commitments[msg.sender][signalId].blockNumber == 0, "already committed");
        commitments[msg.sender][signalId] = Commitment({
            hash: hash,
            blockNumber: block.number,
            timestamp: block.timestamp,
            revealed: false
        });
        signalHistory[msg.sender].push(signalId);

        emit SignalCommitted(msg.sender, signalId, hash, block.number);
    }

    /**
     * @notice Reveal the signal. Verifies the preimage matches the committed hash.
     * @param signalId  Unique ID for this signal
     * @param direction 1 = long, 0 = short (kept minimal to limit leakage)
     * @param assetId   Identifier for the asset (e.g. keccak256("ETH"))
     * @param salt      Random salt used during commitment
     * @param outcome   true = win, false = loss (determined by oracle off-chain, passed here)
     */
    function reveal(
        bytes32 signalId,
        uint8 direction,
        bytes32 assetId,
        bytes32 salt,
        bool outcome
    ) external {
        Commitment storage c = commitments[msg.sender][signalId];
        require(c.blockNumber != 0, "no commitment");
        require(!c.revealed, "already revealed");
        require(block.number >= c.blockNumber + MIN_REVEAL_DELAY_BLOCKS, "too early");

        bytes32 expectedHash = keccak256(abi.encodePacked(signalId, direction, assetId, salt));
        require(expectedHash == c.hash, "hash mismatch");

        c.revealed = true;
        emit SignalRevealed(msg.sender, signalId, outcome);
    }

    function getCommitment(address provider, bytes32 signalId)
        external view returns (Commitment memory)
    {
        return commitments[provider][signalId];
    }

    function getSignalHistory(address provider) external view returns (bytes32[] memory) {
        return signalHistory[provider];
    }

    function getSignalCount(address provider) external view returns (uint256) {
        return signalHistory[provider].length;
    }

    /**
     * @notice Returns the Merkle-root-style aggregation of all committed hashes
     *         for this provider (used as public input to ZK circuit).
     */
    function getCommitmentRoot(address provider) external view returns (bytes32) {
        bytes32[] memory ids = signalHistory[provider];
        if (ids.length == 0) return bytes32(0);
        bytes32 acc = bytes32(0);
        for (uint256 i = 0; i < ids.length; i++) {
            acc = keccak256(abi.encodePacked(acc, commitments[provider][ids[i]].hash));
        }
        return acc;
    }
}
