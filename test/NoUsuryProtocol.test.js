const { expect } = require("chai");
const { ethers } = require("hardhat");
// If you'd like to partially match event args (like loanAddress), import anyValue:
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("NoUsury Protocol (Ethers v6) - Updated Single-Transaction Flow", function () {
  let deployer, dao, user, other;
  let NOU, LOETH, stETHMock;
  let nouLoanImpl, nouLoanFactory;

  before(async () => {
    [deployer, dao, user, other] = await ethers.getSigners();
  });

  beforeEach(async () => {
    //
    // 1) Deploy NOU => minted to dao
    //
    const NOUTokenFactory = await ethers.getContractFactory("NOUToken");
    NOU = await NOUTokenFactory.deploy(dao.address);
    await NOU.waitForDeployment();

    // 2) Deploy LOETH
    const LoETHTokenFactory = await ethers.getContractFactory("LoETHToken");
    LOETH = await LoETHTokenFactory.deploy();
    await LOETH.waitForDeployment();

    // 3) Deploy mock stETH
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    stETHMock = await MockERC20Factory.deploy("Mock stETH", "stETH");
    await stETHMock.waitForDeployment();

    // 4) Deploy NouLoanImpl
    const NouLoanImplFactory = await ethers.getContractFactory("NouLoanImpl");
    nouLoanImpl = await NouLoanImplFactory.deploy();
    await nouLoanImpl.waitForDeployment();
    const loanImplAddr = await nouLoanImpl.getAddress();

    // 5) Deploy NouLoanFactory => dao is owner
    const NouLoanFactoryFactory = await ethers.getContractFactory("NouLoanFactory");
    nouLoanFactory = await NouLoanFactoryFactory.deploy(
      dao.address,            // owner
      await LOETH.getAddress(),
      dao.address,            // protocolTreasury
      await stETHMock.getAddress(),
      await nouLoanImpl.getAddress()
    );
    await nouLoanFactory.waitForDeployment();

    // 6) We must give the factory DEFAULT_ADMIN_ROLE on LOETH so it can call addMinter(...)
    const DEFAULT_ADMIN_ROLE = await LOETH.DEFAULT_ADMIN_ROLE();
    // deployer is admin by default, so:
    await LOETH.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, await nouLoanFactory.getAddress());

    // 7) dao allows stETHMock as collateral
    await nouLoanFactory.connect(dao).setAllowedCollateral(await stETHMock.getAddress(), true);
  });

  // ---------------------------------------------------------
  // Deployment Checks
  // ---------------------------------------------------------
  describe("Deployment", function () {
    it("NOUToken: DAO treasury holds entire supply", async function () {
      const daoBal = await NOU.balanceOf(dao.address);
      expect(daoBal).to.equal(await NOU.totalSupply());
    });

    it("NouLoanFactory is configured correctly", async function () {
      const allowedLoanImpl = await nouLoanFactory.allowedLoanImplementations(await nouLoanImpl.getAddress());
      expect(allowedLoanImpl).to.be.true;

      const loEthAddr = await nouLoanFactory.loEth();
      expect(loEthAddr).to.equal(await LOETH.getAddress());

      const allowedCollateral = await nouLoanFactory.allowedCollateral(await stETHMock.getAddress());
      expect(allowedCollateral).to.be.true;
    });
  });

  // ---------------------------------------------------------
  // User Loan Flow
  // ---------------------------------------------------------
  describe("User loan flow", function () {
    const depositAmount = ethers.parseEther("100");

    beforeEach(async () => {
      // Mint 1000 stETH to the user
      await stETHMock.connect(deployer).mint(user.address, ethers.parseEther("1000"));
    });

    it("User can create a loan in a single transaction", async function () {
      // 1) User approves factory
      await stETHMock.connect(user).approve(await nouLoanFactory.getAddress(), depositAmount);

      // 2) We expect the createLoan tx to emit LoanCreated
      const tx = await nouLoanFactory.connect(user).createLoan(
        await stETHMock.getAddress(),
        await nouLoanImpl.getAddress(),
        depositAmount
      );

      await expect(tx)
        .to.emit(nouLoanFactory, "LoanCreated")
        .withArgs(
          user.address,
          anyValue, // We don't know the actual loanAddress yet
          await stETHMock.getAddress(),
          await nouLoanImpl.getAddress(),
          depositAmount
        );

      // 3) If we need the new loanAddress, parse logs from the receipt
      const receipt = await tx.wait();
      const factoryAddress = await nouLoanFactory.getAddress();
      // Filter logs by the factory address
      const creationLogs = receipt.logs.filter(l => l.address === factoryAddress);

      // Parse them with the factory's interface
      const factoryIface = (await ethers.getContractFactory("NouLoanFactory")).interface;
      let loanAddress;
      for (const log of creationLogs) {
        const parsed = factoryIface.parseLog({ topics: log.topics, data: log.data });
        if (parsed.name === "LoanCreated") {
          loanAddress = parsed.args.loanAddress;
          break;
        }
      }
      expect(loanAddress).to.be.properAddress;
      console.log('loanAddress: ', loanAddress)

      // Check user got loETH minted
      const userLoETHBal = await LOETH.balanceOf(user.address);
      expect(userLoETHBal).to.equal(depositAmount);

      // Check the loan contract has the stETH
      const loanStBal = await stETHMock.balanceOf(loanAddress);
      expect(loanStBal).to.equal(depositAmount);
    });

    it("User can repay part of the loan", async function () {
      // 1) Create loan
      await stETHMock.connect(user).approve(await nouLoanFactory.getAddress(), depositAmount);
      const tx = await nouLoanFactory.connect(user).createLoan(
        await stETHMock.getAddress(),
        await nouLoanImpl.getAddress(),
        depositAmount
      );

      // Check event (no log parsing needed if you just trust it works).
      await expect(tx)
        .to.emit(nouLoanFactory, "LoanCreated")
        .withArgs(
          user.address,
          anyValue,
          await stETHMock.getAddress(),
          await nouLoanImpl.getAddress(),
          depositAmount
        );

      // 2) Parse logs to get loanAddress
      const rcpt = await tx.wait();
      const factoryAddress = await nouLoanFactory.getAddress();
      const factoryIface = (await ethers.getContractFactory("NouLoanFactory")).interface;
      let loanAddress;
      for (const log of rcpt.logs) {
        if (log.address === factoryAddress) {
          const parsed = factoryIface.parseLog({ topics: log.topics, data: log.data });
          if (parsed.name === "LoanCreated") {
            loanAddress = parsed.args.loanAddress;
            break;
          }
        }
      }

      const loanContract = await ethers.getContractAt("NouLoanImpl", loanAddress);
      // Check user loETH
      let userLoBal = await LOETH.balanceOf(user.address);
      expect(userLoBal).to.equal(depositAmount);

      // 3) Repay half
      const repayAmount = ethers.parseEther("50");
      await LOETH.connect(user).approve(loanAddress, repayAmount);

      await loanContract.connect(user).repayLoan(repayAmount);

      userLoBal = await LOETH.balanceOf(user.address);
      expect(userLoBal).to.equal(BigInt(depositAmount) - (BigInt(repayAmount)));

      const totalDebt = await loanContract.totalDebt();
      expect(totalDebt).to.equal(BigInt(depositAmount) - (BigInt(repayAmount)));
    });

    it("User can withdraw collateral above outstanding debt", async function () {
      // create loan
      await stETHMock.connect(user).approve(await nouLoanFactory.getAddress(), depositAmount);
      const tx = await nouLoanFactory.connect(user).createLoan(
        await stETHMock.getAddress(),
        await nouLoanImpl.getAddress(),
        depositAmount
      );
      await expect(tx)
        .to.emit(nouLoanFactory, "LoanCreated")
        .withArgs(
          user.address,
          anyValue,
          await stETHMock.getAddress(),
          await nouLoanImpl.getAddress(),
          depositAmount
        );

      // parse logs to get loanAddress
      const rcpt = await tx.wait();
      const factoryAddress = await nouLoanFactory.getAddress();
      const factoryIface = (await ethers.getContractFactory("NouLoanFactory")).interface;
      let loanAddress;
      for (const log of rcpt.logs) {
        if (log.address === factoryAddress) {
          const parsed = factoryIface.parseLog({ topics: log.topics, data: log.data });
          if (parsed.name === "LoanCreated") {
            loanAddress = parsed.args.loanAddress;
            break;
          }
        }
      }

      const loanContract = await ethers.getContractAt("NouLoanImpl", loanAddress);

      // repay partial
      const repayAmount = ethers.parseEther("20");
      await LOETH.connect(user).approve(loanAddress, repayAmount);
      await loanContract.connect(user).repayLoan(repayAmount);

      // withdraw 10
      const withdrawAmount = ethers.parseEther("10");
      await loanContract.connect(user).withdrawCollateral(withdrawAmount);

      const userStBalance = await stETHMock.balanceOf(user.address);
      expect(userStBalance).to.equal(ethers.parseEther("910")); // 900 + 10

      const loanStBalance = await stETHMock.balanceOf(loanAddress);
      expect(loanStBalance).to.equal(ethers.parseEther("90"));
    });

    it("User can apply yield to pay down the loan", async function () {
      // create loan
      await stETHMock.connect(user).approve(await nouLoanFactory.getAddress(), depositAmount);
      const tx = await nouLoanFactory.connect(user).createLoan(
        await stETHMock.getAddress(),
        await nouLoanImpl.getAddress(),
        depositAmount
      );
      await expect(tx)
        .to.emit(nouLoanFactory, "LoanCreated")
        .withArgs(
          user.address,
          anyValue,
          await stETHMock.getAddress(),
          await nouLoanImpl.getAddress(),
          depositAmount
        );
      // parse logs
      const rcpt = await tx.wait();
      const factoryAddress = await nouLoanFactory.getAddress();
      const factoryIface = (await ethers.getContractFactory("NouLoanFactory")).interface;
      let loanAddress;
      for (const log of rcpt.logs) {
        if (log.address === factoryAddress) {
          const parsed = factoryIface.parseLog({ topics: log.topics, data: log.data });
          if (parsed.name === "LoanCreated") {
            loanAddress = parsed.args.loanAddress;
            break;
          }
        }
      }

      const loanContract = await ethers.getContractAt("NouLoanImpl", loanAddress);

      // mint yield
      const yieldAmount = ethers.parseEther("10");
      await stETHMock.connect(deployer).mint(loanAddress, yieldAmount);

      // apply partial yield
      const partialYield = ethers.parseEther("5");
      await loanContract.connect(user).applyYieldToPayDownLoan(partialYield);

      const newDebt = await loanContract.totalDebt();
      expect(newDebt).to.equal(BigInt(depositAmount) - (BigInt(partialYield)));

      const daoBal = await stETHMock.balanceOf(dao.address);
      expect(daoBal).to.equal(partialYield);
    });
  });

  // ---------------------------------------------------------
  // Governance / Admin
  // ---------------------------------------------------------
  describe("Governance / Admin", function () {
    it("Owner (DAO) can set allowed loanImplementation", async function () {
      const NouLoanImplFactory = await ethers.getContractFactory("NouLoanImpl");
      const newImpl = await NouLoanImplFactory.deploy();
      await newImpl.waitForDeployment();
      const newImplAddr = await newImpl.getAddress();

      await expect(
        nouLoanFactory.connect(dao).setAllowedLoanImplementation(newImplAddr, true)
      )
        .to.emit(nouLoanFactory, "LoanImplementationUpdated")
        .withArgs(newImplAddr, true);

      const allowed = await nouLoanFactory.allowedLoanImplementations(await newImpl.getAddress());
      expect(allowed).to.be.true;
    });

    it("Non-owner cannot set allowed loanImplementation", async function () {
      await expect(
        nouLoanFactory.connect(user).setAllowedLoanImplementation(ethers.ZeroAddress, true)
      ).to.be.reverted;
    });

    it("Owner (DAO) can setAllowedCollateral", async function () {
      // stETHMock is currently allowed => let's disallow it
      await expect(
        nouLoanFactory.connect(dao).setAllowedCollateral(await stETHMock.getAddress(), false)
      )
        .to.emit(nouLoanFactory, "CollateralUpdated")
        .withArgs(await stETHMock.getAddress(), false);

      const allowed = await nouLoanFactory.allowedCollateral(await stETHMock.getAddress());
      expect(allowed).to.be.false;
    });

    it("Non-owner cannot setAllowedCollateral", async function () {
      await expect(
        nouLoanFactory.connect(user).setAllowedCollateral(await stETHMock.getAddress(), false)
      ).to.be.reverted;
    });
  });
});
