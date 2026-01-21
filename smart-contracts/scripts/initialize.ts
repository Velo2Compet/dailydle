const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Lire le fichier JSON depuis la racine du projet
const testCollectionsPath = path.join(process.cwd(), "data", "test-collections.json");
const testCollections = JSON.parse(fs.readFileSync(testCollectionsPath, "utf-8"));

/**
 * Script pour initialiser le contrat avec les données de test
 * Usage: npx hardhat run scripts/initialize.ts --network base-sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("Please set NEXT_PUBLIC_CONTRACT_ADDRESS or CONTRACT_ADDRESS environment variable");
    process.exit(1);
  }

  console.log("Initializing contract at:", contractAddress);
  console.log("Deployer:", deployer.address);

  const Dailydle = await ethers.getContractFactory("Dailydle");
  const dailydle = Dailydle.attach(contractAddress);

  // Préparer les données pour updateMultipleCollections
  const collectionIds: number[] = [];
  const characterIdsArrays: number[][] = [];

  // Traiter chaque collection
  for (const collection of testCollections) {
    console.log(`\nPreparing collection: ${collection.name} (ID: ${collection.id})`);

    // Extraire les IDs des personnages
    const characterIds = collection.characters.map((char: any) => char.id);
    collectionIds.push(collection.id);
    characterIdsArrays.push(characterIds);

    console.log(`  - ${characterIds.length} characters prepared`);
  }

  // Mettre à jour toutes les collections en une seule transaction
  console.log(`\nUpdating ${collectionIds.length} collections...`);
  const updateTx = await dailydle.updateMultipleCollections(collectionIds, characterIdsArrays);
  const receipt = await updateTx.wait();
  console.log(`✅ All collections updated, tx: ${updateTx.hash}, block: ${receipt.blockNumber}`);

  // Attendre un peu pour que la transaction soit propagée
  console.log("\nWaiting for transaction to be propagated...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Vérifier que les collections existent
  console.log("\nVerifying collections...");
  for (const collectionId of collectionIds) {
    const exists = await dailydle.collectionExists(collectionId);
    const characterIds = await dailydle.getCollectionCharacterIds(collectionId);
    console.log(`Collection ${collectionId}: exists=${exists}, characterCount=${characterIds.length}`);
    
    if (!exists || characterIds.length === 0) {
      console.error(`⚠️  WARNING: Collection ${collectionId} verification failed!`);
      console.error(`   This might be a timing issue. Try checking again in a few seconds.`);
    }
  }

  console.log("\n✅ Initialization complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
