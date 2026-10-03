// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter} from "./ISwapRouter.sol";

/// @title BuybackBurner
/// @notice The value-accrual engine. `VeilPool.feeCollector` points here, so every
///         withdrawal's protocol fee (in the pool's stablecoin) accumulates in this
///         contract. Anyone can then call `execute()` to swap the accumulated
///         stablecoins into VEIL and burn a configured share, routing the remainder
///         to the insurance treasury.
/// @dev This is the same revenue → buyback → burn loop the 2026 market rewards
///      (e.g. Hyperliquid). `execute()` is permissionless — value accrual does not
///      depend on a privileged actor — with slippage protection via `minVeilOut`.
contract BuybackBurner {
    using SafeERC20 for IERC20;

    IERC20 public immutable stable; // e.g. USDC (protocol-fee currency)
    ERC20Burnable public immutable veil;
    ISwapRouter public router;
    address public treasury; // insurance fund
    address public governance;

    uint256 public constant BPS = 10_000;
    uint256 public burnBps; // share of bought VEIL that is burned; rest -> treasury

    uint256 public totalBurned;
    uint256 public totalToTreasury;

    event Executed(uint256 stableIn, uint256 veilOut, uint256 burned, uint256 toTreasury);
    event ParamsUpdated(address router, address treasury, uint256 burnBps);

    error NotGovernance();
    error NothingToBuy();
    error BadParams();

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    constructor(
        IERC20 _stable,
        ERC20Burnable _veil,
        ISwapRouter _router,
        address _treasury,
        uint256 _burnBps,
        address _governance
    ) {
        if (
            address(_stable) == address(0) ||
            address(_veil) == address(0) ||
            _treasury == address(0) ||
            _governance == address(0) ||
            _burnBps > BPS
        ) revert BadParams();
        stable = _stable;
        veil = _veil;
        router = _router;
        treasury = _treasury;
        burnBps = _burnBps;
        governance = _governance;
    }

    /// @notice Swap all accumulated stablecoins to VEIL, burn `burnBps`, send the
    ///         rest to the insurance treasury. Permissionless.
    /// @param minVeilOut Slippage guard: minimum VEIL the swap must return.
    function execute(uint256 minVeilOut) external returns (uint256 veilOut) {
        uint256 amountIn = stable.balanceOf(address(this));
        if (amountIn == 0) revert NothingToBuy();

        stable.forceApprove(address(router), amountIn);
        veilOut = router.swapExactTokensForTokens(
            address(stable),
            address(veil),
            amountIn,
            minVeilOut,
            address(this)
        );

        uint256 toBurn = (veilOut * burnBps) / BPS;
        uint256 toTreasury = veilOut - toBurn;

        if (toBurn > 0) {
            veil.burn(toBurn);
            totalBurned += toBurn;
        }
        if (toTreasury > 0) {
            IERC20(address(veil)).safeTransfer(treasury, toTreasury);
            totalToTreasury += toTreasury;
        }

        emit Executed(amountIn, veilOut, toBurn, toTreasury);
    }

    function setParams(
        ISwapRouter _router,
        address _treasury,
        uint256 _burnBps
    ) external onlyGovernance {
        if (address(_router) == address(0) || _treasury == address(0) || _burnBps > BPS) {
            revert BadParams();
        }
        router = _router;
        treasury = _treasury;
        burnBps = _burnBps;
        emit ParamsUpdated(address(_router), _treasury, _burnBps);
    }
}
