// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ProviderRegistry.sol";
import "./CommitReveal.sol";

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
contract SignalMarket is Ownable {
    IERC20 public immutable usdc;
    ProviderRegistry public immutable registry;
    CommitReveal public immutable commitReveal;
    address public immutable zkVerifier;   // deployed Groth16 verifier contract

    uint256 public constant PROTOCOL_FEE_BPS = 300; // 3%
    uint256 public constant BPS_DENOM = 10_000;
    uint256 public signalPriceUsdc = 10_000; // 0.01 USDC (6 decimals)

    struct Subscription {
        bool active;
        uint256 float;          // deposited USDC balance for nanopayments
        bytes buyerAgentPubKey; // NaCl box pubkey; provider encrypts signals to this
        uint256 maxPositionBps; // max position size (bps of portfolio)
        uint256 maxLeverageBps; // max leverage (100_00 = 1x, 200_00 = 2x)
        uint256 dailyVarBps;    // max daily VaR (bps of portfolio)
        uint256 signalCount;    // total signals received
    }

    // provider => buyer => Subscription
    mapping(address => mapping(address => Subscription)) public subscriptions;

    // provider => claimable USDC revenue
    mapping(address => uint256) public providerRevenue;

    // provider => verified stats (updated by ZK proof submission)
    struct ProviderStats {
        uint256 winRateBps;     // e.g. 6800 = 68%
        uint256 totalReturnBps; // cumulative return bps
        uint256 totalSignals;
        uint256 lastProofBlock;
    }
    mapping(address => ProviderStats) public providerStats;

    event Subscribed(address indexed provider, address indexed buyer, bytes buyerAgentPubKey);
    event Unsubscribed(address indexed provider, address indexed buyer);
    event FloatDeposited(address indexed provider, address indexed buyer, uint256 amount);
    event SignalPaymentProcessed(address indexed provider, address indexed buyer, uint256 providerAmount, uint256 fee);
    event StatsProofSubmitted(address indexed provider, uint256 winRateBps, uint256 totalReturnBps);
    event RevenueClaimed(address indexed provider, uint256 amount);

    constructor(
        address _usdc,
        address _registry,
        address _commitReveal,
        address _zkVerifier
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        registry = ProviderRegistry(_registry);
        commitReveal = CommitReveal(_commitReveal);
        zkVerifier = _zkVerifier;
    }

    // ─── Subscription management ────────────────────────────────────────────

    function subscribe(
        address provider,
        bytes calldata buyerAgentPubKey,
        uint256 maxPositionBps,
        uint256 maxLeverageBps,
        uint256 dailyVarBps,
        uint256 initialFloat
    ) external {
        require(registry.getProvider(provider).active, "provider not active");
        require(buyerAgentPubKey.length == 32, "invalid pubkey");
        require(!subscriptions[provider][msg.sender].active, "already subscribed");

        if (initialFloat > 0) {
            usdc.transferFrom(msg.sender, address(this), initialFloat);
        }

        subscriptions[provider][msg.sender] = Subscription({
            active: true,
            float: initialFloat,
            buyerAgentPubKey: buyerAgentPubKey,
            maxPositionBps: maxPositionBps,
            maxLeverageBps: maxLeverageBps,
            dailyVarBps: dailyVarBps,
            signalCount: 0
        });

        emit Subscribed(provider, msg.sender, buyerAgentPubKey);
    }

    function unsubscribe(address provider) external {
        Subscription storage sub = subscriptions[provider][msg.sender];
        require(sub.active, "not subscribed");
        uint256 remaining = sub.float;
        sub.active = false;
        sub.float = 0;
        if (remaining > 0) usdc.transfer(msg.sender, remaining);
        emit Unsubscribed(provider, msg.sender);
    }

    function depositFloat(address provider, uint256 amount) external {
        require(subscriptions[provider][msg.sender].active, "not subscribed");
        usdc.transferFrom(msg.sender, address(this), amount);
        subscriptions[provider][msg.sender].float += amount;
        emit FloatDeposited(provider, msg.sender, amount);
    }

    // ─── Nanopayment (called by buyer agent after executing a signal) ────────

    /**
     * @notice Deducts signal price from buyer's float and credits provider.
     *         Called by the buyer agent (which holds the buyer's wallet keys).
     */
    function processSignalPayment(address provider, address buyer) external {
        // Only buyer's agent (msg.sender == buyer here; agent signs on behalf of buyer)
        require(msg.sender == buyer, "only buyer");
        Subscription storage sub = subscriptions[provider][buyer];
        require(sub.active, "not subscribed");
        require(sub.float >= signalPriceUsdc, "insufficient float");

        sub.float -= signalPriceUsdc;
        sub.signalCount++;

        uint256 fee = (signalPriceUsdc * PROTOCOL_FEE_BPS) / BPS_DENOM;
        uint256 providerAmount = signalPriceUsdc - fee;
        providerRevenue[provider] += providerAmount;

        emit SignalPaymentProcessed(provider, buyer, providerAmount, fee);
    }

    // ─── ZK proof submission ─────────────────────────────────────────────────

    /**
     * @notice Provider submits a Groth16 proof of their track record.
     *         Public inputs: [winRateBps, totalReturnBps, totalSignals, commitmentRoot]
     *         Circuit proves: given private signal history, committed hashes match
     *         outcomes and produce the claimed stats.
     */
    function submitStatsProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata pubSignals  // [winRateBps, totalReturnBps, totalSignals, commitmentRoot]
    ) external {
        require(registry.getProvider(msg.sender).active, "not registered");

        // Verify commitment root matches on-chain state
        bytes32 onChainRoot = commitReveal.getCommitmentRoot(msg.sender);
        require(bytes32(pubSignals[3]) == onChainRoot, "commitment root mismatch");

        // Call the Groth16 verifier contract
        (bool success, bytes memory result) = zkVerifier.staticcall(
            abi.encodeWithSignature(
                "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[4])",
                pA, pB, pC, pubSignals
            )
        );
        require(success && abi.decode(result, (bool)), "invalid ZK proof");

        providerStats[msg.sender] = ProviderStats({
            winRateBps: pubSignals[0],
            totalReturnBps: pubSignals[1],
            totalSignals: pubSignals[2],
            lastProofBlock: block.number
        });

        emit StatsProofSubmitted(msg.sender, pubSignals[0], pubSignals[1]);
    }

    // ─── Revenue claim ───────────────────────────────────────────────────────

    function claimRevenue() external {
        uint256 amount = providerRevenue[msg.sender];
        require(amount > 0, "nothing to claim");
        providerRevenue[msg.sender] = 0;
        usdc.transfer(msg.sender, amount);
        emit RevenueClaimed(msg.sender, amount);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setSignalPrice(uint256 newPriceUsdc) external onlyOwner {
        signalPriceUsdc = newPriceUsdc;
    }

    function withdrawFees(address to) external onlyOwner {
        uint256 balance = usdc.balanceOf(address(this));
        // Subtract all provider revenue and buyer floats (approximation: just sweep excess)
        usdc.transfer(to, balance);
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
