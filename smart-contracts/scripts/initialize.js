const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

/**
 * Script pour initialiser/mettre à jour le contrat avec les données de l'API Quizzdle
 * Usage: npx hardhat run smart-contracts/scripts/initialize.js --network base-sepolia
 *
 * Variables d'environnement requises:
 * - NEXT_PUBLIC_CONTRACT_ADDRESS: adresse du contrat déployé
 * - QUIZZDLE_API_KEY: clé API Quizzdle
 * - QUIZZDLE_API_URL: URL de base de l'API (par défaut: https://quizzdle.fr)
 */

const QUIZZDLE_API_URL = process.env.QUIZZDLE_API_URL || "https://quizzdle.fr";
const QUIZZDLE_API_KEY = process.env.QUIZZDLE_API_KEY;

/**
 * Récupère toutes les catégories depuis l'API Quizzdle
 * Format de réponse: { success: true, data: [...] }
 * Chaque catégorie contient ids_personnages_list avec les IDs des personnages
 */
async function fetchCategories() {
  const response = await fetch(`${QUIZZDLE_API_URL}/api/public/categories`, {
    headers: {
      "x-api-key": QUIZZDLE_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Format: { success: true, data: [...] }
  const raw = data?.data ?? (Array.isArray(data) ? data : []);
  return Array.isArray(raw) ? raw : [];
}

async function main() {
  // Vérifications des variables d'environnement
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("❌ Please set NEXT_PUBLIC_CONTRACT_ADDRESS environment variable");
    process.exit(1);
  }

  if (!QUIZZDLE_API_KEY) {
    console.error("❌ Please set QUIZZDLE_API_KEY environment variable in .env.local");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("🚀 Initializing contract at:", contractAddress);
  console.log("👤 Deployer:", deployer.address);
  console.log("🌐 Quizzdle API URL:", QUIZZDLE_API_URL);

  const Dailydle = await ethers.getContractFactory("Dailydle");
  const dailydle = Dailydle.attach(contractAddress);

  // Récupérer toutes les catégories depuis l'API
  console.log("\n📥 Fetching categories from Quizzdle API...");
  let categories;
  try {
    categories = await fetchCategories();
    if (!Array.isArray(categories) || categories.length === 0) {
      console.error("❌ No categories found or invalid response format");
      console.log("   Response:", JSON.stringify(categories).slice(0, 500));
      process.exit(1);
    }
    console.log(`✅ Found ${categories.length} categories`);
  } catch (error) {
    console.error("❌ Failed to fetch categories:", error.message);
    process.exit(1);
  }

  // Préparer les données pour updateMultipleCollections
  const collectionIds = [];
  const characterIdsArrays = [];

  for (const category of categories) {
    console.log(`\n📂 Processing category: ${category.name} (ID: ${category.id})`);

    // Les IDs des personnages sont directement dans ids_personnages_list
    const characterIdsList = category.ids_personnages_list;

    if (!characterIdsList || !Array.isArray(characterIdsList) || characterIdsList.length === 0) {
      console.log(`⚠️  Category ${category.name} has no characters, skipping...`);
      continue;
    }

    // Les IDs sont directement des nombres dans le tableau
    const characterIds = characterIdsList.map(id => BigInt(id));

    console.log(`   Found ${characterIds.length} characters`);

    collectionIds.push(BigInt(category.id));
    characterIdsArrays.push(characterIds);
  }

  if (collectionIds.length === 0) {
    console.error("❌ No valid categories found to register");
    process.exit(1);
  }

  // Enregistrer les collections dans le smart contract
  console.log(`\n📝 Registering ${collectionIds.length} collections in smart contract...`);
  console.log("   Collection IDs:", collectionIds.map(id => Number(id)).join(", "));

  try {
    // Utiliser updateMultipleCollections pour tout enregistrer en une seule transaction
    const tx = await dailydle.updateMultipleCollections(
      collectionIds,
      characterIdsArrays,
      {
        gasPrice: (await ethers.provider.getFeeData()).gasPrice,
      }
    );

    console.log("⏳ Waiting for transaction confirmation...");
    const receipt = await tx.wait();

    console.log(`\n✅ Transaction confirmed!`);
    console.log(`   TX Hash: ${tx.hash}`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
  } catch (error) {
    console.error("❌ Failed to register collections:", error.message);

    // Si la transaction en batch échoue, essayer une par une
    console.log("\n🔄 Trying to register collections one by one...");

    for (let i = 0; i < collectionIds.length; i++) {
      const collectionId = collectionIds[i];
      const characterIds = characterIdsArrays[i];

      try {
        console.log(`\n   Registering collection ${Number(collectionId)}...`);

        const tx = await dailydle.updateCollectionCharacterIds(
          collectionId,
          characterIds,
          {
            gasPrice: (await ethers.provider.getFeeData()).gasPrice,
          }
        );

        const receipt = await tx.wait();
        console.log(`   ✅ Collection ${Number(collectionId)} registered (tx: ${tx.hash})`);

        // Attendre entre chaque transaction
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (err) {
        console.error(`   ❌ Failed to register collection ${Number(collectionId)}:`, err.message);
      }
    }
  }

  // Afficher un résumé
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));

  for (let i = 0; i < collectionIds.length; i++) {
    const collectionId = Number(collectionIds[i]);
    const characterCount = characterIdsArrays[i].length;
    const categoryName = categories.find(c => c.id === collectionId)?.name || "Unknown";
    console.log(`   Collection ${collectionId} (${categoryName}): ${characterCount} characters`);
  }

  console.log("\n✅ Initialization complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
