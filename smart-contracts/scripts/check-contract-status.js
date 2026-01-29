const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

/**
 * Script pour vérifier l'état du contrat
 * Usage: npx hardhat run smart-contracts/scripts/check-contract-status.js --network base-sepolia
 */

async function main() {
  console.log("🔍 CONTRACT STATUS");
  console.log("=" .repeat(60));

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const referralAddress = process.env.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("❌ NEXT_PUBLIC_CONTRACT_ADDRESS not set");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log("📋 Contract:", contractAddress);

  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const dailydle = Quizzdle.attach(contractAddress);

  // 1. Check owner
  console.log("\n1️⃣ Owner:");
  const owner = await dailydle.owner();
  console.log("   ", owner);
  console.log("   ", owner.toLowerCase() === deployer.address.toLowerCase() ? "✅ You are the owner" : "❌ You are NOT the owner");

  // 2. Check salt (cannot be read because it's private - this is good for security)
  console.log("\n2️⃣ Salt:");
  console.log("   ℹ️  Salt is private (cannot be read from outside)");
  console.log("   This is normal and secure.");
  console.log("   You set it with: npx hardhat run smart-contracts/scripts/set-salt-only.js");
  console.log("   Transaction: 0xae1f4fca4f10bb8dc1aebfd274ad2c889b65a7f20f2a7eb79d7bbd345467a8ab");

  // 3. Check referral contract
  console.log("\n3️⃣ Referral Contract:");
  const referralContract = await dailydle.referralContract();
  console.log("   ", referralContract);
  if (referralContract === "0x0000000000000000000000000000000000000000") {
    console.log("   ⚠️  Referral contract not set");
  } else if (referralAddress && referralContract.toLowerCase() === referralAddress.toLowerCase()) {
    console.log("   ✅ Matches NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS");
  } else {
    console.log("   ⚠️  Does not match NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS");
    if (referralAddress) {
      console.log("   Expected:", referralAddress);
    }
  }

  // 4. Check fee per guess
  console.log("\n4️⃣ Fee per guess:");
  const feePerGuess = await dailydle.feePerGuess();
  console.log("   ", ethers.formatEther(feePerGuess), "ETH");

  // 5. Check collections
  console.log("\n5️⃣ Collections:");
  const collectionIds = [1, 4, 5, 29, 30, 31, 32, 34, 37, 38, 40, 41, 44, 46, 48, 55, 56, 57, 58];
  let registeredCount = 0;
  let notRegisteredCount = 0;

  for (const id of collectionIds) {
    try {
      const characterIds = await dailydle.getCollectionCharacterIds(BigInt(id));
      if (characterIds.length > 0) {
        console.log(`   ✅ Collection ${id}: ${characterIds.length} characters`);
        registeredCount++;
      } else {
        console.log(`   ❌ Collection ${id}: Not registered`);
        notRegisteredCount++;
      }
    } catch (error) {
      console.log(`   ❌ Collection ${id}: Error -`, error.message.split('\n')[0]);
      notRegisteredCount++;
    }
  }

  console.log(`\n   Total: ${registeredCount}/${collectionIds.length} registered`);

  if (notRegisteredCount > 0) {
    console.log(`\n   ⚠️  ${notRegisteredCount} collections need to be registered`);
    console.log(`   Run: npx hardhat run smart-contracts/scripts/register-collections-safe.js --network base-sepolia`);
  }

  // 6. Check contract balance
  console.log("\n6️⃣ Contract Balance:");
  const balance = await ethers.provider.getBalance(contractAddress);
  console.log("   ", ethers.formatEther(balance), "ETH");

  console.log("\n" + "=" .repeat(60));
  console.log("✅ STATUS CHECK COMPLETE");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
