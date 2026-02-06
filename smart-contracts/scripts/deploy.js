const { ethers } = require("hardhat");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Script de déploiement du contrat Quizzdle
 *
 * Ce contrat utilise un système de salage pour sécuriser les réponses:
 * - Les guesses sont hashés avec signature session + SALT_DECRYPT
 * - Impossible pour un observateur de décoder les réponses on-chain
 *
 * Usage: npx hardhat run smart-contracts/scripts/deploy.js --network base-sepolia
 */

async function main() {
  console.log("🚀 DEPLOYING QUIZZDLE CONTRACT");
  console.log("=".repeat(80));

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.005")) {
    console.warn("⚠️  Low balance! You might need more ETH for deployment.");
  }

  // Check for server private key (needed for server address)
  const serverPrivateKey = process.env.SERVER_PRIVATE_KEY;
  let serverAddress = deployer.address; // Default to deployer if no server key

  if (serverPrivateKey) {
    const serverWallet = new ethers.Wallet(serverPrivateKey);
    serverAddress = serverWallet.address;
    console.log("🖥️  Server address:", serverAddress);
  } else {
    console.log("⚠️  No SERVER_PRIVATE_KEY found, using deployer as server");
  }

  console.log("");

  // =============================================================================
  // 1. Deploy Quizzdle Contract
  // =============================================================================
  console.log("1️⃣  DEPLOYING QUIZZDLE CONTRACT");
  console.log("-".repeat(80));

  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  console.log("   📤 Sending deployment transaction...");

  const quizzdleSalted = await Quizzdle.deploy();
  await quizzdleSalted.waitForDeployment();
  const saltedAddress = await quizzdleSalted.getAddress();

  console.log("   ✅ Quizzdle Contract deployed!");
  console.log("   📋 Address:", saltedAddress);
  console.log("");

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // =============================================================================
  // 2. Set Server Address (if different from deployer)
  // =============================================================================
  if (serverAddress !== deployer.address) {
    console.log("2️⃣  SETTING SERVER ADDRESS");
    console.log("-".repeat(80));

    console.log("   🖥️  Server address:", serverAddress);
    console.log("   📤 Sending setServer transaction...");

    try {
      const feeData = await ethers.provider.getFeeData();
      const serverTx = await quizzdleSalted.setServer(serverAddress, {
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      });

      console.log("   ⏳ Waiting for confirmation...");
      const serverReceipt = await serverTx.wait();

      console.log("   ✅ Server set successfully!");
      console.log("   🔗 TX:", serverTx.hash);
      console.log("   📦 Block:", serverReceipt.blockNumber);
    } catch (error) {
      console.error("   ❌ Failed to set server:", error.message);
      console.error("   ⚠️  You'll need to set it manually later");
    }

    console.log("");
  }

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // =============================================================================
  // 3. Set Referral Contract (if configured)
  // =============================================================================
  const referralAddress = process.env.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS;
  if (referralAddress && referralAddress !== "0x0000000000000000000000000000000000000000") {
    console.log("3️⃣  SETTING REFERRAL CONTRACT");
    console.log("-".repeat(80));

    console.log("   🤝 Referral address:", referralAddress);
    console.log("   📤 Sending setReferralContract transaction...");

    try {
      const feeData = await ethers.provider.getFeeData();
      const refTx = await quizzdleSalted.setReferralContract(referralAddress, {
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
  }

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // =============================================================================
  // 4. Add Collections
  // =============================================================================
  console.log("4️⃣  ADDING COLLECTIONS");
  console.log("-".repeat(80));

  // Add common collection IDs (1-10)
  const collectionIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  for (const collectionId of collectionIds) {
    try {
      const feeData = await ethers.provider.getFeeData();
      const tx = await quizzdleSalted.addCollection(collectionId, {
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      });
      await tx.wait();
      console.log(`   ✅ Collection ${collectionId} added`);
    } catch (error) {
      console.log(`   ⚠️  Collection ${collectionId} failed: ${error.message}`);
    }
  }

  console.log("");

  // =============================================================================
  // SUMMARY & NEXT STEPS
  // =============================================================================
  console.log("=".repeat(80));
  console.log("✅ DEPLOYMENT COMPLETE!");
  console.log("=".repeat(80));
  console.log("");
  console.log("📋 DEPLOYED CONTRACT:");
  console.log("-".repeat(80));
  console.log("   Quizzdle Contract:", saltedAddress);
  console.log("");
  console.log("📝 UPDATE YOUR .env.local FILE:");
  console.log("-".repeat(80));
  console.log(`   NEXT_PUBLIC_CONTRACT_ADDRESS=${saltedAddress}`);
  console.log("");
  console.log("🔐 SECURITY REQUIREMENTS:");
  console.log("-".repeat(80));
  console.log("   1. Make sure SALT_DECRYPT is set in .env.local (server-side only!)");
  console.log("   2. Make sure SERVER_PRIVATE_KEY is set for session initialization");
  console.log("   3. The server address needs ETH to pay gas for initializeSession calls");
  console.log("");
  console.log("🎮 TEST THE DEPLOYMENT:");
  console.log("-".repeat(80));
  console.log("   1. Start the app: npm run dev");
  console.log("   2. Connect wallet and try to play a game");
  console.log("   3. Check events on BaseScan - you should only see salted hashes!");
  console.log("");
  console.log("=".repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
