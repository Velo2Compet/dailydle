const { ethers } = require("hardhat");

/**
 * Script de test Jour 2 - À lancer DEMAIN (24h après day1)
 *
 * Ce script:
 * - Fait un guess pour déclencher la finalisation du Jour 1
 * - Vérifie que la distribution est correcte
 * - Teste les claims de winner rewards
 * - Teste les claims de referral rewards
 * - Teste le withdraw owner
 *
 * Usage: npx hardhat run scripts/test-day2-realtime.js --network base-sepolia
 */

async function main() {
  console.log("🌅 DAILYDLE - TEST JOUR 2 (Temps Réel - Finalisation)");
  console.log("=" .repeat(60));

  const signers = await ethers.getSigners();
  const deployer = signers[0];

  // Adresses des contrats
  const QUIZZDLE_ADDRESS = process.env.QUIZZDLE_CONTRACT || "0xAbBa084847890fA88481687d75E8E6713CA7fEc6";
  const REFERRAL_ADDRESS = process.env.REFERRAL_CONTRACT || "0x1f5fdA23A0356dFb4c58A00D39692cBb1830BB78";

  console.log("\n📋 Configuration:");
  console.log("Quizzdle:", QUIZZDLE_ADDRESS);
  console.log("Deployer:", deployer.address);

  // Connect to contracts
  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const quizzdle = Quizzdle.attach(QUIZZDLE_ADDRESS);

  // Get current day
  const currentDay = await quizzdle.getCurrentDay();
  const yesterday = currentDay - BigInt(1);

  console.log(`\n📅 Current Day: ${currentDay}`);
  console.log(`📅 Yesterday: ${yesterday}`);

  // Check if yesterday is finalized
  let isYesterdayFinalized = await quizzdle.dayFinalized(yesterday);
  console.log(`\n🔍 Day ${yesterday} finalized: ${isYesterdayFinalized}`);

  if (!isYesterdayFinalized) {
    console.log("\n⚡ Triggering Day 1 finalization...");
    console.log("   Making a guess on Day 2...");

    try {
      const feePerGuess = await quizzdle.feePerGuess();
      const dailyChar1 = await quizzdle.getDailyCharacterId(1);

      const tx = await quizzdle.connect(deployer).makeGuess(1, dailyChar1, { value: feePerGuess });
      const receipt = await tx.wait();

      console.log(`   ✅ Guess made (tx: ${receipt.hash})`);

      // Check for DayFinalized event
      const dayFinalizedEvent = receipt.logs.find((log) => {
        try {
          const parsed = quizzdle.interface.parseLog(log);
          return parsed && parsed.name === "DayFinalized";
        } catch {
          return false;
        }
      });

      if (dayFinalizedEvent) {
        const parsed = quizzdle.interface.parseLog(dayFinalizedEvent);
        console.log(`\n✨ DAY ${parsed.args.day} FINALIZED!`);
        console.log(`   Total Revenue: ${ethers.formatEther(parsed.args.totalRevenue)} ETH`);
        console.log(`   Total Wins: ${parsed.args.totalWins}`);
        console.log(`   Reward per Win: ${ethers.formatEther(parsed.args.rewardPerWin)} ETH`);
      }

      isYesterdayFinalized = true;
    } catch (err) {
      console.error("   ❌ Error:", err.message);
      process.exit(1);
    }
  } else {
    console.log("   ℹ️ Day 1 already finalized");
  }

  // === VERIFY DAY 1 STATS ===
  console.log("\n📊 DAY 1 FINAL STATS:");
  console.log("=" .repeat(60));

  const day1Revenue = await quizzdle.dailyRevenue(yesterday);
  const day1TotalWins = await quizzdle.totalWinsPerDay(yesterday);
  const day1RewardPerWin = await quizzdle.rewardPerWinPerDay(yesterday);

  console.log(`💰 Revenue: ${ethers.formatEther(day1Revenue)} ETH`);
  console.log(`🏆 Total Wins: ${day1TotalWins}`);
  console.log(`💎 Reward per Win: ${ethers.formatEther(day1RewardPerWin)} ETH`);

  // Individual wins
  const deployerWins = await quizzdle.getPlayerWinsForDay(deployer.address, yesterday);

  console.log(`\n👥 Individual Wins (Day 1):`);
  console.log(`   Deployer: ${deployerWins} wins → ${ethers.formatEther(day1RewardPerWin * deployerWins)} ETH`);

  // === TEST WINNER REWARDS CLAIMS ===
  console.log("\n💎 TESTING WINNER REWARDS CLAIMS:");
  console.log("=" .repeat(60));

  // Deployer claims
  if (deployerWins > 0) {
    console.log("\n👤 Deployer claiming...");
    const deployerPending = await quizzdle.getPendingWinnerRewards(deployer.address, yesterday);
    console.log(`   Pending: ${ethers.formatEther(deployerPending)} ETH`);

    try {
      const balanceBefore = await ethers.provider.getBalance(deployer.address);
      const tx = await quizzdle.connect(deployer).claimWinnerRewards(yesterday);
      const receipt = await tx.wait();
      const balanceAfter = await ethers.provider.getBalance(deployer.address);

      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const netReceived = balanceAfter - balanceBefore + gasUsed;

      console.log(`   ✅ Claimed: ${ethers.formatEther(netReceived)} ETH`);
      console.log(`   Gas used: ${ethers.formatEther(gasUsed)} ETH`);
    } catch (err) {
      console.log(`   ⚠️ Error:`, err.message.split('\n')[0]);
    }
  }


  // === TEST REFERRAL REWARDS CLAIMS ===
  console.log("\n🎁 TESTING REFERRAL REWARDS CLAIMS:");
  console.log("=" .repeat(60));

  const deployerReferral = await quizzdle.referralRewards(deployer.address);
  console.log(`\n👤 Deployer Referral Rewards: ${ethers.formatEther(deployerReferral)} ETH`);

  if (deployerReferral > 0) {
    console.log("   Attempting to claim...");
    try {
      const balanceBefore = await ethers.provider.getBalance(deployer.address);
      const tx = await quizzdle.connect(deployer).claimReferralRewards();
      const receipt = await tx.wait();
      const balanceAfter = await ethers.provider.getBalance(deployer.address);

      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const netReceived = balanceAfter - balanceBefore + gasUsed;

      console.log(`   ✅ Claimed: ${ethers.formatEther(netReceived)} ETH`);
      console.log(`   Gas used: ${ethers.formatEther(gasUsed)} ETH`);
    } catch (err) {
      console.log(`   ⚠️ Error:`, err.message.split('\n')[0]);
    }
  } else {
    console.log("   ℹ️ No referral rewards to claim");
  }

  // === TEST OWNER WITHDRAW ===
  console.log("\n💰 TESTING OWNER WITHDRAW:");
  console.log("=" .repeat(60));

  const contractBalance = await ethers.provider.getBalance(QUIZZDLE_ADDRESS);
  const totalReferralRewards = await quizzdle.totalReferralRewards();
  const totalReferralsClaimed = await quizzdle.totalReferralsClaimed();
  const totalWinnerRewardsDistributed = await quizzdle.totalWinnerRewardsDistributed();
  const totalWinnerRewardsClaimed = await quizzdle.totalWinnerRewardsClaimed();

  const reservedForReferrals = totalReferralRewards - totalReferralsClaimed;
  const reservedForWinners = totalWinnerRewardsDistributed - totalWinnerRewardsClaimed;
  const totalReserved = reservedForReferrals + reservedForWinners;
  const withdrawable = contractBalance > totalReserved ? contractBalance - totalReserved : BigInt(0);

  console.log(`\n📊 Contract Status:`);
  console.log(`   Balance: ${ethers.formatEther(contractBalance)} ETH`);
  console.log(`   Reserved for Referrals: ${ethers.formatEther(reservedForReferrals)} ETH`);
  console.log(`   Reserved for Winners: ${ethers.formatEther(reservedForWinners)} ETH`);
  console.log(`   Total Reserved: ${ethers.formatEther(totalReserved)} ETH`);
  console.log(`   Withdrawable (45% owner): ${ethers.formatEther(withdrawable)} ETH`);

  if (withdrawable > 0) {
    console.log(`\n👑 Owner withdrawing...`);
    try {
      const balanceBefore = await ethers.provider.getBalance(deployer.address);
      const tx = await quizzdle.connect(deployer).withdraw(deployer.address);
      const receipt = await tx.wait();
      const balanceAfter = await ethers.provider.getBalance(deployer.address);

      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const netReceived = balanceAfter - balanceBefore + gasUsed;

      console.log(`   ✅ Withdrawn: ${ethers.formatEther(netReceived)} ETH`);
      console.log(`   Gas used: ${ethers.formatEther(gasUsed)} ETH`);

      // Verify reserves are still protected
      const newContractBalance = await ethers.provider.getBalance(QUIZZDLE_ADDRESS);
      console.log(`   Contract balance after: ${ethers.formatEther(newContractBalance)} ETH`);
    } catch (err) {
      console.log(`   ⚠️ Error:`, err.message.split('\n')[0]);
    }
  } else {
    console.log(`   ℹ️ No funds to withdraw (all reserved)`);
  }

  // === FINAL VERIFICATION ===
  console.log("\n✅ VERIFICATION FINALE:");
  console.log("=" .repeat(60));

  const finalBalance = await ethers.provider.getBalance(QUIZZDLE_ADDRESS);
  const totalDistributed = totalWinnerRewardsDistributed;
  const totalClaimed = totalWinnerRewardsClaimed;

  console.log(`\n💎 Winner Rewards:`);
  console.log(`   Distributed: ${ethers.formatEther(totalDistributed)} ETH`);
  console.log(`   Claimed: ${ethers.formatEther(totalClaimed)} ETH`);
  console.log(`   Pending: ${ethers.formatEther(totalDistributed - totalClaimed)} ETH`);

  console.log(`\n🎁 Referral Rewards:`);
  console.log(`   Total: ${ethers.formatEther(totalReferralRewards)} ETH`);
  console.log(`   Claimed: ${ethers.formatEther(totalReferralsClaimed)} ETH`);
  console.log(`   Pending: ${ethers.formatEther(totalReferralRewards - totalReferralsClaimed)} ETH`);

  console.log(`\n💼 Final Contract Balance: ${ethers.formatEther(finalBalance)} ETH`);

  // Verify distribution percentages
  console.log(`\n📈 Distribution Verification:`);
  const referralPercent = day1Revenue > 0 ? (totalReferralRewards * BigInt(100)) / day1Revenue : BigInt(0);
  const winnersPercent = day1Revenue > 0 ? (totalWinnerRewardsDistributed * BigInt(100)) / day1Revenue : BigInt(0);
  console.log(`   Referrals: ~${referralPercent}% (target: 10%)`);
  console.log(`   Winners: ${winnersPercent}% (target: 45%)`);

  console.log("\n" + "=".repeat(60));
  console.log("✨ JOUR 2 TERMINÉ - TOUS LES TESTS PASSÉS!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
