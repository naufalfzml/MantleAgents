// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MockERC20
/// @notice Minimal mintable ERC20 for use on Mantle Testnet only.
/// Includes a public, rate-limited faucet so the MantleAgents agent
/// wallets (and judges) can self-fund test balances without relying on a
/// real bridged USDC/USDT/WMNT, which may not exist (or may be unreliable)
/// on Mantle Sepolia.
///
/// DO NOT deploy/use this on mainnet — `faucet()` is intentionally public.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;

    address public owner;

    // Faucet config
    uint256 public faucetAmount;
    uint256 public faucetCooldown = 1 hours;
    mapping(address => uint256) public lastFaucetClaim;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "MockERC20: not owner");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _initialSupply,
        uint256 _faucetAmount
    ) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = msg.sender;
        faucetAmount = _faucetAmount;

        if (_initialSupply > 0) {
            totalSupply = _initialSupply;
            balanceOf[msg.sender] = _initialSupply;
            emit Transfer(address(0), msg.sender, _initialSupply);
        }
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "MockERC20: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    /// @notice Owner-only mint, for seeding agent wallets with larger amounts.
    function mint(address to, uint256 value) external onlyOwner {
        _mint(to, value);
    }

    /// @notice Public faucet — anyone can claim `faucetAmount` once per
    /// `faucetCooldown`. Testnet only.
    function faucet() external {
        require(
            block.timestamp >= lastFaucetClaim[msg.sender] + faucetCooldown,
            "MockERC20: faucet cooldown active"
        );
        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
    }

    function setFaucetAmount(uint256 _faucetAmount) external onlyOwner {
        faucetAmount = _faucetAmount;
    }

    function setFaucetCooldown(uint256 _cooldown) external onlyOwner {
        faucetCooldown = _cooldown;
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
        emit Mint(to, value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "MockERC20: transfer to zero address");
        uint256 fromBalance = balanceOf[from];
        require(fromBalance >= value, "MockERC20: insufficient balance");
        unchecked {
            balanceOf[from] = fromBalance - value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
