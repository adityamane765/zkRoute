// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProviderRegistry
 * @notice Registers signal providers. Providers stake USDC bond on registration.
 *         Bond is slashed if a fraudulent ZK proof is detected (via governance).
 */
contract ProviderRegistry is Ownable {
    IERC20 public immutable usdc;
    uint256 public constant STAKE_AMOUNT = 100e6; // 100 USDC (6 decimals)

    enum StrategyFrequency { HFT, Intraday, MediumFrequency, Swing, Macro }

    struct Provider {
        address addr;
        string name;
        string description;
        StrategyFrequency frequency;
        bytes agentPublicKey;   // NaCl box pubkey for signal encryption
        uint256 stakedAt;
        bool active;
        bool slashed;
    }

    mapping(address => Provider) public providers;
    address[] public providerList;

    event ProviderRegistered(address indexed provider, string name, StrategyFrequency frequency);
    event ProviderSlashed(address indexed provider, string reason);
    event ProviderDeactivated(address indexed provider);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    function register(
        string calldata name,
        string calldata description,
        StrategyFrequency frequency,
        bytes calldata agentPublicKey
    ) external {
        require(!providers[msg.sender].active, "already registered");
        require(agentPublicKey.length == 32, "invalid pubkey length");

        usdc.transferFrom(msg.sender, address(this), STAKE_AMOUNT);

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

        emit ProviderRegistered(msg.sender, name, frequency);
    }

    function slash(address provider, string calldata reason) external onlyOwner {
        Provider storage p = providers[provider];
        require(p.active && !p.slashed, "not slashable");
        p.active = false;
        p.slashed = true;
        // Slashed USDC stays in contract (protocol treasury)
        emit ProviderSlashed(provider, reason);
    }

    function deactivate() external {
        Provider storage p = providers[msg.sender];
        require(p.active && !p.slashed, "not active");
        p.active = false;
        usdc.transfer(msg.sender, STAKE_AMOUNT);
        emit ProviderDeactivated(msg.sender);
    }

    function getProvider(address addr) external view returns (Provider memory) {
        return providers[addr];
    }

    function getAllProviders() external view returns (address[] memory) {
        return providerList;
    }

    function getActiveProviders() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < providerList.length; i++) {
            if (providers[providerList[i]].active) count++;
        }
        address[] memory active = new address[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < providerList.length; i++) {
            if (providers[providerList[i]].active) active[j++] = providerList[i];
        }
        return active;
    }
}
