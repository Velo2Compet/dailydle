const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

/**
 * Script de déploiement complet de tous les smart contracts
 *
 * Déploie dans l'ordre:
 * 1. GM Contract
 * 2. Referral Contract
 * 3. Quizzdle Contract (principal)
 * 4. Configure le salt
 * 5. Configure le referral contract
 *
 * Usage: npx hardhat run smart-contracts/scripts/deploy-all.js --network base-sepolia
 */

async function main() {
  console.log("🚀 DEPLOYING ALL SMART CONTRACTS");
  console.log("=" .repeat(80));

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.01")) {
    console.warn("⚠️  Low balance! You might need more ETH for deployment.");
  }

  const saltDecrypt = process.env.SALT_DECRYPT;
  if (!saltDecrypt) {
    console.error("❌ SALT_DECRYPT not set in .env.local");
    console.error("   Please set a secure random salt value");
    process.exit(1);
  }

  console.log("🔑 Salt configured:", saltDecrypt.substring(0, 10) + "...");
  console.log("");

  // =============================================================================
  // 1. Deploy GM Contract
  // =============================================================================
  console.log("1️⃣  DEPLOYING GM CONTRACT");
  console.log("-".repeat(80));

  const GmQuizzdle = await ethers.getContractFactory("GmQuizzdle");
  console.log("   📤 Sending deployment transaction...");

  const gmQuizzdle = await GmQuizzdle.deploy();
  await gmQuizzdle.waitForDeployment();
  const gmAddress = await gmQuizzdle.getAddress();

  console.log("   ✅ GM Contract deployed!");
  console.log("   📋 Address:", gmAddress);
  console.log("");

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // =============================================================================
  // 2. Deploy Referral Contract
  // =============================================================================
  console.log("2️⃣  DEPLOYING REFERRAL CONTRACT");
  console.log("-".repeat(80));

  const QuizzdleReferal = await ethers.getContractFactory("QuizzdleReferal");
  console.log("   📤 Sending deployment transaction...");

  const referral = await QuizzdleReferal.deploy();
  await referral.waitForDeployment();
  const referralAddress = await referral.getAddress();

  console.log("   ✅ Referral Contract deployed!");
  console.log("   📋 Address:", referralAddress);
  console.log("");

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // =============================================================================
  // 3. Deploy Quizzdle Contract (Main)
  // =============================================================================
  console.log("3️⃣  DEPLOYING QUIZZDLE CONTRACT (MAIN)");
  console.log("-".repeat(80));

  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  console.log("   📤 Sending deployment transaction...");

  const quizzdle = await Quizzdle.deploy();
  await quizzdle.waitForDeployment();
  const quizzdleAddress = await quizzdle.getAddress();

  console.log("   ✅ Quizzdle Contract deployed!");
  console.log("   📋 Address:", quizzdleAddress);
  console.log("");

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // =============================================================================
  // 4. Set Salt on Quizzdle Contract
  // =============================================================================
  console.log("4️⃣  SETTING SALT");
  console.log("-".repeat(80));

  let saltBytes;
  if (saltDecrypt.startsWith("0x")) {
    saltBytes = saltDecrypt;
  } else {
    saltBytes = ethers.encodeBytes32String(saltDecrypt);
  }

  console.log("   🔑 Salt bytes:", saltBytes);
  console.log("   📤 Sending setSalt transaction...");

  try {
    const feeData = await ethers.provider.getFeeData();
    const saltTx = await quizzdle.setSalt(saltBytes, {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });

    console.log("   ⏳ Waiting for confirmation...");
    const saltReceipt = await saltTx.wait();

    console.log("   ✅ Salt set successfully!");
    console.log("   🔗 TX:", saltTx.hash);
    console.log("   📦 Block:", saltReceipt.blockNumber);
  } catch (error) {
    console.error("   ❌ Failed to set salt:", error.message);
    console.error("   ⚠️  You'll need to set it manually later");
  }

  console.log("");

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // =============================================================================
  // 5. Set Referral Contract on Quizzdle
  // =============================================================================
  console.log("5️⃣  SETTING REFERRAL CONTRACT");
  console.log("-".repeat(80));

  console.log("   🤝 Referral address:", referralAddress);
  console.log("   📤 Sending setReferralContract transaction...");

  try {
    const feeData = await ethers.provider.getFeeData();
    const refTx = await quizzdle.setReferralContract(referralAddress, {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });

    console.log("   ⏳ Waiting for confirmation...");
    const refReceipt = await refTx.wait();

    console.log("   ✅ Referral contract set!");
    console.log("   🔗 TX:", refTx.hash);
    console.log("   📦 Block:", refReceipt.blockNumber);
  } catch (error) {
    console.error("   ❌ Failed to set referral contract:", error.message);
    console.error("   ⚠️  You'll need to set it manually later");
  }

  console.log("");

  // =============================================================================
  // SUMMARY & NEXT STEPS
  // =============================================================================
  console.log("=" .repeat(80));
  console.log("✅ DEPLOYMENT COMPLETE!");
  console.log("=" .repeat(80));
  console.log("");
  console.log("📋 DEPLOYED CONTRACTS:");
  console.log("-".repeat(80));
  console.log("   GM Contract:       ", gmAddress);
  console.log("   Referral Contract: ", referralAddress);
  console.log("   Quizzdle Contract: ", quizzdleAddress);
  console.log("");
  console.log("📝 UPDATE YOUR .env.local FILE:");
  console.log("-".repeat(80));
  console.log(`   NEXT_PUBLIC_GM_CONTRACT_ADDRESS=${gmAddress}`);
  console.log(`   NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS=${referralAddress}`);
  console.log(`   NEXT_PUBLIC_CONTRACT_ADDRESS=${quizzdleAddress}`);
  console.log("");
  console.log("🔄 NEXT STEPS:");
  console.log("-".repeat(80));
  console.log("   1. Update .env.local with the addresses above");
  console.log("   2. Run: npx hardhat run smart-contracts/scripts/register-collections.js --network base-sepolia");
  console.log("   3. Verify deployment: npx hardhat run smart-contracts/scripts/check-contract-status.js --network base-sepolia");
  console.log("");
  console.log("🎮 OPTIONAL:");
  console.log("-".repeat(80));
  console.log("   - Debug daily character: npx hardhat run smart-contracts/scripts/debug-daily-character.js --network base-sepolia");
  console.log("   - Test referral rewards: npm test -- test/IntegratedRewards.test.ts");
  console.log("");
  console.log("=" .repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
