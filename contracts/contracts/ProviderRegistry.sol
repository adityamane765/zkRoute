// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ProviderRegistry
 * @notice Registers signal providers. Providers stake USDC bond on registration.
 *         Bond is slashed by governance for fraudulent ZK proofs or spam.
 *
 *         The slashed bond is held in `slashedBalance` and only the protocol
 *         treasury can withdraw it — buyer floats and other providers' stakes
 *         in the same contract are never touched.
 */
contract ProviderRegistry is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    uint256 public constant STAKE_AMOUNT = 100e6; // 100 USDC (6 decimals)
    uint256 public constant MAX_NAME_LENGTH = 80;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 500;

    enum StrategyFrequency { HFT, Intraday, MediumFrequency, Swing, Macro }

    struct Provider {
        address addr;
        string name;
        string description;
        StrategyFrequency frequency;
        bytes agentPublicKey;   // NaCl box pubkey for signal encryption (must be 32 bytes)
        uint256 stakedAt;
        bool active;
        bool slashed;
    }

    mapping(address => Provider) public providers;
    address[] public providerList;
    mapping(address => uint256) private providerIndex; // 1-indexed to distinguish absent from 0

    // Aggregate slashed USDC the treasury can withdraw, kept separate from any
    // live stake balances.
    uint256 public slashedBalance;

    event ProviderRegistered(address indexed provider, string name, StrategyFrequency frequency);
    event ProviderSlashed(address indexed provider, string reason, uint256 amount);
    event ProviderDeactivated(address indexed provider);
    event ProviderMetadataUpdated(address indexed provider);
    event TreasuryWithdrawn(address indexed to, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "zero usdc");
        usdc = IERC20(_usdc);
    }

    function register(
        string calldata name,
        string calldata description,
        StrategyFrequency frequency,
        bytes calldata agentPublicKey
    ) external whenNotPaused nonReentrant {
        require(!providers[msg.sender].active, "already registered");
        require(!providers[msg.sender].slashed, "address slashed");
        require(agentPublicKey.length == 32, "invalid pubkey length");
        require(bytes(name).length > 0 && bytes(name).length <= MAX_NAME_LENGTH, "invalid name");
        require(bytes(description).length <= MAX_DESCRIPTION_LENGTH, "invalid description");

        usdc.safeTransferFrom(msg.sender, address(this), STAKE_AMOUNT);

        providers[msg.sender] = Provider({
            addr: msg.sender,
            name: name,
            description: description,
            frequency: frequency,
            agentPublicKey: agentPublicKey,
            stakedAt: block.timestamp,
            active: true,
            slashed: false
        });
        providerList.push(msg.sender);
        providerIndex[msg.sender] = providerList.length;

        emit ProviderRegistered(msg.sender, name, frequency);
    }

    function updateMetadata(string calldata name, string calldata description) external {
        Provider storage p = providers[msg.sender];
        require(p.active, "not active");
        require(bytes(name).length > 0 && bytes(name).length <= MAX_NAME_LENGTH, "invalid name");
        require(bytes(description).length <= MAX_DESCRIPTION_LENGTH, "invalid description");
        p.name = name;
        p.description = description;
        emit ProviderMetadataUpdated(msg.sender);
    }

    function slash(address provider, string calldata reason) external onlyOwner {
        Provider storage p = providers[provider];
        require(p.active && !p.slashed, "not slashable");
        p.active = false;
        p.slashed = true;
        slashedBalance += STAKE_AMOUNT;
        emit ProviderSlashed(provider, reason, STAKE_AMOUNT);
    }

    function deactivate() external nonReentrant {
        Provider storage p = providers[msg.sender];
        require(p.active && !p.slashed, "not active");
        p.active = false;
        usdc.safeTransfer(msg.sender, STAKE_AMOUNT);
        emit ProviderDeactivated(msg.sender);
    }

    function withdrawSlashedFunds(address to) external onlyOwner nonReentrant {
        require(to != address(0), "zero to");
        uint256 amount = slashedBalance;
        require(amount > 0, "nothing to withdraw");
        slashedBalance = 0;
        usdc.safeTransfer(to, amount);
        emit TreasuryWithdrawn(to, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function getProvider(address addr) external view returns (Provider memory) {
        return providers[addr];
    }

    function getProviderCount() external view returns (uint256) {
        return providerList.length;
    }

    function getProviderAt(uint256 i) external view returns (address) {
        return providerList[i];
    }

    function getAllProviders() external view returns (address[] memory) {
        return providerList;
    }

    function getActiveProviders() external view returns (address[] memory) {
        uint256 count;
        for (uint256 i = 0; i < providerList.length; i++) {
            if (providers[providerList[i]].active) count++;
        }
        address[] memory active = new address[](count);
        uint256 j;
        for (uint256 i = 0; i < providerList.length; i++) {
            if (providers[providerList[i]].active) active[j++] = providerList[i];
        }
        return active;
    }
}
