// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer);
  console.log(deployer.address)
  // 1. Deploy NOUToken
  const NOUToken = await ethers.getContractFactory("NOUToken");
  const nouToken = await NOUToken.deploy(deployer.address); // 1 billion capped supply
  await nouToken.waitForDeployment();
  console.log("NOUToken deployed to:", nouToken.target);

  // 2. Deploy LoETHToken
  const LoETHToken = await ethers.getContractFactory("LoETHToken");
  const loETH = await LoETHToken.deploy();
  await loETH.waitForDeployment();
  console.log("LoETHToken deployed to:", loETH.target);

  // 3. Deploy NouLoanImpl (Implementation Contract)
  const NouLoanImpl = await ethers.getContractFactory("NouLoanImpl");
  const nouLoanImpl = await NouLoanImpl.deploy();
  await nouLoanImpl.waitForDeployment();
  console.log("NouLoanImpl deployed to:", nouLoanImpl.target);

  // 4. Deploy NouLoanFactory
  const NouLoanFactory = await ethers.getContractFactory("NouLoanFactory");
  const nouLoanFactory = await NouLoanFactory.deploy(
    deployer.address,      // owner (DAO)
    nouLoanImpl.target,   // loanImplementation
    loETH.target,         // loETH token address
    deployer.address       // protocolTreasury
  );
  await nouLoanFactory.waitForDeployment();
  console.log("NouLoanFactory deployed to:", nouLoanFactory.target);

  // 5. Grant DEFAULT_ADMIN_ROLE to NouLoanFactory in LoETHToken
  const DEFAULT_ADMIN_ROLE = await loETH.DEFAULT_ADMIN_ROLE();
  const grantRoleTx = await loETH.grantRole(DEFAULT_ADMIN_ROLE, nouLoanFactory.target);
  await grantRoleTx.wait();
  console.log("Granted DEFAULT_ADMIN_ROLE to NouLoanFactory in LoETHToken");


  // 6. Set allowed collateral 
  const baseSepoliaStEthAddress = '0x3e3FE7dBc6B4C189E7128855dD526361c49b40Af'
  const tx = await nouLoanFactory.connect(deployer).setAllowedCollateral(baseSepoliaStEthAddress, true);
  await tx.wait();
  console.log("stETH has been whitelisted as collateral.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
