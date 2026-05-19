// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./ProviderRegistry.sol";
import "./CommitReveal.sol";

interface IZKVerifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata pubSignals
    ) external view returns (bool);
}

/**
 * @title SignalMarket
 * @notice Handles buyer subscriptions, per-signal nanopayments (x402 style),
 *         ZK proof verification for provider stats, and USYC yield parking.
 *
 *         Payment flow:
 *         - Buyer deposits USDC float into their agent's sub-account
 *         - Each decrypted signal deducts SIGNAL_PRICE from the float
 *         - Protocol takes PROTOCOL_FEE_BPS (3%) cut on each payment
 *         - Provider revenue accumulates; provider can claim anytime
 *         - Idle provider revenue can be parked in USYC (post-MVP)
 */
contract SignalMarket is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    ProviderRegistry public immutable registry;
    CommitReveal public immutable commitReveal;
    IZKVerifier public zkVerifier;   // deployed Groth16 verifier contract (mutable so it can be swapped post-trusted-setup)

    uint256 public constant PROTOCOL_FEE_BPS = 300; // 3%
    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MAX_POSITION_BPS = 5_000;        // 50% absolute ceiling
    uint256 public constant MAX_LEVERAGE_BPS = 10 * 10_000;  // 10x absolute ceiling
    uint256 public constant MAX_DAILY_VAR_BPS = 2_000;       // 20% absolute ceiling
    uint256 public constant MIN_PROOF_INTERVAL_BLOCKS = 10;  // anti-spam rate-limit on proof submission
    uint256 public signalPriceUsdc = 10_000;                 // 0.01 USDC (6 decimals)

    struct Subscription {
        bool active;
        uint256 float;          // deposited USDC balance for nanopayments
        bytes buyerAgentPubKey; // NaCl box pubkey; provider encrypts signals to this
        address agent;          // address authorized to call processSignalPayment on behalf of buyer
        uint256 maxPositionBps; // max position size (bps of portfolio)
        uint256 maxLeverageBps; // max leverage (100_00 = 1x, 200_00 = 2x)
        uint256 dailyVarBps;    // max daily VaR (bps of portfolio)
        uint256 signalCount;    // total signals received
    }

    // provider => buyer => Subscription
    mapping(address => mapping(address => Subscription)) public subscriptions;

    // provider => claimable USDC revenue
    mapping(address => uint256) public providerRevenue;

    // accumulated protocol fees, separate from buyer floats & provider revenue
    uint256 public treasuryBalance;

    // provider => verified stats (updated by ZK proof submission)
    struct ProviderStats {
        uint256 winRateBps;     // e.g. 6800 = 68%
        uint256 totalReturnBps; // cumulative return bps
        uint256 totalSignals;
        uint256 lastProofBlock;
    }
    mapping(address => ProviderStats) public providerStats;

    event Subscribed(address indexed provider, address indexed buyer, address indexed agent, bytes buyerAgentPubKey);
    event Unsubscribed(address indexed provider, address indexed buyer);
    event FloatDeposited(address indexed provider, address indexed buyer, uint256 amount);
    event AgentUpdated(address indexed provider, address indexed buyer, address indexed agent);
    event RiskBoundsUpdated(address indexed provider, address indexed buyer);
    event SignalPaymentProcessed(address indexed provider, address indexed buyer, address indexed agent, uint256 providerAmount, uint256 fee);
    event StatsProofSubmitted(address indexed provider, uint256 winRateBps, uint256 totalReturnBps);
    event RevenueClaimed(address indexed provider, uint256 amount);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event SignalPriceUpdated(uint256 newPriceUsdc);
    event VerifierUpdated(address indexed verifier);

    constructor(
        address _usdc,
        address _registry,
        address _commitReveal,
        address _zkVerifier
    ) Ownable(msg.sender) {
        require(_usdc != address(0) && _registry != address(0) && _commitReveal != address(0), "zero address");
        usdc = IERC20(_usdc);
        registry = ProviderRegistry(_registry);
        commitReveal = CommitReveal(_commitReveal);
        zkVerifier = IZKVerifier(_zkVerifier);  // may be zero for the period before circuit setup is done
    }

    modifier onlyAgentOrBuyer(address buyer, address provider) {
        Subscription storage sub = subscriptions[provider][buyer];
        require(msg.sender == buyer || msg.sender == sub.agent, "not authorized");
        _;
    }

    // ─── Subscription management ────────────────────────────────────────────

    function subscribe(
        address provider,
        address agent,
        bytes calldata buyerAgentPubKey,
        uint256 maxPositionBps,
        uint256 maxLeverageBps,
        uint256 dailyVarBps,
        uint256 initialFloat
    ) external nonReentrant whenNotPaused {
        require(registry.getProvider(provider).active, "provider not active");
        require(buyerAgentPubKey.length == 32, "invalid pubkey");
        require(!subscriptions[provider][msg.sender].active, "already subscribed");
        require(maxPositionBps > 0 && maxPositionBps <= MAX_POSITION_BPS, "invalid maxPositionBps");
        require(maxLeverageBps >= BPS_DENOM && maxLeverageBps <= MAX_LEVERAGE_BPS, "invalid maxLeverageBps");
        require(dailyVarBps > 0 && dailyVarBps <= MAX_DAILY_VAR_BPS, "invalid dailyVarBps");
        require(agent != address(0), "zero agent");

        if (initialFloat > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), initialFloat);
        }

        subscriptions[provider][msg.sender] = Subscription({
            active: true,
            float: initialFloat,
            buyerAgentPubKey: buyerAgentPubKey,
            agent: agent,
            maxPositionBps: maxPositionBps,
            maxLeverageBps: maxLeverageBps,
            dailyVarBps: dailyVarBps,
            signalCount: 0
        });

        emit Subscribed(provider, msg.sender, agent, buyerAgentPubKey);
    }

    function unsubscribe(address provider) external nonReentrant {
        Subscription storage sub = subscriptions[provider][msg.sender];
        require(sub.active, "not subscribed");
        uint256 remaining = sub.float;
        sub.active = false;
        sub.float = 0;
        if (remaining > 0) usdc.safeTransfer(msg.sender, remaining);
        emit Unsubscribed(provider, msg.sender);
    }

    function depositFloat(address provider, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "zero amount");
        require(subscriptions[provider][msg.sender].active, "not subscribed");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        subscriptions[provider][msg.sender].float += amount;
        emit FloatDeposited(provider, msg.sender, amount);
    }

    function updateAgent(address provider, address newAgent) external {
        Subscription storage sub = subscriptions[provider][msg.sender];
        require(sub.active, "not subscribed");
        require(newAgent != address(0), "zero agent");
        sub.agent = newAgent;
        emit AgentUpdated(provider, msg.sender, newAgent);
    }

    function updateRiskBounds(
        address provider,
        uint256 maxPositionBps,
        uint256 maxLeverageBps,
        uint256 dailyVarBps
    ) external {
        Subscription storage sub = subscriptions[provider][msg.sender];
        require(sub.active, "not subscribed");
        require(maxPositionBps > 0 && maxPositionBps <= MAX_POSITION_BPS, "invalid maxPositionBps");
        require(maxLeverageBps >= BPS_DENOM && maxLeverageBps <= MAX_LEVERAGE_BPS, "invalid maxLeverageBps");
        require(dailyVarBps > 0 && dailyVarBps <= MAX_DAILY_VAR_BPS, "invalid dailyVarBps");
        sub.maxPositionBps = maxPositionBps;
        sub.maxLeverageBps = maxLeverageBps;
        sub.dailyVarBps = dailyVarBps;
        emit RiskBoundsUpdated(provider, msg.sender);
    }

    // ─── Nanopayment (called by buyer agent after executing a signal) ────────

    /**
     * @notice Deducts signal price from buyer's float and credits provider.
     *         Callable by either the buyer themselves OR the authorized agent.
     *         Buyer pre-authorizes the agent via subscribe()/updateAgent().
     */
    function processSignalPayment(address provider, address buyer)
        external
        nonReentrant
        whenNotPaused
        onlyAgentOrBuyer(buyer, provider)
    {
        Subscription storage sub = subscriptions[provider][buyer];
        require(sub.active, "not subscribed");
        require(sub.float >= signalPriceUsdc, "insufficient float");

        sub.float -= signalPriceUsdc;
        sub.signalCount++;

        uint256 fee = (signalPriceUsdc * PROTOCOL_FEE_BPS) / BPS_DENOM;
        uint256 providerAmount = signalPriceUsdc - fee;
        providerRevenue[provider] += providerAmount;
        treasuryBalance += fee;

        emit SignalPaymentProcessed(provider, buyer, msg.sender, providerAmount, fee);
    }

    // ─── ZK proof submission ─────────────────────────────────────────────────

    /**
     * @notice Provider submits a Groth16 proof of their track record.
     *
     *         Public inputs: [winRateBps, totalReturnBps, totalSignals, commitmentRoot]
     *           - commitmentRoot is the Poseidon root computed inside the circuit.
     *             We do NOT compare it against an on-chain keccak root (they use
     *             different hash functions). Instead we verify individual signal
     *             existence via verifySignalBatch.
     *
     *         @param signalIds  The real signal IDs included in the proof (non-padded).
     *         @param hashes     keccak256 commitment hash for each signal ID.
     *                           Must match what was stored at commit time.
     */
    function submitStatsProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata pubSignals,   // [winRateBps, totalReturnBps, totalSignals, commitmentRoot]
        bytes32[] calldata signalIds,
        bytes32[] calldata hashes
    ) external whenNotPaused {
        require(registry.getProvider(msg.sender).active, "not registered");
        require(address(zkVerifier) != address(0), "verifier not set");

        // Rate-limit proof submissions
        ProviderStats storage st = providerStats[msg.sender];
        require(
            st.lastProofBlock == 0 || block.number >= st.lastProofBlock + MIN_PROOF_INTERVAL_BLOCKS,
            "too soon"
        );

        require(pubSignals[0] <= BPS_DENOM, "invalid winRate");

        // Confirm every signal the prover claims exists and was revealed on-chain.
        // This binds the proof to real on-chain history without needing an EVM Poseidon.
        require(
            commitReveal.verifySignalBatch(msg.sender, signalIds, hashes),
            "signal batch mismatch"
        );

        // The number of real signals must match the public totalSignals input.
        // (The circuit pads to N=100 with dummy signals; signalIds contains only real ones.)
        require(signalIds.length == pubSignals[2], "signal count mismatch");

        require(
            zkVerifier.verifyProof(pA, pB, pC, pubSignals),
            "invalid ZK proof"
        );

        st.winRateBps = pubSignals[0];
        st.totalReturnBps = pubSignals[1];
        st.totalSignals = pubSignals[2];
        st.lastProofBlock = block.number;

        emit StatsProofSubmitted(msg.sender, pubSignals[0], pubSignals[1]);
    }

    // ─── Revenue claim ───────────────────────────────────────────────────────

    function claimRevenue() external nonReentrant {
        uint256 amount = providerRevenue[msg.sender];
        require(amount > 0, "nothing to claim");
        providerRevenue[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit RevenueClaimed(msg.sender, amount);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setSignalPrice(uint256 newPriceUsdc) external onlyOwner {
        require(newPriceUsdc > 0 && newPriceUsdc <= 1e9, "out of range"); // ≤ 1000 USDC sanity cap
        signalPriceUsdc = newPriceUsdc;
        emit SignalPriceUpdated(newPriceUsdc);
    }

    function setVerifier(address newVerifier) external onlyOwner {
        require(newVerifier != address(0), "zero verifier");
        zkVerifier = IZKVerifier(newVerifier);
        emit VerifierUpdated(newVerifier);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Withdraw only the accrued protocol fees — buyer floats and provider revenue are never touched.
    function withdrawFees(address to) external onlyOwner nonReentrant {
        require(to != address(0), "zero to");
        uint256 amount = treasuryBalance;
        require(amount > 0, "nothing to withdraw");
        treasuryBalance = 0;
        usdc.safeTransfer(to, amount);
        emit TreasuryWithdrawn(to, amount);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getSubscription(address provider, address buyer)
        external view returns (Subscription memory)
    {
        return subscriptions[provider][buyer];
    }

    function getProviderStats(address provider)
        external view returns (ProviderStats memory)
    {
        return providerStats[provider];
    }
}
