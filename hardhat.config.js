require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  sourcify: {
    enabled: true
  },
  networks: {
    sepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts: {
        mnemonic: process.env.MNEMONIC
      },
      chainId: 84532, // Sepolia's Chain ID
    },
  },
  etherscan: {
    apiKey: {
      "base-sepolia": process.env.ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://base-sepolia.blockscout.com/api",
          browserURL: "https://base-sepolia.blockscout.com"
        }
      }
    ]
  },
};
