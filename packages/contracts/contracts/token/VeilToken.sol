// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title VEIL
/// @notice The network's neutrality bond and value-accrual asset.
/// @dev Fixed supply minted once at deployment to the distribution address — no
///      ongoing inflation, no owner mint. Supply only ever decreases, via the
///      buyback-and-burn engine (`BuybackBurner`) fed by protocol fees, and via
///      slashing burns. `ERC20Permit` lets holders stake/approve gaslessly.
///
///      The token has one job: keep the confidential rail un-censorable. It is
///      staked by relayers, provers, and Association Set Providers as slashable
///      collateral; a rail that no company can switch off requires a decentralized,
///      economically-secured operator set, and that requires this bond.
contract VeilToken is ERC20, ERC20Burnable, ERC20Permit {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether; // 1B VEIL, fixed

    constructor(address distribution)
        ERC20("Veil", "VEIL")
        ERC20Permit("Veil")
    {
        require(distribution != address(0), "zero distribution");
        _mint(distribution, MAX_SUPPLY);
    }
}
