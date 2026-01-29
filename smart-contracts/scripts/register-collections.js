const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

/**
 * Script intelligent pour gérer les collections
 *
 * Fonctionnalités:
 * - Enregistre les nouvelles collections
 * - Détecte automatiquement les changements (ajout/suppression de personnages)
 * - Met à jour les collections modifiées
 * - Skip les collections inchangées
 * - Gère correctement les nonces et les erreurs
 * - Peut être relancé sans problème
 *
 * Usage: npx hardhat run smart-contracts/scripts/register-collections.js --network base-sepolia
 */

const NEXT_PUBLIC_QUIZZDLE_API_URL = process.env.NEXT_PUBLIC_QUIZZDLE_API_URL || "https://quizzdle.fr";
const QUIZZDLE_API_KEY = process.env.QUIZZDLE_API_KEY;

async function fetchCategories() {
  const response = await fetch(`${NEXT_PUBLIC_QUIZZDLE_API_URL}/api/public/categories`, {
    headers: {
      "x-api-key": QUIZZDLE_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const raw = data?.data ?? (Array.isArray(data) ? data : []);
  return Array.isArray(raw) ? raw : [];
}

function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;

  // Convert BigInts to numbers and sort for comparison
  const a1 = arr1.map(x => Number(x)).sort((a, b) => a - b);
  const a2 = arr2.map(x => Number(x)).sort((a, b) => a - b);

  for (let i = 0; i < a1.length; i++) {
    if (a1[i] !== a2[i]) return false;
  }

  return true;
}

async function main() {
  console.log("📝 REGISTER & UPDATE COLLECTIONS");
  console.log("=" .repeat(60));

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("❌ Please set NEXT_PUBLIC_CONTRACT_ADDRESS");
    process.exit(1);
  }

  if (!QUIZZDLE_API_KEY) {
    console.error("❌ Please set QUIZZDLE_API_KEY");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log("📋 Contract:", contractAddress);

  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const dailydle = Quizzdle.attach(contractAddress).connect(deployer);

  // Fetch categories
  console.log("\n📥 Fetching categories from Quizzdle API...");
  const categories = await fetchCategories();
  console.log(`✅ Found ${categories.length} categories\n`);

  // Prepare collections data
  const collections = [];
  for (const category of categories) {
    const characterIdsList = category.ids_personnages_list;
    if (!characterIdsList || !Array.isArray(characterIdsList) || characterIdsList.length === 0) {
      console.log(`⚠️  Skipping ${category.name} (no characters)`);
      continue;
    }

    const characterIds = characterIdsList.map(id => BigInt(id));
    collections.push({
      id: BigInt(category.id),
      name: category.name,
      characterIds,
    });
  }

  console.log(`📋 Processing ${collections.length} collections\n`);
  console.log("=" .repeat(60));

  // Register/Update collections one by one with proper waiting
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let failCount = 0;

  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    const collectionNum = Number(collection.id);

    console.log(`\n[${i + 1}/${collections.length}] Collection ${collectionNum}: ${collection.name}`);
    console.log(`   📊 API: ${collection.characterIds.length} characters`);

    try {
      // Get existing IDs from contract
      const existingIds = await dailydle.getCollectionCharacterIds(collection.id);

      let needsUpdate = false;
      let isNew = false;

      if (existingIds.length === 0) {
        // New collection
        console.log(`   ✨ NEW - needs registration`);
        needsUpdate = true;
        isNew = true;
      } else {
        // Existing collection - check for changes
        console.log(`   📦 Contract: ${existingIds.length} characters`);

        const hasChanges = !arraysEqual(existingIds, collection.characterIds);

        if (!hasChanges) {
          console.log(`   ✅ No changes - skipping`);
          unchangedCount++;
        } else {
          console.log(`   🔄 Changes detected - needs update`);
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        // Get fresh fee data
        const feeData = await ethers.provider.getFeeData();

        // Send transaction (let ethers.js manage the nonce automatically)
        console.log(`   🚀 Sending transaction...`);
        const tx = await dailydle.updateCollectionCharacterIds(
          collection.id,
          collection.characterIds,
          {
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            // No manual nonce - let ethers.js handle it
          }
        );

        console.log(`   📤 TX: ${tx.hash}`);
        console.log(`   ⏳ Waiting for confirmation...`);

        // Wait for confirmation with timeout
        const receipt = await tx.wait(1, 60000); // 1 confirmation, 60s timeout

        console.log(`   ✅ ${isNew ? 'Registered' : 'Updated'} in block ${receipt.blockNumber}`);
        console.log(`   ⛽ Gas used: ${receipt.gasUsed.toString()}`);

        if (isNew) {
          newCount++;
        } else {
          updatedCount++;
        }
      }

      // Wait 3 seconds before next transaction to ensure nonce is updated
      if (needsUpdate && i < collections.length - 1) {
        console.log(`   ⏸️  Waiting 3 seconds before next transaction...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

    } catch (error) {
      console.error(`   ❌ Failed:`, error.message.split('\n')[0]);
      failCount++;

      // Wait 5 seconds after any error
      console.log(`   ⏸️  Waiting 5 seconds before continuing...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Summary
  console.log("\n" + "=" .repeat(60));
  console.log("📊 SUMMARY");
  console.log("=" .repeat(60));
  console.log(`✨ New collections registered: ${newCount}`);
  console.log(`🔄 Collections updated: ${updatedCount}`);
  console.log(`✅ Collections unchanged: ${unchangedCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📋 Total: ${collections.length}`);

  if (failCount > 0) {
    console.log(`\n⚠️  Some collections failed. You can re-run this script to retry.`);
  } else if (newCount > 0 || updatedCount > 0) {
    console.log(`\n✅ All changes applied successfully!`);
  } else {
    console.log(`\n✅ All collections are up to date!`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
