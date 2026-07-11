// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";
import {IHasher} from "./interfaces/IHasher.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";
import {AssociationSetRegistry} from "./AssociationSetRegistry.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title VeilPool
/// @notice A confidential-payments shielded pool for a single stablecoin.
///         Deposits are public (amount visible); withdrawals are private and
///         unlinkable, proven in zero-knowledge against (a) the pool's commitment
///         tree and (b) an approved association-set root (proof of innocence).
///
/// @dev Confidentiality model — "confidentiality, not anonymity":
///      - Deposit: caller commits `commitment = Poseidon(value, Poseidon(nullifier, secret))`
///        and transfers `value` tokens in. The ciphertext `encryptedNote` lets the
///        depositor (or an auditor holding the shared view key) recover the note.
///      - Withdraw: caller submits a Groth16 proof that they know a note whose
///        commitment is in the tree, whose value equals the public `value`, and
///        whose deposit is included in an approved association set — revealing only
///        a `nullifierHash` (to prevent double-spend) and the public outputs.
///
///      Fee model (VEIL value accrual): `protocolFeeBps` of every withdrawal is
///      routed to `feeCollector`, which in production forwards to the on-chain
///      buyback-and-burn module. The relayer `fee` (separate) pays gas so users
///      can withdraw to a fresh address without holding ETH.
contract VeilPool is MerkleTreeWithHistory {
    IERC20 public immutable token;
    IVerifier public immutable verifier;
    AssociationSetRegistry public immutable asp;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public immutable protocolFeeBps; // e.g. 10 = 0.10%
    address public feeCollector;
    address public governance;

    mapping(uint256 => bool) public nullifierHashUsed;
    mapping(uint256 => bool) public commitments; // dedupe deposits

    event Deposit(
        uint256 indexed commitment,
        uint32 leafIndex,
        uint256 value,
        bytes encryptedNote,
        uint256 timestamp
    );
    event Withdrawal(
        uint256 indexed nullifierHash,
        address indexed recipient,
        address indexed relayer,
        uint256 value,
        uint256 relayerFee,
        uint256 protocolFee
    );
    event FeeCollectorUpdated(address indexed collector);

    error CommitmentExists();
    error ValueZero();
    error UnknownRoot();
    error UnknownAspRoot();
    error NullifierUsed();
    error InvalidProof();
    error FeeTooHigh();
    error NotGovernance();
    error ValueOutOfField();
    error SignalMismatch();
    error TransferFailed();

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    constructor(
        uint32 _levels,
        IHasher _hasher,
        IVerifier _verifier,
        AssociationSetRegistry _asp,
        IERC20 _token,
        uint256 _protocolFeeBps,
        address _feeCollector,
        address _governance
    ) MerkleTreeWithHistory(_levels, _hasher) {
        require(_protocolFeeBps <= 100, "fee > 1%");
        require(_feeCollector != address(0) && _governance != address(0), "zero addr");
        verifier = _verifier;
        asp = _asp;
        token = _token;
        protocolFeeBps = _protocolFeeBps;
        feeCollector = _feeCollector;
        governance = _governance;
    }

    /// @notice Shield `value` tokens under `commitment`.
    /// @param commitment Poseidon(value, Poseidon(nullifier, secret)), computed client-side.
    /// @param value Token amount being shielded (public).
    /// @param encryptedNote Ciphertext of the note under the depositor/auditor view key.
    function deposit(uint256 commitment, uint256 value, bytes calldata encryptedNote) external {
        if (value == 0) revert ValueZero();
        if (commitment == 0 || commitment >= FIELD_SIZE) revert ValueOutOfField();
        if (commitments[commitment]) revert CommitmentExists();

        commitments[commitment] = true;
        uint32 index = _insert(commitment);

        if (!token.transferFrom(msg.sender, address(this), value)) revert TransferFailed();

        emit Deposit(commitment, index, value, encryptedNote, block.timestamp);
    }

    /// @notice Privately withdraw `value` to `recipient`, paying `fee` to `relayer`.
    /// @param publicSignals [root, aspRoot, nullifierHash, recipient, relayer, fee, value]
    function withdraw(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata publicSignals
    ) external {
        uint256 root = publicSignals[0];
        uint256 aspRoot = publicSignals[1];
        uint256 nullifierHash = publicSignals[2];
        address recipient = address(uint160(publicSignals[3]));
        address relayer = address(uint160(publicSignals[4]));
        uint256 fee = publicSignals[5];
        uint256 value = publicSignals[6];

        // Bind address signals: high bits must be clean so a proof can't smuggle
        // a different recipient than the one the circuit committed to.
        if (publicSignals[3] >> 160 != 0 || publicSignals[4] >> 160 != 0) revert SignalMismatch();
        if (value == 0) revert ValueZero();
        if (!isKnownRoot(root)) revert UnknownRoot();
        if (!asp.isKnownRoot(aspRoot)) revert UnknownAspRoot();
        if (nullifierHashUsed[nullifierHash]) revert NullifierUsed();

        uint256 protocolFee = (value * protocolFeeBps) / BPS_DENOMINATOR;
        if (fee + protocolFee > value) revert FeeTooHigh();

        if (!verifier.verifyProof(a, b, c, publicSignals)) revert InvalidProof();

        nullifierHashUsed[nullifierHash] = true;

        uint256 recipientAmount = value - fee - protocolFee;
        if (!token.transfer(recipient, recipientAmount)) revert TransferFailed();
        if (fee > 0 && !token.transfer(relayer, fee)) revert TransferFailed();
        if (protocolFee > 0 && !token.transfer(feeCollector, protocolFee)) revert TransferFailed();

        emit Withdrawal(nullifierHash, recipient, relayer, recipientAmount, fee, protocolFee);
    }

    function setFeeCollector(address collector) external onlyGovernance {
        require(collector != address(0), "zero addr");
        feeCollector = collector;
        emit FeeCollectorUpdated(collector);
    }
}
