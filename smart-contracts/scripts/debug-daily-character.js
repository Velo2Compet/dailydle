const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

/**
 * Script de debug pour comprendre pourquoi c'est toujours le même personnage
 * Usage: npx hardhat run smart-contracts/scripts/debug-daily-character.js --network base-sepolia
 */

async function main() {
  console.log("🔍 DEBUG DAILY CHARACTER");
  console.log("=" .repeat(60));

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const saltDecrypt = process.env.SALT_DECRYPT;
  const collectionId = 1; // League of Legends

  if (!contractAddress || !saltDecrypt) {
    console.error("❌ Missing environment variables");
    process.exit(1);
  }

  console.log("📋 Contract:", contractAddress);
  console.log("🔑 Salt:", saltDecrypt);
  console.log("📦 Collection ID:", collectionId);

  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const dailydle = Quizzdle.attach(contractAddress);

  // 1. Get character IDs from contract
  console.log("\n1️⃣ Getting character IDs from contract...");
  const characterIds = await dailydle.getCollectionCharacterIds(BigInt(collectionId));
  console.log(`   Total characters: ${characterIds.length}`);

  if (characterIds.length === 0) {
    console.error("   ❌ No characters in collection!");
    process.exit(1);
  }

  // Show first 10 and last 10 IDs
  console.log(`   First 10 IDs: [${characterIds.slice(0, 10).map(id => Number(id)).join(", ")}]`);
  if (characterIds.length > 10) {
    console.log(`   Last 10 IDs: [${characterIds.slice(-10).map(id => Number(id)).join(", ")}]`);
  }

  // 2. Calculate current day
  const currentDay = BigInt(Math.floor(Date.now() / 1000 / 86400));
  console.log(`\n2️⃣ Current day: ${currentDay}`);

  // 3. Calculate seed (same as contract)
  console.log("\n3️⃣ Calculating seed...");

  // Convert salt to bytes32 if it's a string
  let saltBytes;
  if (saltDecrypt.startsWith("0x")) {
    saltBytes = saltDecrypt;
  } else {
    saltBytes = ethers.encodeBytes32String(saltDecrypt);
  }

  console.log(`   Salt (bytes32): ${saltBytes}`);
  console.log(`   Current day: ${currentDay}`);
  console.log(`   Collection ID: ${collectionId}`);

  const packed = ethers.solidityPacked(
    ["bytes32", "uint256", "uint256"],
    [saltBytes, currentDay, BigInt(collectionId)]
  );
  console.log(`   Packed: ${packed}`);

  const seed = ethers.keccak256(packed);
  console.log(`   Seed (hash): ${seed}`);

  const seedBigInt = BigInt(seed);
  console.log(`   Seed (number): ${seedBigInt.toString()}`);

  // 4. Calculate index
  console.log("\n4️⃣ Calculating index...");
  const characterIndex = Number(seedBigInt % BigInt(characterIds.length));
  console.log(`   Index: ${characterIndex} (seed % ${characterIds.length})`);

  // 5. Get daily character
  const dailyCharacterId = Number(characterIds[characterIndex]);
  console.log(`\n5️⃣ Daily character:`);
  console.log(`   Character ID at index ${characterIndex}: ${dailyCharacterId}`);

  // 6. Compare with different days
  console.log(`\n6️⃣ Testing different days (to see if it varies):`);
  for (let offset = -2; offset <= 2; offset++) {
    const testDay = currentDay + BigInt(offset);
    const testPacked = ethers.solidityPacked(
      ["bytes32", "uint256", "uint256"],
      [saltBytes, testDay, BigInt(collectionId)]
    );
    const testSeed = BigInt(ethers.keccak256(testPacked));
    const testIndex = Number(testSeed % BigInt(characterIds.length));
    const testCharId = Number(characterIds[testIndex]);

    const label = offset === 0 ? "TODAY" : offset > 0 ? `+${offset} days` : `${offset} days`;
    console.log(`   ${label.padEnd(10)}: Day ${testDay} → Index ${testIndex} → Character ID ${testCharId}`);
  }

  // 7. Find where ID 99 is in the array
  console.log(`\n7️⃣ Finding Character ID 99 in the array...`);
  const indices99 = [];
  characterIds.forEach((id, index) => {
    if (Number(id) === 99) {
      indices99.push(index);
    }
  });

  if (indices99.length > 0) {
    console.log(`   ✅ Found ID 99 at index(es): [${indices99.join(", ")}]`);
    console.log(`   Current calculated index: ${characterIndex}`);
    if (indices99.includes(characterIndex)) {
      console.log(`   ⚠️  YES! Current index ${characterIndex} points to ID 99`);
    } else {
      console.log(`   ℹ️  Current index ${characterIndex} does NOT point to ID 99`);
      console.log(`   Current index points to ID: ${dailyCharacterId}`);
    }
  } else {
    console.log(`   ℹ️  ID 99 not found in the character IDs array`);
  }

  console.log("\n" + "=" .repeat(60));
  console.log("✅ DEBUG COMPLETE");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
