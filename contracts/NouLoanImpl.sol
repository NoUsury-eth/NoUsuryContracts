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

    function initialize(
        address _ownerAddress,
        address _collateralToken,
        address _loEth,
        address _loanFactory,
        uint256 _depositAmount
    ) external {
        require(!_initialized, "Already initialized");
        _initialized = true;

        owner = _ownerAddress;
        collateralToken = _collateralToken;
        loEth = LoETHToken(_loEth);
        loanFactory = _loanFactory;

        // The deposit was already pulled from user -> factory,
        // and we haven't yet transferred to the loan. We'll just record the deposit
        totalCollateral = _depositAmount;
        totalDebt = _depositAmount;

        // Mint loETH to the user as the "loan" debt
        loEth.mint(_ownerAddress, _depositAmount);
    }

    function repayLoan(uint256 _amount) external {
        require(_amount > 0, "Invalid repay amount");
        require(_amount <= totalDebt, "Exceeds total debt");

        // user must have approved loan contract for loEth
        bool success = loEth.transferFrom(msg.sender, address(this), _amount);
        require(success, "loETH transfer failed");

        loEth.burn(address(this), _amount);
        totalDebt -= _amount;
    }

    function withdrawCollateral(uint256 _amount) external {
        require(msg.sender == owner, "Not owner");
        require(_amount <= totalCollateral - totalDebt, "Insufficient collateral");

        totalCollateral -= _amount;
        bool success = IERC20(collateralToken).transfer(owner, _amount);
        require(success, "Collateral transfer failed");
    }

    function applyYieldToPayDownLoan(uint256 _yieldAmount) external {
        require(msg.sender == owner, "Not owner");

        uint256 bal = IERC20(collateralToken).balanceOf(address(this));
        uint256 excess = (bal > totalCollateral) ? (bal - totalCollateral) : 0;
        require(_yieldAmount <= excess, "Not enough yield");

        if (_yieldAmount > totalDebt) {
            _yieldAmount = totalDebt;
        }

        totalDebt -= _yieldAmount;
        bool success = IERC20(collateralToken).transfer(loanFactory, _yieldAmount);
        require(success, "Transfer to factory failed");
        INouLoanFactory(loanFactory).depositToken(collateralToken, _yieldAmount);
    }
}
