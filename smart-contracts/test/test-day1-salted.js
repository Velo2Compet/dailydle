const { ethers } = require("hardhat");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Script de test Jour 1 - Version Salted
 *
 * Ce script simule une journée d'activité avec le système de hash salté:
 * - Déployer crée le code referral "caca"
 * - Test wallet s'inscrit avec ce code
 * - Les deux joueurs font des guesses
 * - Owner ajoute un bonus à la pool du jour
 *
 * Usage: npx hardhat run smart-contracts/test/test-day1-salted.js --network base-sepolia
 */

// Configuration depuis .env.local
const QUIZZDLE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const REFERRAL_ADDRESS = process.env.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS;
const SALT_DECRYPT = process.env.SALT_DECRYPT;
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY;

/**
 * Generate session message (same as frontend)
 * One signature per day for all collections
 */
function getSessionMessage(day) {
  return `Quizzdle Onchain Session Authentication\nDay: ${day}\nSign to play securely.`;
}

/**
 * Compute salted guess hash
 * saltedGuess = keccak256(characterId, sessionSignature, SALT_DECRYPT)
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
 * Compute daily character ID using deterministic seed
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
 * messageHash = keccak256(player, collectionId, currentDay, commitment, shouldFlag)
 */
async function signCommitment(serverWallet, playerAddress, collectionId, day, commitment, shouldFlag) {
  const messageHash = ethers.keccak256(
    ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32", "bool"],
      [playerAddress, collectionId, day, commitment, shouldFlag]
    )
  );

  // Sign with Ethereum prefix
  const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));
  return signature;
}

async function main() {
  console.log("🎮 Quizzdle Onchain - TEST JOUR 1 (Système Salted)");
  console.log("=".repeat(70));

  // Validate env
  if (!QUIZZDLE_ADDRESS || !REFERRAL_ADDRESS || !SALT_DECRYPT || !SERVER_PRIVATE_KEY) {
    console.error("❌ Missing environment variables!");
    console.error("   Required: NEXT_PUBLIC_CONTRACT_ADDRESS, NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS, SALT_DECRYPT, SERVER_PRIVATE_KEY");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const deployer = signers[0];

  // Create server wallet from private key
  const serverWallet = new ethers.Wallet(SERVER_PRIVATE_KEY, ethers.provider);

  console.log("\n📋 Configuration:");
  console.log("   Quizzdle:", QUIZZDLE_ADDRESS);
  console.log("   Referral:", REFERRAL_ADDRESS);
  console.log("   Deployer:", deployer.address);
  console.log("   Server:", serverWallet.address);
  console.log("   SALT_DECRYPT:", SALT_DECRYPT.slice(0, 10) + "...");

  // Get deployer balance
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`   Balance: ${ethers.formatEther(deployerBalance)} ETH`);

  // Connect to contracts
  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const quizzdle = Quizzdle.attach(QUIZZDLE_ADDRESS);

  const QuizzdleReferal = await ethers.getContractFactory("QuizzdleReferal");
  const referral = QuizzdleReferal.attach(REFERRAL_ADDRESS);

  // Get current day
  const currentDay = await quizzdle.getCurrentDay();
  const feePerGuess = await quizzdle.feePerGuess();

  console.log(`\n📅 Current Day: ${currentDay}`);
  console.log(`💰 Fee per guess: ${ethers.formatEther(feePerGuess)} ETH`);

  // ============================================================
  // 1. SETUP REFERRAL CODE "caca"
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("1️⃣  SETTING UP REFERRAL CODE 'caca'");
  console.log("-".repeat(70));

  // Check if deployer already has a code
  const existingCode = await referral.addressToCode(deployer.address);
  if (existingCode === "caca") {
    console.log("   ✅ Referral code 'caca' already set for deployer");
  } else {
    try {
      console.log("   📤 Setting referral code 'caca'...");
      const tx = await referral.connect(deployer).setReferralCode("caca");
      await tx.wait();
      console.log("   ✅ Referral code 'caca' created!");
    } catch (err) {
      console.log("   ⚠️ Error:", err.message.split('\n')[0]);
    }
  }

  // Verify code is set
  const codeOwner = await referral.codeToAddress("caca");
  console.log(`   Code owner: ${codeOwner}`);

  // ============================================================
  // 2. CREATE TEST WALLET AND REGISTER WITH REFERRAL
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("2️⃣  CREATING TEST WALLET WITH REFERRAL");
  console.log("-".repeat(70));

  // Create a deterministic test wallet
  const testWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  console.log(`   Test wallet: ${testWallet.address}`);

  // Send minimal ETH to test wallet (0.0005 ETH = ~500 guesses at 1 gwei)
  const fundAmount = ethers.parseEther("0.0005");
  console.log(`   Sending ${ethers.formatEther(fundAmount)} ETH to test wallet...`);

  try {
    const fundTx = await deployer.sendTransaction({
      to: testWallet.address,
      value: fundAmount,
    });
    await fundTx.wait();
    console.log("   ✅ Test wallet funded");
  } catch (err) {
    console.log("   ⚠️ Fund error:", err.message.split('\n')[0]);
  }

  // Check if test wallet already registered
  const isRegistered = await referral.hasRegistered(testWallet.address);
  if (!isRegistered) {
    try {
      console.log("   📤 Registering with referral code 'caca'...");
      const regTx = await referral.connect(testWallet).registerWithReferral("caca");
      await regTx.wait();
      console.log("   ✅ Registered with referral!");
    } catch (err) {
      console.log("   ⚠️ Registration error:", err.message.split('\n')[0]);
    }
  } else {
    console.log("   ℹ️ Test wallet already registered");
  }

  // Verify referral link
  const referrer = await referral.referredBy(testWallet.address);
  console.log(`   Referred by: ${referrer}`);

  // ============================================================
  // 3. SIMULATE GAMES - DEPLOYER PLAYS AND WINS
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("3️⃣  DEPLOYER PLAYING (Collection 1)");
  console.log("-".repeat(70));

  const collectionId = 1;

  // Character IDs for collection 1 (use range 1-100 for testing)
  const characterIds = Array.from({ length: 100 }, (_, i) => i + 1);

  // Compute daily character for collection 1
  const dailyCharId = computeDailyCharacterId(SALT_DECRYPT, currentDay, collectionId, characterIds);
  console.log(`   🎯 Daily character ID (secret): ${dailyCharId}`);

  // --- DEPLOYER: Make some guesses ---
  console.log("\n   👤 Deployer making guesses...");

  // Sign session message (one per day for all collections)
  const sessionMessage = getSessionMessage(Number(currentDay));
  const deployerSessionSig = await deployer.signMessage(sessionMessage);
  console.log(`   Session signature: ${deployerSessionSig.slice(0, 20)}...`);

  // Commitment (correct answer hash)
  const commitment = computeSaltedGuess(dailyCharId, deployerSessionSig, SALT_DECRYPT);
  console.log(`   Commitment: ${commitment.slice(0, 20)}...`);

  // Server signs the commitment
  const serverSig = await signCommitment(
    serverWallet,
    deployer.address,
    collectionId,
    Number(currentDay),
    commitment,
    false // shouldFlag
  );
  console.log(`   Server signature: ${serverSig.slice(0, 20)}...`);

  // Make a WRONG guess first
  const wrongGuessId = dailyCharId === 1 ? 2 : 1;
  const wrongSaltedGuess = computeSaltedGuess(wrongGuessId, deployerSessionSig, SALT_DECRYPT);

  try {
    console.log(`\n   ❌ Trying wrong guess (char ${wrongGuessId})...`);
    const wrongTx = await quizzdle.connect(deployer).submitSaltedGuess(
      collectionId,
      wrongSaltedGuess,
      commitment,
      serverSig,
      false, // shouldFlag
      { value: feePerGuess }
    );
    const wrongReceipt = await wrongTx.wait();
    console.log(`      TX: ${wrongReceipt.hash}`);
  } catch (err) {
    console.log(`      ⚠️ ${err.message.split('\n')[0]}`);
  }

  // Make the CORRECT guess
  const correctSaltedGuess = computeSaltedGuess(dailyCharId, deployerSessionSig, SALT_DECRYPT);

  try {
    console.log(`\n   ✅ Trying correct guess (char ${dailyCharId})...`);
    const correctTx = await quizzdle.connect(deployer).submitSaltedGuess(
      collectionId,
      correctSaltedGuess,
      commitment,
      serverSig,
      false,
      { value: feePerGuess }
    );
    const correctReceipt = await correctTx.wait();
    console.log(`      TX: ${correctReceipt.hash}`);
    console.log(`      🎉 WIN!`);
  } catch (err) {
    console.log(`      ⚠️ ${err.message.split('\n')[0]}`);
  }

  // ============================================================
  // 4. TEST WALLET PLAYS (WITH REFERRAL)
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("4️⃣  TEST WALLET PLAYING (With Referral)");
  console.log("-".repeat(70));

  // Sign session for test wallet
  const testSessionSig = await testWallet.signMessage(sessionMessage);
  console.log(`   Session signature: ${testSessionSig.slice(0, 20)}...`);

  // Commitment for test wallet (same daily character, different session)
  const testCommitment = computeSaltedGuess(dailyCharId, testSessionSig, SALT_DECRYPT);

  // Server signs for test wallet
  const testServerSig = await signCommitment(
    serverWallet,
    testWallet.address,
    collectionId,
    Number(currentDay),
    testCommitment,
    false
  );

  // Test wallet makes correct guess
  const testCorrectGuess = computeSaltedGuess(dailyCharId, testSessionSig, SALT_DECRYPT);

  try {
    console.log(`   ✅ Test wallet guessing correctly (char ${dailyCharId})...`);
    const testTx = await quizzdle.connect(testWallet).submitSaltedGuess(
      collectionId,
      testCorrectGuess,
      testCommitment,
      testServerSig,
      false,
      { value: feePerGuess }
    );
    const testReceipt = await testTx.wait();
    console.log(`      TX: ${testReceipt.hash}`);
    console.log(`      🎉 WIN!`);
  } catch (err) {
    console.log(`      ⚠️ ${err.message.split('\n')[0]}`);
  }

  // ============================================================
  // 5. OWNER ADDS BONUS TO TODAY'S POOL (SKIPPED - Manual)
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("5️⃣  OWNER BONUS - SKIPPED (à faire manuellement via l'UI)");
  console.log("-".repeat(70));

  // ============================================================
  // 6. FINAL STATS
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("📊 DAY 1 SUMMARY");
  console.log("=".repeat(70));

  // Daily stats
  const dailyRevenue = await quizzdle.dailyRevenue(currentDay);
  const totalWins = await quizzdle.totalWinsPerDay(currentDay);
  const isFinalized = await quizzdle.dayFinalized(currentDay);

  console.log(`\n💰 Daily Revenue: ${ethers.formatEther(dailyRevenue)} ETH`);
  console.log(`🏆 Total Wins: ${totalWins}`);
  console.log(`📅 Day Finalized: ${isFinalized}`);

  // Player wins
  const deployerWins = await quizzdle.playerTotalWinsPerDay(deployer.address, currentDay);
  const testWalletWins = await quizzdle.playerTotalWinsPerDay(testWallet.address, currentDay);

  console.log(`\n👥 Wins Today:`);
  console.log(`   Deployer: ${deployerWins}`);
  console.log(`   Test Wallet: ${testWalletWins}`);

  // Referral rewards
  const referralRewards = await quizzdle.referralRewards(deployer.address);
  console.log(`\n🎁 Referral Rewards (deployer): ${ethers.formatEther(referralRewards)} ETH`);

  // Expected distribution
  const winnersPool = (dailyRevenue * BigInt(45)) / BigInt(100);
  const expectedRewardPerWin = totalWins > 0 ? winnersPool / totalWins : BigInt(0);

  console.log(`\n📈 Expected Distribution (Tomorrow):`);
  console.log(`   Winners Pool (45%): ${ethers.formatEther(winnersPool)} ETH`);
  console.log(`   Reward per win: ${ethers.formatEther(expectedRewardPerWin)} ETH`);
  console.log(`   Deployer expected: ${ethers.formatEther(expectedRewardPerWin * deployerWins)} ETH`);

  // Contract balance
  const contractBalance = await ethers.provider.getBalance(QUIZZDLE_ADDRESS);
  console.log(`\n💼 Contract Balance: ${ethers.formatEther(contractBalance)} ETH`);

  // Save test wallet for day 2
  console.log("\n" + "=".repeat(70));
  console.log("📝 SAVE THESE FOR DAY 2:");
  console.log("-".repeat(70));
  console.log(`   Test Wallet Address: ${testWallet.address}`);
  console.log(`   Test Wallet Private Key: ${testWallet.privateKey}`);

  console.log("\n" + "=".repeat(70));
  console.log("✨ JOUR 1 TERMINÉ!");
  console.log("🕐 Attendez 24h puis lancez:");
  console.log("   npx hardhat run smart-contracts/test/test-day2-salted.js --network base-sepolia");
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
