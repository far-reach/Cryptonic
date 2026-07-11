// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VeilStaking
/// @notice Slashable-bond staking for the operators that keep VEIL neutral:
///         relayers, provers, and Association Set Providers. Staking VEIL is what
///         lets the network punish censorship, downtime, or an ASP vouching for a
///         set it cannot substantiate — the economic backing behind "no company can
///         switch this rail off".
/// @dev Unstaking has a cooldown so misbehaviour can still be slashed after an
///      operator signals exit. Slashed stake is sent to a beneficiary (the insurance
///      treasury); governance is the slasher in v0 and is expected to become a
///      decentralized dispute process.
contract VeilStaking {
    using SafeERC20 for IERC20;

    enum Kind { None, Relayer, Prover, ASP }

    struct Operator {
        Kind kind;
        uint256 staked;
        uint256 pendingAmount;
        uint256 unlockTime;
    }

    IERC20 public immutable veil;
    address public governance;
    address public slashBeneficiary; // insurance treasury
    uint256 public immutable cooldown; // seconds
    uint256 public minStake;

    mapping(address => Operator) public operators;
    uint256 public totalStaked;

    event Registered(address indexed operator, Kind kind);
    event Staked(address indexed operator, uint256 amount, uint256 newStake);
    event UnstakeRequested(address indexed operator, uint256 amount, uint256 unlockTime);
    event Withdrawn(address indexed operator, uint256 amount);
    event Slashed(address indexed operator, uint256 amount, address beneficiary);
    event GovernanceTransferred(address indexed to);

    error NotGovernance();
    error ZeroAmount();
    error BadKind();
    error InsufficientStake();
    error NothingPending();
    error StillLocked();
    error ZeroAddress();

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    constructor(
        IERC20 _veil,
        address _governance,
        address _slashBeneficiary,
        uint256 _cooldown,
        uint256 _minStake
    ) {
        if (address(_veil) == address(0) || _governance == address(0) || _slashBeneficiary == address(0)) {
            revert ZeroAddress();
        }
        veil = _veil;
        governance = _governance;
        slashBeneficiary = _slashBeneficiary;
        cooldown = _cooldown;
        minStake = _minStake;
    }

    /// @notice Stake VEIL under an operator role. First stake sets the kind.
    function stake(Kind kind, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (kind == Kind.None) revert BadKind();
        Operator storage op = operators[msg.sender];
        if (op.kind == Kind.None) {
            op.kind = kind;
            emit Registered(msg.sender, kind);
        } else if (op.kind != kind) {
            revert BadKind();
        }
        op.staked += amount;
        totalStaked += amount;
        veil.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, op.staked);
    }

    /// @notice Whether an operator meets the minimum bond and is eligible to serve.
    function isActive(address operator) external view returns (bool) {
        Operator storage op = operators[operator];
        return op.kind != Kind.None && op.staked >= minStake;
    }

    /// @notice Begin unstaking `amount`; funds unlock after the cooldown.
    function requestUnstake(uint256 amount) external {
        Operator storage op = operators[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > op.staked) revert InsufficientStake();
        op.staked -= amount;
        totalStaked -= amount;
        op.pendingAmount += amount;
        op.unlockTime = block.timestamp + cooldown;
        emit UnstakeRequested(msg.sender, amount, op.unlockTime);
    }

    /// @notice Withdraw unlocked, previously-requested stake.
    function withdraw() external {
        Operator storage op = operators[msg.sender];
        uint256 amount = op.pendingAmount;
        if (amount == 0) revert NothingPending();
        if (block.timestamp < op.unlockTime) revert StillLocked();
        op.pendingAmount = 0;
        veil.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Slash an operator's active stake to the beneficiary. Governance only.
    ///         Pending (cooldown) stake remains slashable too until withdrawn.
    function slash(address operator, uint256 amount) external onlyGovernance {
        Operator storage op = operators[operator];
        if (amount == 0) revert ZeroAmount();

        uint256 fromActive = amount <= op.staked ? amount : op.staked;
        op.staked -= fromActive;
        totalStaked -= fromActive;

        uint256 remaining = amount - fromActive;
        if (remaining > 0) {
            if (remaining > op.pendingAmount) revert InsufficientStake();
            op.pendingAmount -= remaining;
        }

        veil.safeTransfer(slashBeneficiary, amount);
        emit Slashed(operator, amount, slashBeneficiary);
    }

    function setMinStake(uint256 _minStake) external onlyGovernance {
        minStake = _minStake;
    }

    function transferGovernance(address to) external onlyGovernance {
        if (to == address(0)) revert ZeroAddress();
        governance = to;
        emit GovernanceTransferred(to);
    }
}
