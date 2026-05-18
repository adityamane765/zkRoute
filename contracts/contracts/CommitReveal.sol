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
 *
 *         The contract is intentionally permissionless: any address can commit/reveal
 *         under their own (msg.sender, signalId) namespace, so providers don't need
 *         to register here separately.
 */
contract CommitReveal {
    struct Commitment {
        bytes32 hash;       // keccak256 of signal params + salt
        uint64 blockNumber;
        uint64 timestamp;
        uint8 direction;    // populated on reveal
        bool revealed;
        bool outcome;       // populated on reveal: true=win, false=loss
    }

    // provider => signalId => Commitment
    mapping(address => mapping(bytes32 => Commitment)) public commitments;

    // provider => ordered list of signal IDs (for ZK proof generation)
    mapping(address => bytes32[]) public signalHistory;

    // Cached rolling root for O(1) reads of commitmentRoot (avoids O(n) loop view).
    mapping(address => bytes32) private commitmentRoot_;

    // Minimum blocks before reveal is allowed (anti-cherry-pick: can't reveal same block)
    uint256 public constant MIN_REVEAL_DELAY_BLOCKS = 1;
    // Hard ceiling so providers can't keep commitments open indefinitely and pick winners later
    uint256 public constant MAX_REVEAL_WINDOW_BLOCKS = 50_000;

    event SignalCommitted(address indexed provider, bytes32 indexed signalId, bytes32 hash, uint256 blockNumber);
    event SignalRevealed(address indexed provider, bytes32 indexed signalId, bool outcome);
    event CommitmentExpired(address indexed provider, bytes32 indexed signalId);

    function commit(bytes32 signalId, bytes32 hash) external {
        require(signalId != bytes32(0), "empty signalId");
        require(hash != bytes32(0), "empty hash");
        require(commitments[msg.sender][signalId].blockNumber == 0, "already committed");
        commitments[msg.sender][signalId] = Commitment({
            hash: hash,
            blockNumber: uint64(block.number),
            timestamp: uint64(block.timestamp),
            direction: 0,
            revealed: false,
            outcome: false
        });
        signalHistory[msg.sender].push(signalId);

        // Update rolling Merkle-style root incrementally so views are O(1).
        commitmentRoot_[msg.sender] = keccak256(
            abi.encodePacked(commitmentRoot_[msg.sender], hash)
        );

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
        require(direction <= 1, "invalid direction");
        require(block.number >= c.blockNumber + MIN_REVEAL_DELAY_BLOCKS, "too early");
        require(block.number <= c.blockNumber + MAX_REVEAL_WINDOW_BLOCKS, "reveal window expired");

        bytes32 expectedHash = keccak256(abi.encodePacked(signalId, direction, assetId, salt));
        require(expectedHash == c.hash, "hash mismatch");

        c.revealed = true;
        c.outcome = outcome;
        c.direction = direction;
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
     * @notice Returns the rolling keccak aggregation of all committed hashes
     *         for this provider, used as a public input to the ZK circuit.
     */
    function getCommitmentRoot(address provider) external view returns (bytes32) {
        return commitmentRoot_[provider];
    }
}
