const { ethers } = require("hardhat");
const testCollections = require("../../data/test-collections.json");

/**
 * Script pour initialiser le contrat avec les données de test
 * Usage: npx hardhat run smart-contracts/scripts/initialize.js --network base-sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("Please set CONTRACT_ADDRESS environment variable");
    process.exit(1);
  }

  console.log("Initializing contract at:", contractAddress);
  console.log("Deployer:", deployer.address);

  const Dailydle = await ethers.getContractFactory("Dailydle");
  const dailydle = Dailydle.attach(contractAddress);

  // Fonction pour hasher les attributs d'un personnage
  function hashCharacter(character) {
    // Extraire les attributs (toutes les propriétés sauf id, name, imageUrl)
    const excludeKeys = ['id', 'name', 'imageUrl'];
    const attributes = {};
    
    for (const key in character) {
      if (!excludeKeys.includes(key)) {
        attributes[key] = character[key];
      }
    }
    
    if (!attributes || Object.keys(attributes).length === 0) {
      throw new Error(`Character ${character.name} has no attributes`);
    }
    
    const attributesString = Object.keys(attributes)
      .sort()
      .map((key) => {
        const value = attributes[key];
        if (Array.isArray(value)) {
          return `${key}:${value.sort().join(",")}`;
        }
        return `${key}:${value}`;
      })
      .join("|");
    
    return ethers.keccak256(ethers.toUtf8Bytes(attributesString));
  }

  // Fonction pour déterminer le personnage du jour
  function getDailyCharacter(collection) {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    );
    const seed = today.getFullYear() * 1000 + dayOfYear + collection.id * 10000;
    const characterIndex = seed % collection.characters.length;
    return collection.characters[characterIndex];
  }

  // Traiter chaque collection
  for (const collection of testCollections) {
    console.log(`\nCreating collection: ${collection.name}`);

    // Créer la collection (retourne juste un ID)
    console.log("Creating collection...");
    const createTx = await dailydle.createCollection({
      gasPrice: (await ethers.provider.getFeeData()).gasPrice,
    });
    const createReceipt = await createTx.wait();
    
    // Récupérer l'ID de la collection créée depuis l'event ou le compteur
    const collectionCount = await dailydle.collectionCount();
    const collectionId = Number(collectionCount);
    console.log(`Collection created with ID: ${collectionId}, tx: ${createTx.hash}, block: ${createReceipt.blockNumber}`);

    // Attendre un peu avant de continuer
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Ajouter les personnages
    for (const character of collection.characters) {
      const attributesHash = hashCharacter(character);
      console.log(`Adding character: ${character.name}...`);
      
      // Attendre un peu pour éviter les problèmes de nonce
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const addTx = await dailydle.addCharacter(
        collectionId,
        character.name,
        attributesHash,
        {
          gasPrice: (await ethers.provider.getFeeData()).gasPrice,
        }
      );
      
      // Attendre la confirmation
      const receipt = await addTx.wait();
      console.log(`Character ${character.name} added, tx: ${addTx.hash}, block: ${receipt.blockNumber}`);
      
      // Attendre un peu avant la prochaine transaction
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Plus besoin de mettre à jour le personnage du jour
    // Il est maintenant calculé on-chain de manière déterministe
    console.log(`Daily character will be calculated on-chain automatically`);
  }

  console.log("\n✅ Initialization complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
