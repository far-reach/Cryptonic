// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal swap-router interface (Uniswap-style) the buyback engine calls
///         to convert protocol-fee stablecoins into VEIL. Kept abstract so any DEX
///         or aggregator can be plugged in; `MockSwapRouter` implements it for tests.
interface ISwapRouter {
    /// @return amountOut VEIL received for `amountIn` of `tokenIn`.
    function swapExactTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address to
    ) external returns (uint256 amountOut);
}
