// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHasher} from "./interfaces/IHasher.sol";

/// @title MerkleTreeWithHistory
/// @notice Fixed-depth incremental Merkle tree over the BN254 scalar field using
///         Poseidon(2). Keeps a rolling window of recent roots so that withdrawal
///         proofs built against a slightly stale root still verify.
/// @dev Structure follows the well-audited Tornado Cash / Privacy Pools pattern,
///      substituting Poseidon for MiMC. Not a novel construction on purpose:
///      the novelty of VEIL is the association-set + view-key layer above it,
///      not the accumulator.
contract MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // keccak256("veil.shielded.pool.v1") % FIELD_SIZE — domain-separated empty leaf.
    uint256 public constant ZERO_VALUE =
        20508465343459127713437550997885324284262230915342444940761755190926324417049;

    uint32 public immutable levels;
    IHasher public immutable hasher;

    // Number of historical roots to keep addressable for withdrawals.
    uint32 public constant ROOT_HISTORY_SIZE = 30;

    mapping(uint256 => uint256) public filledSubtrees;
    mapping(uint256 => uint256) public zeros;
    mapping(uint256 => uint256) public roots;

    uint32 public currentRootIndex;
    uint32 public nextIndex;

    error TreeFull();
    error LevelsOutOfRange();
    error IndexOutOfBounds();

    constructor(uint32 _levels, IHasher _hasher) {
        if (_levels == 0 || _levels >= 32) revert LevelsOutOfRange();
        levels = _levels;
        hasher = _hasher;

        uint256 currentZero = ZERO_VALUE;
        zeros[0] = currentZero;
        filledSubtrees[0] = currentZero;

        for (uint32 i = 1; i < _levels; i++) {
            currentZero = _hashPair(currentZero, currentZero);
            zeros[i] = currentZero;
            filledSubtrees[i] = currentZero;
        }

        roots[0] = _hashPair(currentZero, currentZero);
    }

    function _hashPair(uint256 left, uint256 right) internal view returns (uint256) {
        require(left < FIELD_SIZE, "left >= FIELD");
        require(right < FIELD_SIZE, "right >= FIELD");
        return hasher.poseidon([left, right]);
    }

    /// @dev Inserts a leaf and returns its index. O(levels) hashes.
    function _insert(uint256 leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        if (_nextIndex == uint32(2) ** levels) revert TreeFull();

        uint32 currentIndex = _nextIndex;
        uint256 currentHash = leaf;
        uint256 left;
        uint256 right;

        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                left = currentHash;
                right = zeros[i];
                filledSubtrees[i] = currentHash;
            } else {
                left = filledSubtrees[i];
                right = currentHash;
            }
            currentHash = _hashPair(left, right);
            currentIndex /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentHash;
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    /// @notice Whether `root` is any of the last ROOT_HISTORY_SIZE roots.
    function isKnownRoot(uint256 root) public view returns (bool) {
        if (root == 0) return false;
        uint32 _currentRootIndex = currentRootIndex;
        uint32 i = _currentRootIndex;
        do {
            if (root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != _currentRootIndex);
        return false;
    }

    function getLastRoot() public view returns (uint256) {
        return roots[currentRootIndex];
    }
}
