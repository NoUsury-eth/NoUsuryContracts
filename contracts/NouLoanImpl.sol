// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LoETHToken.sol";
import "./INouLoanFactory.sol";

contract NouLoanImpl {
    bool private _initialized;

    address public owner;
    address public collateralToken;
    LoETHToken public loEth;
    address public loanFactory;
    uint256 public totalCollateral;
    uint256 public totalDebt;

    error InvalidRepaymentAmount(uint256 amount);
    error NotOwner(address caller);
    error InsufficientCollateral(uint256 requestedAmount, uint256 totalCollateral, uint256 totalDebt);
    error TransferFailed(address sender, address receiver, address token, uint256 amount);
    error NotEnoughExcessYield(uint256 yieldRequested, uint256 actualYield);
    error AlreadyInitialized(bool initialized);

    function initialize(
        address _ownerAddress,
        address _collateralToken,
        address _loEth,
        address _loanFactory,
        uint256 _depositAmount
    ) external {
        if (_initialized) { revert AlreadyInitialized(_initialized); }
        _initialized = true;

        owner = _ownerAddress;
        collateralToken = _collateralToken;
        loEth = LoETHToken(_loEth);
        loanFactory = _loanFactory;
        totalCollateral = _depositAmount;
        totalDebt = _depositAmount;

        loEth.mint(_ownerAddress, _depositAmount);
    }

    function repayLoan(uint256 _amount) external {
        if (_amount <= 0) { revert InvalidRepaymentAmount(_amount); }
        require(_amount <= totalDebt, "Exceeds total debt");

        // user must have approved loan contract for loEth
        bool success = loEth.transferFrom(msg.sender, address(this), _amount);
        if (!success) { revert TransferFailed(msg.sender, address(this), address(loEth), _amount); }

        loEth.burn(address(this), _amount);
        totalDebt -= _amount;
    }

    function withdrawCollateral(uint256 _amount) external {
        if (msg.sender != owner) { revert NotOwner(msg.sender); }
        if (_amount > totalCollateral - totalDebt) { revert InsufficientCollateral(_amount, totalCollateral, totalDebt); }

        totalCollateral -= _amount;
        bool success = IERC20(collateralToken).transfer(owner, _amount);
        if (!success) { revert TransferFailed(address(this), owner, collateralToken, _amount); }
    }

    function applyYieldToPayDownLoan(uint256 _yieldAmount) external {
        if (msg.sender != owner) { revert NotOwner(msg.sender); }

        uint256 bal = IERC20(collateralToken).balanceOf(address(this));
        uint256 excess = (bal > totalCollateral) ? (bal - totalCollateral) : 0;
        if (_yieldAmount > excess) { revert NotEnoughExcessYield(_yieldAmount, excess); }

        if (_yieldAmount > totalDebt) {
            _yieldAmount = totalDebt;
        }

        totalDebt -= _yieldAmount;
        bool success = IERC20(collateralToken).transfer(loanFactory, _yieldAmount);
        if (!success) { revert TransferFailed(address(this), loanFactory, collateralToken, _yieldAmount); }
        INouLoanFactory(loanFactory).depositToken(collateralToken, _yieldAmount);
    }
}
