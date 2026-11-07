// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISettlementOracle} from "../crosschain/VeilCrossChain.sol";

/// @notice Test/stand-in settlement oracle. On a single chain it lets the
///         DestinationSettler record a fill that the OriginSettler then reads. In
///         production this is replaced by a canonical cross-chain messaging
///         attestation (LayerZero / CCIP / Wormhole / Hyperlane) proving that the
///         destination fill actually happened before the origin escrow is released.
contract MockSettlementOracle is ISettlementOracle {
    mapping(bytes32 => address) public filler;

    function isFilled(bytes32 orderId) external view returns (bool) {
        return filler[orderId] != address(0);
    }

    function fillerOf(bytes32 orderId) external view returns (address) {
        return filler[orderId];
    }

    function recordFill(bytes32 orderId, address who) external {
        require(filler[orderId] == address(0), "already filled");
        require(who != address(0), "zero filler");
        filler[orderId] = who;
    }
}
