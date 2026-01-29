const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Integrated Rewards System - Full Test", function () {
  let quizzdle: any;
  let referralContract: any;
  let owner: any;
  let userWithReferral: any;
  let userWithoutReferral: any;
  let referrer: any;

  const FEE_PER_GUESS = ethers.parseEther("0.000001"); // 0.000001 ETH

  beforeEach(async function () {
    [owner, referrer, userWithReferral, userWithoutReferral] = await ethers.getSigners();

    // Deploy Referral Contract
    const ReferralFactory = await ethers.getContractFactory("QuizzdleReferal");
    referralContract = await ReferralFactory.deploy();
    await referralContract.waitForDeployment();

    // Deploy Quizzdle Contract
    const QuizzdleFactory = await ethers.getContractFactory("Quizzdle");
    quizzdle = await QuizzdleFactory.deploy();
    await quizzdle.waitForDeployment();

    // Link Referral Contract to Quizzdle
    await quizzdle.connect(owner).setReferralContract(await referralContract.getAddress());

    // Set salt for random character selection
    const salt = ethers.randomBytes(32);
    await quizzdle.connect(owner).setSalt(salt);

    // Create 3 collections with characters
    const collection1 = [1, 2, 3, 4, 5]; // 5 characters
    const collection2 = [10, 11, 12, 13, 14, 15]; // 6 characters
    const collection3 = [20, 21, 22]; // 3 characters

    await quizzdle.connect(owner).updateCollectionCharacterIds(1, collection1);
    await quizzdle.connect(owner).updateCollectionCharacterIds(2, collection2);
    await quizzdle.connect(owner).updateCollectionCharacterIds(3, collection3);

    // Setup referral system
    // Referrer creates a code
    await referralContract.connect(referrer).setReferralCode("REFERRER1");

    // UserWithReferral registers with the referral code
    await referralContract.connect(userWithReferral).registerWithReferral("REFERRER1");

    // UserWithoutReferral registers without referral
    await referralContract.connect(userWithoutReferral).registerWithReferral("");

    // Owner also registers (no referral)
    await referralContract.connect(owner).registerWithReferral("");
  });

  describe("📊 Day 1: Users Play Multiple Collections", function () {
    it("Should allow users to make guesses and track wins", async function () {
      console.log("\n🎮 DAY 1: Users play the game");
      console.log("=====================================");

      // Get daily characters for each collection (owner only function)
      const dailyChar1 = await quizzdle.connect(owner).getDailyCharacterId(1);
      const dailyChar2 = await quizzdle.connect(owner).getDailyCharacterId(2);
      const dailyChar3 = await quizzdle.connect(owner).getDailyCharacterId(3);

      console.log(`Daily characters: Collection1=${dailyChar1}, Collection2=${dailyChar2}, Collection3=${dailyChar3}`);

      // === User WITH referral plays ===
      console.log("\n👤 User WITH referral plays:");

      // Collection 1: Try wrong guesses, then win
      await quizzdle.connect(userWithReferral).makeGuess(1, 1, { value: FEE_PER_GUESS });
      console.log("  ❌ Collection 1: Wrong guess (1)");

      if (dailyChar1 !== BigInt(1)) {
        const tx = await quizzdle.connect(userWithReferral).makeGuess(1, dailyChar1, { value: FEE_PER_GUESS });
        const receipt = await tx.wait();
        console.log(`  ✅ Collection 1: WIN with character ${dailyChar1}! (tx: ${receipt.hash})`);
      }

      // Collection 2: Win directly
      const tx2 = await quizzdle.connect(userWithReferral).makeGuess(2, dailyChar2, { value: FEE_PER_GUESS });
      const receipt2 = await tx2.wait();
      console.log(`  ✅ Collection 2: WIN with character ${dailyChar2}! (tx: ${receipt2.hash})`);

      // === User WITHOUT referral plays ===
      console.log("\n👤 User WITHOUT referral plays:");

      // Collection 1: Try multiple wrong guesses, then win
      await quizzdle.connect(userWithoutReferral).makeGuess(1, 1, { value: FEE_PER_GUESS });
      await quizzdle.connect(userWithoutReferral).makeGuess(1, 2, { value: FEE_PER_GUESS });
      console.log("  ❌ Collection 1: 2 wrong guesses");

      if (dailyChar1 !== BigInt(1) && dailyChar1 !== BigInt(2)) {
        await quizzdle.connect(userWithoutReferral).makeGuess(1, dailyChar1, { value: FEE_PER_GUESS });
        console.log(`  ✅ Collection 1: WIN with character ${dailyChar1}!`);
      }

      // Collection 3: Win directly
      await quizzdle.connect(userWithoutReferral).makeGuess(3, dailyChar3, { value: FEE_PER_GUESS });
      console.log(`  ✅ Collection 3: WIN with character ${dailyChar3}!`);

      // === Owner plays ===
      console.log("\n👑 Owner plays:");

      await quizzdle.connect(owner).makeGuess(1, 1, { value: FEE_PER_GUESS });
      await quizzdle.connect(owner).makeGuess(2, dailyChar2, { value: FEE_PER_GUESS });
      console.log(`  ✅ Collection 2: WIN with character ${dailyChar2}!`);

      // === Verify stats ===
      console.log("\n📈 Day 1 Stats:");
      const currentDay = await quizzdle.getCurrentDay();
      console.log(`Current day: ${currentDay}`);

      const totalWinsDay = await quizzdle.totalWinsPerDay(currentDay);
      console.log(`Total wins today: ${totalWinsDay}`);

      const userWithRefWins = await quizzdle.getPlayerWinsForDay(userWithReferral.address, currentDay);
      const userWithoutRefWins = await quizzdle.getPlayerWinsForDay(userWithoutReferral.address, currentDay);
      const ownerWins = await quizzdle.getPlayerWinsForDay(owner.address, currentDay);

      console.log(`  - User WITH referral: ${userWithRefWins} wins`);
      console.log(`  - User WITHOUT referral: ${userWithoutRefWins} wins`);
      console.log(`  - Owner: ${ownerWins} wins`);

      // Check daily revenue
      const dailyRevenue = await quizzdle.dailyRevenue(currentDay);
      console.log(`Daily revenue: ${ethers.formatEther(dailyRevenue)} ETH`);

      // Check referral rewards
      const referrerRewards = await quizzdle.referralRewards(referrer.address);
      console.log(`Referrer pending rewards: ${ethers.formatEther(referrerRewards)} ETH`);

      // Verify wins are tracked
      expect(totalWinsDay).to.be.greaterThan(0);
      expect(userWithRefWins).to.be.greaterThan(0);
      expect(dailyRevenue).to.be.greaterThan(0);
    });
  });

  describe("🌅 Day 2: Finalization & Claims", function () {
    let day1: bigint;
    let day1Revenue: bigint;
    let day1TotalWins: bigint;
    let userWithRefDay1Wins: bigint;
    let userWithoutRefDay1Wins: bigint;
    let ownerDay1Wins: bigint;

    beforeEach(async function () {
      // Reproduce Day 1 scenario
      const dailyChar1 = await quizzdle.connect(owner).getDailyCharacterId(1);
      const dailyChar2 = await quizzdle.connect(owner).getDailyCharacterId(2);
      const dailyChar3 = await quizzdle.connect(owner).getDailyCharacterId(3);

      // UserWithReferral: 2 wins (collections 1, 2)
      await quizzdle.connect(userWithReferral).makeGuess(1, dailyChar1, { value: FEE_PER_GUESS });
      await quizzdle.connect(userWithReferral).makeGuess(2, dailyChar2, { value: FEE_PER_GUESS });

      // UserWithoutReferral: 2 wins (collections 1, 3)
      await quizzdle.connect(userWithoutReferral).makeGuess(1, dailyChar1, { value: FEE_PER_GUESS });
      await quizzdle.connect(userWithoutReferral).makeGuess(3, dailyChar3, { value: FEE_PER_GUESS });

      // Owner: 1 win (collection 2)
      await quizzdle.connect(owner).makeGuess(2, dailyChar2, { value: FEE_PER_GUESS });

      day1 = await quizzdle.getCurrentDay();
      day1Revenue = await quizzdle.dailyRevenue(day1);
      day1TotalWins = await quizzdle.totalWinsPerDay(day1);
      userWithRefDay1Wins = await quizzdle.getPlayerWinsForDay(userWithReferral.address, day1);
      userWithoutRefDay1Wins = await quizzdle.getPlayerWinsForDay(userWithoutReferral.address, day1);
      ownerDay1Wins = await quizzdle.getPlayerWinsForDay(owner.address, day1);
    });

    it("Should finalize Day 1 when Day 2 starts", async function () {
      console.log("\n⏰ Moving to Day 2...");
      console.log("=====================================");

      // Move time forward by 1 day (86400 seconds)
      await time.increase(86400);

      const day2 = await quizzdle.getCurrentDay();
      console.log(`Current day after time travel: ${day2}`);
      console.log(`Day 1 was: ${day1}`);

      // Check that Day 1 is NOT finalized yet
      let isDay1Finalized = await quizzdle.dayFinalized(day1);
      console.log(`Is Day 1 finalized? ${isDay1Finalized}`);
      expect(isDay1Finalized).to.be.false;

      // Make a guess on Day 2 to trigger finalization
      const dailyChar1Day2 = await quizzdle.connect(owner).getDailyCharacterId(1);
      console.log("\n🔄 Making first guess of Day 2 (triggers Day 1 finalization)...");

      const tx = await quizzdle.connect(owner).makeGuess(1, dailyChar1Day2, { value: FEE_PER_GUESS });
      const receipt = await tx.wait();

      // Check for DayFinalized event
      const dayFinalizedEvent = receipt.logs.find((log: any) => {
        try {
          return quizzdle.interface.parseLog(log)?.name === "DayFinalized";
        } catch {
          return false;
        }
      });

      if (dayFinalizedEvent) {
        const parsed = quizzdle.interface.parseLog(dayFinalizedEvent);
        console.log(`✅ Day ${parsed.args.day} finalized!`);
        console.log(`   Total revenue: ${ethers.formatEther(parsed.args.totalRevenue)} ETH`);
        console.log(`   Total wins: ${parsed.args.totalWins}`);
        console.log(`   Reward per win: ${ethers.formatEther(parsed.args.rewardPerWin)} ETH`);
      }

      // Verify Day 1 is now finalized
      isDay1Finalized = await quizzdle.dayFinalized(day1);
      expect(isDay1Finalized).to.be.true;

      // Get reward per win
      const rewardPerWin = await quizzdle.rewardPerWinPerDay(day1);
      console.log(`\n💰 Day 1 reward per win: ${ethers.formatEther(rewardPerWin)} ETH`);

      // Calculate expected reward (45% of daily revenue divided by total wins)
      const expectedWinnersPool = (day1Revenue * BigInt(45)) / BigInt(100);
      const expectedRewardPerWin = expectedWinnersPool / day1TotalWins;

      console.log(`\n📊 Verification:`);
      console.log(`   Day 1 revenue: ${ethers.formatEther(day1Revenue)} ETH`);
      console.log(`   Winners pool (45%): ${ethers.formatEther(expectedWinnersPool)} ETH`);
      console.log(`   Total wins: ${day1TotalWins}`);
      console.log(`   Expected reward per win: ${ethers.formatEther(expectedRewardPerWin)} ETH`);
      console.log(`   Actual reward per win: ${ethers.formatEther(rewardPerWin)} ETH`);

      expect(rewardPerWin).to.equal(expectedRewardPerWin);
    });

    it("Should allow winners to claim their rewards", async function () {
      console.log("\n💎 Testing Winner Rewards Claims");
      console.log("=====================================");

      // Move to Day 2 and finalize Day 1
      await time.increase(86400);
      const dailyChar1Day2 = await quizzdle.connect(owner).getDailyCharacterId(1);
      await quizzdle.connect(owner).makeGuess(1, dailyChar1Day2, { value: FEE_PER_GUESS });

      console.log(`\n📅 Day 1: ${day1}`);
      console.log(`Total wins: ${day1TotalWins}`);
      console.log(`Total revenue: ${ethers.formatEther(day1Revenue)} ETH\n`);

      const rewardPerWin = await quizzdle.rewardPerWinPerDay(day1);

      // === UserWithReferral Claims ===
      console.log(`👤 User WITH referral (${userWithRefDay1Wins} wins):`);

      const userWithRefPending = await quizzdle.getPendingWinnerRewards(userWithReferral.address, day1);
      console.log(`   Pending rewards: ${ethers.formatEther(userWithRefPending)} ETH`);

      const expectedUserWithRef = rewardPerWin * userWithRefDay1Wins;
      expect(userWithRefPending).to.equal(expectedUserWithRef);

      const balanceBefore1 = await ethers.provider.getBalance(userWithReferral.address);
      const claimTx1 = await quizzdle.connect(userWithReferral).claimWinnerRewards(day1);
      const claimReceipt1 = await claimTx1.wait();
      const balanceAfter1 = await ethers.provider.getBalance(userWithReferral.address);

      const gasUsed1 = claimReceipt1.gasUsed * claimReceipt1.gasPrice;
      const netReceived1 = balanceAfter1 - balanceBefore1 + gasUsed1;

      console.log(`   ✅ Claimed: ${ethers.formatEther(netReceived1)} ETH`);
      expect(netReceived1).to.equal(userWithRefPending);

      // Verify cannot claim again
      await expect(
        quizzdle.connect(userWithReferral).claimWinnerRewards(day1)
      ).to.be.revertedWith("Rewards already claimed for this day");

      // === UserWithoutReferral Claims ===
      console.log(`\n👤 User WITHOUT referral (${userWithoutRefDay1Wins} wins):`);

      const userWithoutRefPending = await quizzdle.getPendingWinnerRewards(userWithoutReferral.address, day1);
      console.log(`   Pending rewards: ${ethers.formatEther(userWithoutRefPending)} ETH`);

      const balanceBefore2 = await ethers.provider.getBalance(userWithoutReferral.address);
      const claimTx2 = await quizzdle.connect(userWithoutReferral).claimWinnerRewards(day1);
      const claimReceipt2 = await claimTx2.wait();
      const balanceAfter2 = await ethers.provider.getBalance(userWithoutReferral.address);

      const gasUsed2 = claimReceipt2.gasUsed * claimReceipt2.gasPrice;
      const netReceived2 = balanceAfter2 - balanceBefore2 + gasUsed2;

      console.log(`   ✅ Claimed: ${ethers.formatEther(netReceived2)} ETH`);
      expect(netReceived2).to.equal(userWithoutRefPending);

      // === Owner Claims ===
      console.log(`\n👑 Owner (${ownerDay1Wins} win):`);

      const ownerPending = await quizzdle.getPendingWinnerRewards(owner.address, day1);
      console.log(`   Pending rewards: ${ethers.formatEther(ownerPending)} ETH`);

      const balanceBefore3 = await ethers.provider.getBalance(owner.address);
      const claimTx3 = await quizzdle.connect(owner).claimWinnerRewards(day1);
      const claimReceipt3 = await claimTx3.wait();
      const balanceAfter3 = await ethers.provider.getBalance(owner.address);

      const gasUsed3 = claimReceipt3.gasUsed * claimReceipt3.gasPrice;
      const netReceived3 = balanceAfter3 - balanceBefore3 + gasUsed3;

      console.log(`   ✅ Claimed: ${ethers.formatEther(netReceived3)} ETH`);
      expect(netReceived3).to.equal(ownerPending);

      // === Verify Total Distribution ===
      console.log(`\n📊 Distribution Summary:`);
      const totalClaimed = userWithRefPending + userWithoutRefPending + ownerPending;
      const expectedTotal = (day1Revenue * BigInt(45)) / BigInt(100);

      console.log(`   Total claimed: ${ethers.formatEther(totalClaimed)} ETH`);
      console.log(`   Expected (45% of revenue): ${ethers.formatEther(expectedTotal)} ETH`);

      expect(totalClaimed).to.equal(expectedTotal);
    });

    it("Should allow referrer to claim referral rewards", async function () {
      console.log("\n🎁 Testing Referral Rewards Claims");
      console.log("=====================================");

      const referrerPending = await quizzdle.referralRewards(referrer.address);
      const referrerTotal = await quizzdle.getTotalReferralEarned(referrer.address);

      console.log(`Referrer stats:`);
      console.log(`   Pending rewards: ${ethers.formatEther(referrerPending)} ETH`);
      console.log(`   Total earned (lifetime): ${ethers.formatEther(referrerTotal)} ETH`);

      // Calculate expected (10% of userWithReferral's fees only)
      // UserWithReferral made 2 guesses = 2 * FEE_PER_GUESS
      const expectedReferral = (FEE_PER_GUESS * BigInt(2) * BigInt(10)) / BigInt(100);

      console.log(`   Expected: ${ethers.formatEther(expectedReferral)} ETH`);
      expect(referrerPending).to.equal(expectedReferral);

      // Claim referral rewards
      const balanceBefore = await ethers.provider.getBalance(referrer.address);
      const claimTx = await quizzdle.connect(referrer).claimReferralRewards();
      const claimReceipt = await claimTx.wait();
      const balanceAfter = await ethers.provider.getBalance(referrer.address);

      const gasUsed = claimReceipt.gasUsed * claimReceipt.gasPrice;
      const netReceived = balanceAfter - balanceBefore + gasUsed;

      console.log(`   ✅ Claimed: ${ethers.formatEther(netReceived)} ETH`);
      expect(netReceived).to.equal(referrerPending);

      // Verify cannot claim again
      await expect(
        quizzdle.connect(referrer).claimReferralRewards()
      ).to.be.revertedWith("No referral rewards to claim");

      // Verify total earned is still tracked
      const newTotal = await quizzdle.getTotalReferralEarned(referrer.address);
      expect(newTotal).to.equal(referrerTotal);
    });

    it("Should protect reserved funds in owner withdraw", async function () {
      console.log("\n🏦 Testing Owner Withdrawal Protection");
      console.log("=====================================");

      // Move to Day 2 and finalize Day 1
      await time.increase(86400);
      const dailyChar1Day2 = await quizzdle.connect(owner).getDailyCharacterId(1);
      await quizzdle.connect(owner).makeGuess(1, dailyChar1Day2, { value: FEE_PER_GUESS });

      const contractBalance = await ethers.provider.getBalance(await quizzdle.getAddress());
      console.log(`Contract balance: ${ethers.formatEther(contractBalance)} ETH`);

      // Calculate reserves
      const totalReferralRewards = await quizzdle.totalReferralRewards();
      const totalReferralsClaimed = await quizzdle.totalReferralsClaimed();
      const reservedForReferrals = totalReferralRewards - totalReferralsClaimed;

      const totalWinnerRewardsDistributed = await quizzdle.totalWinnerRewardsDistributed();
      const totalWinnerRewardsClaimed = await quizzdle.totalWinnerRewardsClaimed();
      const reservedForWinners = totalWinnerRewardsDistributed - totalWinnerRewardsClaimed;

      const totalReserved = reservedForReferrals + reservedForWinners;
      const expectedWithdrawable = contractBalance - totalReserved;

      console.log(`\nReserves:`);
      console.log(`   For referrals: ${ethers.formatEther(reservedForReferrals)} ETH`);
      console.log(`   For winners: ${ethers.formatEther(reservedForWinners)} ETH`);
      console.log(`   Total reserved: ${ethers.formatEther(totalReserved)} ETH`);
      console.log(`\nExpected withdrawable: ${ethers.formatEther(expectedWithdrawable)} ETH`);

      // Owner withdraws
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      const withdrawTx = await quizzdle.connect(owner).withdraw(owner.address);
      const withdrawReceipt = await withdrawTx.wait();
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      const gasUsed = withdrawReceipt.gasUsed * withdrawReceipt.gasPrice;
      const netReceived = ownerBalanceAfter - ownerBalanceBefore + gasUsed;

      console.log(`\n✅ Owner withdrew: ${ethers.formatEther(netReceived)} ETH`);
      expect(netReceived).to.equal(expectedWithdrawable);

      // Verify reserves are still in contract
      const newContractBalance = await ethers.provider.getBalance(await quizzdle.getAddress());
      console.log(`Contract balance after withdraw: ${ethers.formatEther(newContractBalance)} ETH`);
      expect(newContractBalance).to.be.greaterThanOrEqual(totalReserved);
    });
  });

  describe("🔄 Multi-Day Scenario", function () {
    it("Should handle 3 days of gameplay and claims correctly", async function () {
      console.log("\n🗓️ 3-DAY SCENARIO TEST");
      console.log("=====================================");

      const days = [];

      // === DAY 1 ===
      console.log("\n📅 DAY 1:");
      const day1 = await quizzdle.getCurrentDay();
      const char1_d1 = await quizzdle.connect(owner).getDailyCharacterId(1);

      await quizzdle.connect(userWithReferral).makeGuess(1, char1_d1, { value: FEE_PER_GUESS });
      await quizzdle.connect(userWithoutReferral).makeGuess(1, char1_d1, { value: FEE_PER_GUESS });

      const wins_d1 = await quizzdle.totalWinsPerDay(day1);
      console.log(`   Total wins: ${wins_d1}`);
      days.push(day1);

      // === DAY 2 ===
      await time.increase(86400);
      console.log("\n📅 DAY 2:");
      const day2 = await quizzdle.getCurrentDay();
      const char1_d2 = await quizzdle.connect(owner).getDailyCharacterId(1);

      // This triggers Day 1 finalization
      await quizzdle.connect(userWithReferral).makeGuess(1, char1_d2, { value: FEE_PER_GUESS });
      await quizzdle.connect(owner).makeGuess(1, char1_d2, { value: FEE_PER_GUESS });

      const isDay1Finalized = await quizzdle.dayFinalized(day1);
      console.log(`   Day 1 finalized: ${isDay1Finalized}`);
      expect(isDay1Finalized).to.be.true;

      const wins_d2 = await quizzdle.totalWinsPerDay(day2);
      console.log(`   Total wins: ${wins_d2}`);
      days.push(day2);

      // === DAY 3 ===
      await time.increase(86400);
      console.log("\n📅 DAY 3:");
      const day3 = await quizzdle.getCurrentDay();
      const char1_d3 = await quizzdle.connect(owner).getDailyCharacterId(1);

      // This triggers Day 2 finalization
      await quizzdle.connect(userWithoutReferral).makeGuess(1, char1_d3, { value: FEE_PER_GUESS });

      const isDay2Finalized = await quizzdle.dayFinalized(day2);
      console.log(`   Day 2 finalized: ${isDay2Finalized}`);
      expect(isDay2Finalized).to.be.true;

      // === CLAIMS ===
      console.log("\n💰 CLAIMS:");

      // Claim Day 1
      const pending_d1_user1 = await quizzdle.getPendingWinnerRewards(userWithReferral.address, day1);
      if (pending_d1_user1 > 0) {
        await quizzdle.connect(userWithReferral).claimWinnerRewards(day1);
        console.log(`   ✅ User1 claimed Day 1: ${ethers.formatEther(pending_d1_user1)} ETH`);
      }

      // Claim Day 2
      const pending_d2_user1 = await quizzdle.getPendingWinnerRewards(userWithReferral.address, day2);
      if (pending_d2_user1 > 0) {
        await quizzdle.connect(userWithReferral).claimWinnerRewards(day2);
        console.log(`   ✅ User1 claimed Day 2: ${ethers.formatEther(pending_d2_user1)} ETH`);
      }

      // Verify user cannot claim Day 3 (not finalized yet)
      await expect(
        quizzdle.connect(userWithoutReferral).claimWinnerRewards(day3)
      ).to.be.revertedWith("Day not finalized yet");

      console.log("\n✅ Multi-day scenario completed successfully!");
    });
  });
});
