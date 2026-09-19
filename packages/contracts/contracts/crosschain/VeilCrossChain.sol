// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice VEIL cross-chain shielded payment — an ERC-7683-style intent flow that
///         lets a shielded balance on one chain settle to a shielded recipient on
///         another, with a solver fronting destination liquidity.
///
/// Lifecycle:
///   1. Origin: `OriginSettler.open(order)` escrows `amount + solverFee` of the
///      origin stablecoin (funded by a VeilPool withdrawal whose recipient is the
///      settler). Emits `Open` for solvers to observe.
///   2. Destination: a solver calls `DestinationSettler.fill(order, note)`, which
///      deposits `amount` into the destination VeilPool under the recipient's
///      commitment — shielding the funds for the recipient. The fill is recorded
///      with a settlement oracle.
///   3. Origin: `OriginSettler.claim(order)` pays the solver `amount + solverFee`
///      once the oracle confirms the fill. If the fill deadline passes unfilled,
///      `refund(order)` returns the escrow to the opener.
///
/// The settlement oracle abstracts the cross-chain message that proves the fill.
/// In production it is a canonical bridge/messaging attestation (LayerZero, CCIP,
/// Wormhole, Hyperlane); `MockSettlementOracle` stands in for tests. Origin and
/// destination are separate contracts precisely so they can live on separate chains.

struct ShieldedOrder {
    address sender;              // opener on the origin chain
    uint64 originChainId;
    uint64 destChainId;
    address destPool;            // VeilPool on the destination chain
    uint256 recipientCommitment; // recipient's shielded commitment on the destination
    uint256 amount;              // stablecoin delivered into the destination pool
    uint256 solverFee;           // paid to the solver on the origin chain
    uint32 fillDeadline;         // unix seconds; after this the opener can refund
    uint256 nonce;               // opener-chosen uniqueness
}

library OrderLib {
    function id(ShieldedOrder memory o) internal pure returns (bytes32) {
        return keccak256(abi.encode(o));
    }
}

interface ISettlementOracle {
    function isFilled(bytes32 orderId) external view returns (bool);
    function fillerOf(bytes32 orderId) external view returns (address);
    function recordFill(bytes32 orderId, address filler) external;
}

interface IVeilPoolDeposit {
    function deposit(uint256 commitment, uint256 value, bytes calldata encryptedNote) external;
}

/// @title OriginSettler
/// @notice Escrows the payout on the origin chain and releases it to the solver
///         once the destination fill is proven.
contract OriginSettler {
    using SafeERC20 for IERC20;
    using OrderLib for ShieldedOrder;

    IERC20 public immutable stable;
    ISettlementOracle public immutable oracle;

    enum Status { None, Opened, Claimed, Refunded }
    mapping(bytes32 => Status) public status;

    event Open(bytes32 indexed orderId, ShieldedOrder order);
    event Claimed(bytes32 indexed orderId, address indexed solver, uint256 amount);
    event Refunded(bytes32 indexed orderId, address indexed to, uint256 amount);

    error AlreadyOpened();
    error NotOpen();
    error NotSender();
    error NotFilled();
    error NotExpired();

    constructor(IERC20 _stable, ISettlementOracle _oracle) {
        stable = _stable;
        oracle = _oracle;
    }

    /// @notice Open a cross-chain order, escrowing amount + solverFee.
    function open(ShieldedOrder calldata order) external returns (bytes32 orderId) {
        if (order.sender != msg.sender) revert NotSender();
        orderId = order.id();
        if (status[orderId] != Status.None) revert AlreadyOpened();
        status[orderId] = Status.Opened;
        stable.safeTransferFrom(msg.sender, address(this), order.amount + order.solverFee);
        emit Open(orderId, order);
    }

    /// @notice Solver claims the escrow after the oracle confirms the fill.
    function claim(ShieldedOrder calldata order) external {
        bytes32 orderId = order.id();
        if (status[orderId] != Status.Opened) revert NotOpen();
        if (!oracle.isFilled(orderId)) revert NotFilled();
        status[orderId] = Status.Claimed;
        address solver = oracle.fillerOf(orderId);
        uint256 payout = order.amount + order.solverFee;
        stable.safeTransfer(solver, payout);
        emit Claimed(orderId, solver, payout);
    }

    /// @notice Opener reclaims the escrow if the order was not filled by the deadline.
    function refund(ShieldedOrder calldata order) external {
        bytes32 orderId = order.id();
        if (status[orderId] != Status.Opened) revert NotOpen();
        if (order.sender != msg.sender) revert NotSender();
        if (block.timestamp <= order.fillDeadline) revert NotExpired();
        if (oracle.isFilled(orderId)) revert NotOpen();
        status[orderId] = Status.Refunded;
        uint256 amount = order.amount + order.solverFee;
        stable.safeTransfer(msg.sender, amount);
        emit Refunded(orderId, msg.sender, amount);
    }
}

/// @title DestinationSettler
/// @notice Where the solver delivers: deposits `amount` into the destination
///         VeilPool under the recipient's commitment, shielding it for them, and
///         records the fill for the origin chain to observe.
contract DestinationSettler {
    using SafeERC20 for IERC20;
    using OrderLib for ShieldedOrder;

    ISettlementOracle public immutable oracle;

    event Filled(bytes32 indexed orderId, address indexed solver, uint256 amount);

    error AlreadyFilled();
    error WrongDestination();
    error DeadlinePassed();

    constructor(ISettlementOracle _oracle) {
        oracle = _oracle;
    }

    /// @notice Solver fills the order by shielding `amount` for the recipient in the
    ///         destination pool. Solver must approve this contract for `order.amount`
    ///         of the destination pool's stablecoin beforehand.
    /// @param stable The destination pool's stablecoin.
    /// @param recipientEncryptedNote Ciphertext of the recipient's note (for their view key).
    function fill(
        ShieldedOrder calldata order,
        IERC20 stable,
        bytes calldata recipientEncryptedNote
    ) external {
        bytes32 orderId = order.id();
        if (oracle.isFilled(orderId)) revert AlreadyFilled();
        if (order.destPool == address(0)) revert WrongDestination();
        if (block.timestamp > order.fillDeadline) revert DeadlinePassed();

        // Pull destination liquidity from the solver and shield it for the recipient.
        stable.safeTransferFrom(msg.sender, address(this), order.amount);
        stable.forceApprove(order.destPool, order.amount);
        IVeilPoolDeposit(order.destPool).deposit(
            order.recipientCommitment,
            order.amount,
            recipientEncryptedNote
        );

        oracle.recordFill(orderId, msg.sender);
        emit Filled(orderId, msg.sender, order.amount);
    }
}
