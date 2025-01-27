// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./LoETHToken.sol";
import "./NouLoanImpl.sol";

contract NouLoanFactory is Ownable {
    using Clones for address;

    LoETHToken public loEth;
    address public protocolTreasury;

    mapping(address => bool) public allowedCollateral;
    mapping(address => bool) public allowedLoanImplementations;
    mapping(address => uint256) public tokenBalances;
    mapping(address => bool) public activeLoans;

    event TokenBalancesUpdated(address token, uint256 currentBalance);
    event LoanCreated(address indexed user, address loanAddress, address collateralToken, address loanImplementation, uint256 depositAmount);
    event LoanImplementationUpdated(address newImplementation, bool allowed);
    event CollateralUpdated(address token, bool allowed);
    event YieldHarvested(address protocolTreasury, address token, uint256 yield);

    constructor(
        address _owner,
        address _loEth,
        address _protocolTreasury,
        address _initialCollateral,
        address _initialLoanImpl
    ) Ownable(_owner) {
        loEth = LoETHToken(_loEth);
        protocolTreasury = _protocolTreasury;
        allowedCollateral[_initialCollateral] = true;
        allowedLoanImplementations[_initialLoanImpl] = true;
    }

    function setOwner(address newOwner) external onlyOwner {
        _transferOwnership(newOwner);
    }

    function setAllowedCollateral(address token, bool allowed) external onlyOwner {
        allowedCollateral[token] = allowed;
        emit CollateralUpdated(token, allowed);
    }

    function setAllowedLoanImplementation(address newImpl, bool allowed) external onlyOwner {
        allowedLoanImplementations[newImpl] = allowed;
        emit LoanImplementationUpdated(newImpl, allowed);
    }

    function depositToken(address tokenAddress, uint256 amount) external {
        require(activeLoans[msg.sender], "Not a NOU loan");
        tokenBalances[tokenAddress] += amount;
        emit TokenBalancesUpdated(tokenAddress, amount);
    }

    function harvestYield(address tokenAddress) external {
        uint256 bal = IERC20(tokenAddress).balanceOf(address(this));
        uint256 yield = bal - tokenBalances[tokenAddress];
        bool success = IERC20(tokenAddress).transfer(protocolTreasury, yield);
        require(success, "Transfer to treasury failed");
        emit YieldHarvested(protocolTreasury, tokenAddress, yield);
    }

    function createLoan(address _collateralToken, address _loanImplementation, uint256 _depositAmount) external returns (address loanAddress) {
        require(allowedCollateral[_collateralToken], "Collateral not allowed");
        require(allowedLoanImplementations[_loanImplementation], "Loan implementation not allowed");
        require(_depositAmount > 0, "Deposit must be > 0");

        // 1) Transfer stETH from user -> factory
        bool success = IERC20(_collateralToken).transferFrom(msg.sender, address(this), _depositAmount);
        require(success, "Collateral transfer failed");

        // 2) Clone the loanImplementation
        loanAddress = _loanImplementation.clone();

        // 3) (Key fix) Grant minter role *BEFORE* calling initialize()
        loEth.addMinter(loanAddress);

        // 4) Initialize the new loan
        NouLoanImpl(loanAddress).initialize(
            msg.sender,
            _collateralToken,
            address(loEth),
            address(this),
            _depositAmount
        );

        // 5) Transfer stETH from factory -> loan
        success = IERC20(_collateralToken).transfer(loanAddress, _depositAmount);
        require(success, "Collateral -> loan transfer failed");

        activeLoans[loanAddress] = true;

        emit LoanCreated(msg.sender, loanAddress, _collateralToken, _loanImplementation, _depositAmount);
    }
}