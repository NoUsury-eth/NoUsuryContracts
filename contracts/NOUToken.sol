// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title NOUToken
 * @dev A fixed-supply ERC20 token with 1 billion minted to the DAO treasury.
 *      No further minting or burning is allowed.
 */
contract NOUToken is ERC20 {
    /**
     * @dev Constructor.
     * @param daoTreasury The address receiving the 1 billion NOU tokens.
     */
    constructor(address daoTreasury) ERC20("NoUsury", "NOU") {
        require(daoTreasury != address(0), "Invalid treasury address");
        
        // 1 billion tokens with standard 18 decimals = 1,000,000,000e18
        uint256 totalSupply_ = 1_000_000_000 * 10**decimals();
        
        // Mint the entire supply to daoTreasury
        _mint(daoTreasury, totalSupply_);
    }
}