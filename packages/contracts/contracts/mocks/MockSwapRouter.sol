// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter} from "../token/ISwapRouter.sol";

/// @notice Test DEX with a fixed price. Pre-fund it with `tokenOut` liquidity.
///         `amountOut = amountIn * rateNum / rateDen` (choose rate to bridge the
///         6-dp stablecoin ↔ 18-dp VEIL decimal gap in tests).
contract MockSwapRouter is ISwapRouter {
    uint256 public rateNum;
    uint256 public rateDen;

    constructor(uint256 _rateNum, uint256 _rateDen) {
        rateNum = _rateNum;
        rateDen = _rateDen;
    }

    function setRate(uint256 _rateNum, uint256 _rateDen) external {
        rateNum = _rateNum;
        rateDen = _rateDen;
    }

    function swapExactTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address to
    ) external override returns (uint256 amountOut) {
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "in failed");
        amountOut = (amountIn * rateNum) / rateDen;
        require(amountOut >= minAmountOut, "slippage");
        require(IERC20(tokenOut).transfer(to, amountOut), "out failed");
    }
}
