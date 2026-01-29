const { ethers } = require("hardhat");

/**
 * Script de test Jour 1 - À lancer AUJOURD'HUI
 *
 * Ce script simule une journée d'activité réelle sur Base Sepolia:
 * - Plusieurs utilisateurs font des guesses
 * - Certains avec referral, d'autres sans
 * - Accumulation de revenus et victoires
 *
 * Usage: npx hardhat run scripts/test-day1-realtime.js --network base-sepolia
 */

async function main() {
  console.log("🎮 DAILYDLE - TEST JOUR 1 (Temps Réel)");
  console.log("=" .repeat(60));

  const signers = await ethers.getSigners();
  const deployer = signers[0];

  // Adresses des contrats (à ajuster selon votre déploiement)
  const QUIZZDLE_ADDRESS = process.env.QUIZZDLE_CONTRACT || "0xAbBa084847890fA88481687d75E8E6713CA7fEc6";
  const REFERRAL_ADDRESS = process.env.REFERRAL_CONTRACT || "0x1f5fdA23A0356dFb4c58A00D39692cBb1830BB78";

  console.log("\n📋 Configuration:");
  console.log("Quizzdle:", QUIZZDLE_ADDRESS);
  console.log("Referral:", REFERRAL_ADDRESS);
  console.log("Deployer:", deployer.address);
  console.log("Available signers:", signers.length);

  // Connect to contracts
  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const quizzdle = Quizzdle.attach(QUIZZDLE_ADDRESS);

  // Get current day
  const currentDay = await quizzdle.getCurrentDay();
  console.log(`\n📅 Current Day: ${currentDay}`);

  // Get fee per guess
  const feePerGuess = await quizzdle.feePerGuess();
  console.log(`💰 Fee per guess: ${ethers.formatEther(feePerGuess)} ETH`);

  // Get deployer balance
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`💼 Deployer Balance: ${ethers.formatEther(deployerBalance)} ETH`);

  // Check and create collections if needed
  console.log("\n🏗️ Checking collections...");
  const collectionCount = await quizzdle.getCollectionsCount();
  console.log(`  Current collections: ${collectionCount}`);

  if (collectionCount < BigInt(3)) {
    console.log("  Creating test collections...");

    // Create 3 collections if they don't exist
    for (let i = Number(collectionCount); i < 3; i++) {
      try {
        console.log(`  Creating collection ${i + 1}...`);
        const tx = await quizzdle.connect(deployer).createCollection(
          `Test Collection ${i + 1}`,
          `https://test.com/collection${i + 1}`,
          10 // 10 characters per collection
        );
        await tx.wait();
        console.log(`  ✅ Collection ${i + 1} created`);
      } catch (err) {
        console.log(`  ⚠️ Error creating collection:`, err.message.split('\n')[0]);
      }
    }
  } else {
    console.log("  ✅ Collections already exist");
  }

  // Get daily characters for collections 1, 2, 3
  console.log("\n🎯 Getting daily characters (owner only)...");
  const dailyChar1 = await quizzdle.getDailyCharacterId(1);
  const dailyChar2 = await quizzdle.getDailyCharacterId(2);
  const dailyChar3 = await quizzdle.getDailyCharacterId(3);

  console.log(`  Collection 1: Character ${dailyChar1}`);
  console.log(`  Collection 2: Character ${dailyChar2}`);
  console.log(`  Collection 3: Character ${dailyChar3}`);

  // === DEPLOYER: Makes multiple guesses ===
  console.log("\n👤 DEPLOYER: Making guesses on multiple collections...");

  // Collection 1: Try wrong, then win
  console.log("\n  📦 Collection 1:");
  try {
    const wrongChar = dailyChar1 === BigInt(1) ? BigInt(2) : BigInt(1);
    console.log(`    Trying wrong guess: ${wrongChar}...`);
    const tx1 = await quizzdle.connect(deployer).makeGuess(1, wrongChar, { value: feePerGuess });
    await tx1.wait();
    console.log(`    ❌ Wrong guess`);
  } catch (err) {
    console.log(`    ⚠️ ${err.message.split('\n')[0]}`);
  }

  try {
    console.log(`    Trying correct guess: ${dailyChar1}...`);
    const tx2 = await quizzdle.connect(deployer).makeGuess(1, dailyChar1, { value: feePerGuess });
    await tx2.wait();
    console.log(`    ✅ WIN!`);
  } catch (err) {
    console.log(`    ⚠️ ${err.message.split('\n')[0]}`);
  }

  // Collection 2: Win directly
  console.log("\n  📦 Collection 2:");
  try {
    console.log(`    Trying correct guess: ${dailyChar2}...`);
    const tx3 = await quizzdle.connect(deployer).makeGuess(2, dailyChar2, { value: feePerGuess });
    await tx3.wait();
    console.log(`    ✅ WIN!`);
  } catch (err) {
    console.log(`    ⚠️ ${err.message.split('\n')[0]}`);
  }

  // Collection 3: Try a few wrong guesses then win
  console.log("\n  📦 Collection 3:");
  try {
    const wrongChar1 = dailyChar3 === BigInt(1) ? BigInt(2) : BigInt(1);
    console.log(`    Trying wrong guess: ${wrongChar1}...`);
    const tx4 = await quizzdle.connect(deployer).makeGuess(3, wrongChar1, { value: feePerGuess });
    await tx4.wait();
    console.log(`    ❌ Wrong guess`);
  } catch (err) {
    console.log(`    ⚠️ ${err.message.split('\n')[0]}`);
  }

  try {
    const wrongChar2 = dailyChar3 === BigInt(3) ? BigInt(4) : BigInt(3);
    console.log(`    Trying wrong guess: ${wrongChar2}...`);
    const tx5 = await quizzdle.connect(deployer).makeGuess(3, wrongChar2, { value: feePerGuess });
    await tx5.wait();
    console.log(`    ❌ Wrong guess`);
  } catch (err) {
    console.log(`    ⚠️ ${err.message.split('\n')[0]}`);
  }

  try {
    console.log(`    Trying correct guess: ${dailyChar3}...`);
    const tx6 = await quizzdle.connect(deployer).makeGuess(3, dailyChar3, { value: feePerGuess });
    await tx6.wait();
    console.log(`    ✅ WIN!`);
  } catch (err) {
    console.log(`    ⚠️ ${err.message.split('\n')[0]}`);
  }

  // === STATS SUMMARY ===
  console.log("\n📊 DAY 1 SUMMARY:");
  console.log("=" .repeat(60));

  // Daily revenue
  const dailyRevenue = await quizzdle.dailyRevenue(currentDay);
  console.log(`💰 Daily Revenue: ${ethers.formatEther(dailyRevenue)} ETH`);

  // Total wins
  const totalWins = await quizzdle.totalWinsPerDay(currentDay);
  console.log(`🏆 Total Wins: ${totalWins}`);

  // Deployer wins
  const deployerWins = await quizzdle.getPlayerWinsForDay(deployer.address, currentDay);
  console.log(`\n👤 Deployer Wins: ${deployerWins}`);

  // Expected distribution calculation
  const expectedWinnersPool = (dailyRevenue * BigInt(45)) / BigInt(100);
  const expectedRewardPerWin = totalWins > 0 ? expectedWinnersPool / totalWins : BigInt(0);

  console.log(`\n📈 Expected Distribution (Tomorrow):`);
  console.log(`   Total Guesses Made: ${dailyRevenue / feePerGuess}`);
  console.log(`   Winners Pool (45%): ${ethers.formatEther(expectedWinnersPool)} ETH`);
  console.log(`   Reward per win: ${ethers.formatEther(expectedRewardPerWin)} ETH`);
  console.log(`   Deployer will get: ${ethers.formatEther(expectedRewardPerWin * deployerWins)} ETH`);

  // Contract balance
  const contractBalance = await ethers.provider.getBalance(QUIZZDLE_ADDRESS);
  console.log(`\n💼 Contract Balance: ${ethers.formatEther(contractBalance)} ETH`);

  // Check if day is finalized
  const isFinalized = await quizzdle.dayFinalized(currentDay);
  console.log(`\n✅ Day ${currentDay} finalized: ${isFinalized}`);

  console.log("\n" + "=".repeat(60));
  console.log("✨ JOUR 1 TERMINÉ!");
  console.log("🕐 Attendez 24h et lancez: npx hardhat run scripts/test-day2-realtime.js --network base-sepolia");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
