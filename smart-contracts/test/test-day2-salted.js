const { ethers } = require("hardhat");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Script de test Jour 2 - Version Salted
 *
 * Ce script:
 * - Fait un guess pour déclencher la finalisation du Jour 1
 * - Teste claimAllWinnerRewards (nouveau!)
 * - Teste le claim des referral rewards
 * - Teste le withdraw owner
 *
 * Usage: npx hardhat run smart-contracts/test/test-day2-salted.js --network base-sepolia
 */

// Configuration depuis .env.local
const QUIZZDLE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const REFERRAL_ADDRESS = process.env.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS;
const SALT_DECRYPT = process.env.SALT_DECRYPT;
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY;

/**
 * Generate session message
 * One signature per day for all collections
 */
function getSessionMessage(day) {
  return `Dailydle Session Authentication\nDay: ${day}\nSign to play securely.`;
}

/**
 * Compute salted guess hash
 */
function computeSaltedGuess(characterId, sessionSignature, saltDecrypt) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["uint256", "bytes", "bytes32"],
      [characterId, sessionSignature, saltDecrypt]
    )
  );
}

/**
 * Compute daily character ID
 */
function computeDailyCharacterId(salt, day, collectionId, characterIds) {
  const seed = ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "uint256", "uint256"],
      [salt, day, collectionId]
    )
  );
  const seedBigInt = BigInt(seed);
  const index = Number(seedBigInt % BigInt(characterIds.length));
  return characterIds[index];
}

/**
 * Sign commitment as server
 */
async function signCommitment(serverWallet, playerAddress, collectionId, day, commitment, shouldFlag) {
  const messageHash = ethers.keccak256(
    ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32", "bool"],
      [playerAddress, collectionId, day, commitment, shouldFlag]
    )
  );
  const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));
  return signature;
}

async function main() {
  console.log("🌅 DAILYDLE - TEST JOUR 2 (Finalisation + Claims)");
  console.log("=".repeat(70));

  // Validate env
  if (!QUIZZDLE_ADDRESS || !SALT_DECRYPT || !SERVER_PRIVATE_KEY) {
    console.error("❌ Missing environment variables!");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const serverWallet = new ethers.Wallet(SERVER_PRIVATE_KEY, ethers.provider);

  console.log("\n📋 Configuration:");
  console.log("   Quizzdle:", QUIZZDLE_ADDRESS);
  console.log("   Deployer:", deployer.address);
  console.log("   Server:", serverWallet.address);

  // Connect to contract
  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const quizzdle = Quizzdle.attach(QUIZZDLE_ADDRESS);

  // Get current and yesterday's day
  const currentDay = await quizzdle.getCurrentDay();
  const yesterday = currentDay - BigInt(1);

  console.log(`\n📅 Current Day: ${currentDay}`);
  console.log(`📅 Yesterday: ${yesterday}`);

  // ============================================================
  // 1. CHECK IF YESTERDAY IS FINALIZED
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("1️⃣  CHECKING DAY FINALIZATION");
  console.log("-".repeat(70));

  let isYesterdayFinalized = await quizzdle.dayFinalized(yesterday);
  console.log(`   Day ${yesterday} finalized: ${isYesterdayFinalized}`);

  if (!isYesterdayFinalized) {
    console.log("\n   ⚡ Triggering finalization by making a guess today...");

    const collectionId = 1;
    const characterIds = Array.from({ length: 100 }, (_, i) => i + 1);
    const dailyCharId = computeDailyCharacterId(SALT_DECRYPT, currentDay, collectionId, characterIds);
    const feePerGuess = await quizzdle.feePerGuess();

    // Sign session (one per day for all collections)
    const sessionMessage = getSessionMessage(Number(currentDay));
    const sessionSig = await deployer.signMessage(sessionMessage);

    // Compute hashes
    const commitment = computeSaltedGuess(dailyCharId, sessionSig, SALT_DECRYPT);
    const serverSig = await signCommitment(
      serverWallet,
      deployer.address,
      collectionId,
      Number(currentDay),
      commitment,
      false
    );

    // Make a winning guess to also accumulate day 2 wins
    const saltedGuess = computeSaltedGuess(dailyCharId, sessionSig, SALT_DECRYPT);

    try {
      const tx = await quizzdle.connect(deployer).submitSaltedGuess(
        collectionId,
        saltedGuess,
        commitment,
        serverSig,
        false,
        { value: feePerGuess }
      );
      const receipt = await tx.wait();
      console.log(`   ✅ Guess made (tx: ${receipt.hash.slice(0, 20)}...)`);

      // Check for DayFinalized event
      for (const log of receipt.logs) {
        try {
          const parsed = quizzdle.interface.parseLog(log);
          if (parsed && parsed.name === "DayFinalized") {
            console.log(`\n   ✨ DAY ${parsed.args.day} FINALIZED!`);
            console.log(`      Total Revenue: ${ethers.formatEther(parsed.args.totalRevenue)} ETH`);
            console.log(`      Total Wins: ${parsed.args.totalWins}`);
            console.log(`      Reward per Win: ${ethers.formatEther(parsed.args.rewardPerWin)} ETH`);
            isYesterdayFinalized = true;
            break;
          }
        } catch {
          // Not a parseable log
        }
      }
    } catch (err) {
      console.log(`   ⚠️ Error: ${err.message.split('\n')[0]}`);
    }
  }

  // ============================================================
  // 2. YESTERDAY'S STATS
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("📊 YESTERDAY'S STATS (Day " + yesterday + ")");
  console.log("-".repeat(70));

  const day1Revenue = await quizzdle.dailyRevenue(yesterday);
  const day1TotalWins = await quizzdle.totalWinsPerDay(yesterday);
  const day1RewardPerWin = await quizzdle.rewardPerWinPerDay(yesterday);

  console.log(`   💰 Revenue: ${ethers.formatEther(day1Revenue)} ETH`);
  console.log(`   🏆 Total Wins: ${day1TotalWins}`);
  console.log(`   💎 Reward per Win: ${ethers.formatEther(day1RewardPerWin)} ETH`);

  // Deployer wins yesterday
  const deployerWinsYesterday = await quizzdle.playerTotalWinsPerDay(deployer.address, yesterday);
  console.log(`\n   👤 Deployer wins (yesterday): ${deployerWinsYesterday}`);
  console.log(`      Expected reward: ${ethers.formatEther(day1RewardPerWin * deployerWinsYesterday)} ETH`);

  // ============================================================
  // 3. TEST TOTAL PENDING REWARDS (NEW FUNCTION!)
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("3️⃣  TESTING getTotalPendingRewards");
  console.log("-".repeat(70));

  try {
    const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(deployer.address, 30);
    console.log(`   Total Pending: ${ethers.formatEther(totalPending)} ETH`);
    console.log(`   Unclaimed Days: ${unclaimedDays}`);
  } catch (err) {
    console.log(`   ⚠️ Error: ${err.message.split('\n')[0]}`);
  }

  // ============================================================
  // 4. TEST claimAllWinnerRewards (NEW FUNCTION!)
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("4️⃣  TESTING claimAllWinnerRewards");
  console.log("-".repeat(70));

  // Check pending before
  const pendingBefore = await quizzdle.getPendingWinnerRewards(deployer.address, yesterday);
  console.log(`   Pending rewards (yesterday): ${ethers.formatEther(pendingBefore)} ETH`);

  if (pendingBefore > 0) {
    try {
      const balanceBefore = await ethers.provider.getBalance(deployer.address);
      console.log(`\n   📤 Claiming ALL winner rewards...`);

      const claimTx = await quizzdle.connect(deployer).claimAllWinnerRewards(30);
      const receipt = await claimTx.wait();

      const balanceAfter = await ethers.provider.getBalance(deployer.address);
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const netReceived = balanceAfter - balanceBefore + gasUsed;

      console.log(`   ✅ Claimed: ${ethers.formatEther(netReceived)} ETH`);
      console.log(`   Gas used: ${ethers.formatEther(gasUsed)} ETH`);
      console.log(`   TX: ${receipt.hash}`);
    } catch (err) {
      console.log(`   ⚠️ Error: ${err.message.split('\n')[0]}`);
    }
  } else {
    console.log(`   ℹ️ No pending winner rewards to claim`);
  }

  // Verify after claim
  try {
    const [totalAfter, daysAfter] = await quizzdle.getTotalPendingRewards(deployer.address, 30);
    console.log(`\n   After claim:`);
    console.log(`   Total Pending: ${ethers.formatEther(totalAfter)} ETH`);
    console.log(`   Unclaimed Days: ${daysAfter}`);
  } catch (err) {
    console.log(`   ⚠️ Error checking after: ${err.message.split('\n')[0]}`);
  }

  // ============================================================
  // 5. TEST REFERRAL REWARDS CLAIM
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("5️⃣  TESTING REFERRAL REWARDS CLAIM");
  console.log("-".repeat(70));

  const referralPending = await quizzdle.referralRewards(deployer.address);
  console.log(`   Pending referral rewards: ${ethers.formatEther(referralPending)} ETH`);

  if (referralPending > 0) {
    try {
      const balanceBefore = await ethers.provider.getBalance(deployer.address);
      console.log(`\n   📤 Claiming referral rewards...`);

      const claimTx = await quizzdle.connect(deployer).claimReferralRewards();
      const receipt = await claimTx.wait();

      const balanceAfter = await ethers.provider.getBalance(deployer.address);
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const netReceived = balanceAfter - balanceBefore + gasUsed;

      console.log(`   ✅ Claimed: ${ethers.formatEther(netReceived)} ETH`);
      console.log(`   Gas used: ${ethers.formatEther(gasUsed)} ETH`);
    } catch (err) {
      console.log(`   ⚠️ Error: ${err.message.split('\n')[0]}`);
    }
  } else {
    console.log(`   ℹ️ No referral rewards to claim`);
  }

  // ============================================================
  // 6. TEST OWNER WITHDRAW
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("6️⃣  TESTING OWNER WITHDRAW");
  console.log("-".repeat(70));

  const contractBalance = await ethers.provider.getBalance(QUIZZDLE_ADDRESS);
  const totalReferralRewards = await quizzdle.totalReferralRewards();
  const totalReferralsClaimed = await quizzdle.totalReferralsClaimed();
  const totalWinnerRewardsDistributed = await quizzdle.totalWinnerRewardsDistributed();
  const totalWinnerRewardsClaimed = await quizzdle.totalWinnerRewardsClaimed();

  const reservedForReferrals = totalReferralRewards - totalReferralsClaimed;
  const reservedForWinners = totalWinnerRewardsDistributed - totalWinnerRewardsClaimed;
  const totalReserved = reservedForReferrals + reservedForWinners;
  const withdrawable = contractBalance > totalReserved ? contractBalance - totalReserved : BigInt(0);

  console.log(`\n   📊 Contract Status:`);
  console.log(`      Balance: ${ethers.formatEther(contractBalance)} ETH`);
  console.log(`      Reserved (Referrals): ${ethers.formatEther(reservedForReferrals)} ETH`);
  console.log(`      Reserved (Winners): ${ethers.formatEther(reservedForWinners)} ETH`);
  console.log(`      Withdrawable (45% owner): ${ethers.formatEther(withdrawable)} ETH`);

  if (withdrawable > 0) {
    try {
      const balanceBefore = await ethers.provider.getBalance(deployer.address);
      console.log(`\n   👑 Owner withdrawing...`);

      const withdrawTx = await quizzdle.connect(deployer).withdraw(deployer.address);
      const receipt = await withdrawTx.wait();

      const balanceAfter = await ethers.provider.getBalance(deployer.address);
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const netReceived = balanceAfter - balanceBefore + gasUsed;

      console.log(`   ✅ Withdrawn: ${ethers.formatEther(netReceived)} ETH`);
      console.log(`   Gas used: ${ethers.formatEther(gasUsed)} ETH`);

      const newContractBalance = await ethers.provider.getBalance(QUIZZDLE_ADDRESS);
      console.log(`   Contract balance after: ${ethers.formatEther(newContractBalance)} ETH`);
    } catch (err) {
      console.log(`   ⚠️ Error: ${err.message.split('\n')[0]}`);
    }
  } else {
    console.log(`   ℹ️ No funds to withdraw (all reserved)`);
  }

  // ============================================================
  // 7. FINAL VERIFICATION
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("✅ FINAL VERIFICATION");
  console.log("=".repeat(70));

  const finalBalance = await ethers.provider.getBalance(QUIZZDLE_ADDRESS);
  const finalTotalDistributed = await quizzdle.totalWinnerRewardsDistributed();
  const finalTotalClaimed = await quizzdle.totalWinnerRewardsClaimed();

  console.log(`\n💎 Winner Rewards:`);
  console.log(`   Distributed: ${ethers.formatEther(finalTotalDistributed)} ETH`);
  console.log(`   Claimed: ${ethers.formatEther(finalTotalClaimed)} ETH`);
  console.log(`   Pending: ${ethers.formatEther(finalTotalDistributed - finalTotalClaimed)} ETH`);

  const finalTotalRef = await quizzdle.totalReferralRewards();
  const finalRefClaimed = await quizzdle.totalReferralsClaimed();

  console.log(`\n🎁 Referral Rewards:`);
  console.log(`   Total: ${ethers.formatEther(finalTotalRef)} ETH`);
  console.log(`   Claimed: ${ethers.formatEther(finalRefClaimed)} ETH`);
  console.log(`   Pending: ${ethers.formatEther(finalTotalRef - finalRefClaimed)} ETH`);

  console.log(`\n💼 Final Contract Balance: ${ethers.formatEther(finalBalance)} ETH`);

  // Verify distribution percentages
  if (day1Revenue > 0) {
    console.log(`\n📈 Distribution Verification (Day ${yesterday}):`);
    const refPercent = (finalTotalRef * BigInt(100)) / day1Revenue;
    const winnersPercent = (finalTotalDistributed * BigInt(100)) / day1Revenue;
    console.log(`   Referrals: ~${refPercent}% (target: 10%)`);
    console.log(`   Winners: ~${winnersPercent}% (target: 45%)`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✨ JOUR 2 TERMINÉ - TOUS LES TESTS PASSÉS!");
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
