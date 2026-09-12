// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AssociationSetRegistry
/// @notice Holds the Merkle roots of "approved" (proof-of-innocence) deposit sets
///         published by an Association Set Provider (ASP).
/// @dev In VEIL this is the compliance layer that makes the pool usable by
///      regulated businesses without a backdoor: an ASP curates the set of
///      deposits it is willing to vouch for (e.g. excluding OFAC-flagged or
///      unscreened deposits). A withdrawal proves membership in BOTH the pool's
///      commitment tree AND one of these approved sets, so the withdrawer never
///      reveals which deposit is theirs, yet demonstrates the funds trace to a
///      screened source. This mirrors the Privacy Pools / proof-of-innocence
///      design publicly endorsed by Vitalik Buterin.
///
///      v0 uses a single operator (the ASP) to publish roots. Production VEIL
///      replaces the operator with a staked, slashable ASP operator set — the
///      VEIL token is that neutrality bond. Multiple ASPs can be supported by
///      deploying multiple registries; the pool is agnostic to the compliance
///      policy, it only checks membership.
contract AssociationSetRegistry {
    uint32 public constant ROOT_HISTORY_SIZE = 64;

    address public operator;
    mapping(uint256 => uint256) public roots; // ring buffer
    mapping(uint256 => uint256) public rootTimestamp; // root => publish time
    uint32 public currentRootIndex;
    uint256 public latestRoot;

    event RootPublished(uint256 indexed root, uint256 timestamp, string ipfsCid);
    event OperatorTransferred(address indexed from, address indexed to);

    error NotOperator();
    error ZeroRoot();
    error ZeroAddress();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(address _operator) {
        if (_operator == address(0)) revert ZeroAddress();
        operator = _operator;
    }

    /// @notice Publish a new approved-set root. `ipfsCid` points at the public
    ///         list of included deposits so anyone can independently reconstruct
    ///         and audit the root.
    function publishRoot(uint256 root, string calldata ipfsCid) external onlyOperator {
        if (root == 0) revert ZeroRoot();
        uint32 next = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = next;
        roots[next] = root;
        rootTimestamp[root] = block.timestamp;
        latestRoot = root;
        emit RootPublished(root, block.timestamp, ipfsCid);
    }

    function isKnownRoot(uint256 root) external view returns (bool) {
        if (root == 0) return false;
        uint32 idx = currentRootIndex;
        uint32 i = idx;
        do {
            if (root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != idx);
        return false;
    }

    function transferOperator(address to) external onlyOperator {
        if (to == address(0)) revert ZeroAddress();
        emit OperatorTransferred(operator, to);
        operator = to;
    }
}
