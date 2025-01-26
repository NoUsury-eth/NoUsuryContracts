// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
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
    loETH.target,         // loETH token address
    deployer.address,       // protocolTreasury
    nouToken.target, // initially allowed collateral
    nouLoanImpl.target     // initial loan impl
  );
  await nouLoanFactory.waitForDeployment();
  console.log("NouLoanFactory deployed to:", nouLoanFactory.target);

  // 5. Grant DEFAULT_ADMIN_ROLE to NouLoanFactory in LoETHToken
  const DEFAULT_ADMIN_ROLE = await loETH.DEFAULT_ADMIN_ROLE();
  const grantRoleTx = await loETH.grantRole(DEFAULT_ADMIN_ROLE, nouLoanFactory.target);
  await grantRoleTx.wait();
  console.log("Granted DEFAULT_ADMIN_ROLE to NouLoanFactory in LoETHToken");

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
