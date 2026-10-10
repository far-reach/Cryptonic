// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "../interfaces/IVerifier.sol";

/// @notice Test/CI double for the Groth16 verifier. The real verifier is generated
///         by snarkjs from `circuits/withdraw.circom`. This lets the pool's
///         accounting, Merkle, nullifier and association-set logic be exercised
///         deterministically without a trusted setup. Toggle `accept` to simulate
///         proof rejection.
contract MockVerifier is IVerifier {
    bool public accept = true;

    function setAccept(bool v) external {
        accept = v;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[7] calldata
    ) external view returns (bool) {
        return accept;
    }
}
