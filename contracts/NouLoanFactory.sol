// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./LoETHToken.sol";
import "./NouLoanImpl.sol";

contract NouLoanFactory is Ownable {
    using Clones for address;

    address public loanImplementation;
    LoETHToken public loEth;
    address public protocolTreasury;

    mapping(address => bool) public allowedCollateral;

    event LoanCreated(address indexed user, address loanAddress, address collateralToken, uint256 depositAmount);
    event LoanImplementationUpdated(address newImplementation);
    event CollateralUpdated(address token, bool allowed);

    constructor(
        address _owner,
        address _loanImplementation,
        address _loEth,
        address _protocolTreasury
    ) Ownable(_owner) {
        loanImplementation = _loanImplementation;
        loEth = LoETHToken(_loEth);
        protocolTreasury = _protocolTreasury;
    }

    function setAllowedCollateral(address token, bool allowed) external onlyOwner {
        allowedCollateral[token] = allowed;
        emit CollateralUpdated(token, allowed);
    }

    function updateLoanImplementation(address newImpl) external onlyOwner {
        loanImplementation = newImpl;
        emit LoanImplementationUpdated(newImpl);
    }

    function createLoan(address _collateralToken, uint256 _depositAmount) external returns (address loanAddress) {
        require(allowedCollateral[_collateralToken], "Collateral not allowed");
        require(_depositAmount > 0, "Deposit must be > 0");

        // 1) Transfer stETH from user -> factory
        bool success = IERC20(_collateralToken).transferFrom(msg.sender, address(this), _depositAmount);
        require(success, "Collateral transfer failed");

        // 2) Clone the loanImplementation
        loanAddress = loanImplementation.clone();

        // 3) (Key fix) Grant minter role *BEFORE* calling initialize()
        loEth.addMinter(loanAddress);

        // 4) Initialize the new loan
        NouLoanImpl(loanAddress).initialize(
            msg.sender,
            _collateralToken,
            address(loEth),
            protocolTreasury,
            _depositAmount
        );

        // 5) Transfer stETH from factory -> loan
        success = IERC20(_collateralToken).transfer(loanAddress, _depositAmount);
        require(success, "Collateral -> loan transfer failed");

        emit LoanCreated(msg.sender, loanAddress, _collateralToken, _depositAmount);
    }
}
