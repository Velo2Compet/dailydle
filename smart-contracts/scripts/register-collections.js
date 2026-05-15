const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

/**
 * Script pour enregistrer les collections sur Quizzdle
 *
 * Le contrat salted stocke seulement si une collection existe (collectionExists[id])
 * Pas besoin des character IDs on-chain - ils sont gérés par l'API
 *
 * Usage: npx hardhat run smart-contracts/scripts/register-collections.js --network base-sepolia
 */

const NEXT_PUBLIC_QUIZZDLE_API_URL = process.env.NEXT_PUBLIC_QUIZZDLE_API_URL || "https://quizzdle.com";
const QUIZZDLE_API_KEY = process.env.QUIZZDLE_API_KEY;

const LANG = "en";
const PAGE_LIMIT = 50; // server cap

async function fetchPage(page) {
  const url = `${NEXT_PUBLIC_QUIZZDLE_API_URL}/api/public/categories?lang=${LANG}&limit=${PAGE_LIMIT}&page=${page}`;
  const response = await fetch(url, {
    headers: {
      "x-api-key": QUIZZDLE_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch categories (page ${page}): ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const items = data?.data ?? (Array.isArray(data) ? data : []);
  const pagination = data?.pagination ?? null;
  return { items: Array.isArray(items) ? items : [], pagination };
}

/**
 * Fetch the whole catalogue. The /categories endpoint is paginated and
 * capped at 50 per page server-side — the original version of this script
 * only read page 1, silently truncating to the first 20 (default limit).
 */
async function fetchCategories() {
  const first = await fetchPage(1);
  const totalPages = first.pagination?.total_pages ?? 1;
  if (totalPages <= 1) return first.items;

  const restUrls = [];
  for (let p = 2; p <= totalPages; p++) restUrls.push(p);
  const rest = await Promise.all(restUrls.map((p) => fetchPage(p)));
  return first.items.concat(...rest.map((r) => r.items));
}

async function main() {
  console.log("📝 REGISTER COLLECTIONS ON QUIZZDLE");
  console.log("=".repeat(60));

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

  const contract = await ethers.getContractAt("Quizzdle", contractAddress);

  // Fetch categories from API
  console.log("\n📥 Fetching categories from Quizzdle API...");
  const categories = await fetchCategories();
  console.log(`✅ Found ${categories.length} categories\n`);

  // Get all collection IDs
  const collectionIds = categories
    .filter(c => c.ids_personnages_list && c.ids_personnages_list.length > 0)
    .map(c => ({ id: c.id, name: c.name }));

  console.log(`📋 Processing ${collectionIds.length} collections\n`);
  console.log("=".repeat(60));

  let addedCount = 0;
  let existingCount = 0;
  let failCount = 0;

  for (let i = 0; i < collectionIds.length; i++) {
    const { id, name } = collectionIds[i];

    console.log(`\n[${i + 1}/${collectionIds.length}] Collection ${id}: ${name}`);

    try {
      // Check if collection already exists
      const exists = await contract.collectionExists(id);

      if (exists) {
        console.log(`   ✅ Already exists - skipping`);
        existingCount++;
        continue;
      }

      // Add collection
      console.log(`   ✨ Adding collection...`);
      const tx = await contract.addCollection(id);
      console.log(`   📤 TX: ${tx.hash}`);

      await tx.wait();
      console.log(`   ✅ Added!`);
      addedCount++;

      // Wait between transactions
      if (i < collectionIds.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }

    } catch (error) {
      console.error(`   ❌ Failed:`, error.message.split('\n')[0]);
      failCount++;
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));
  console.log(`✨ Collections added: ${addedCount}`);
  console.log(`✅ Already existed: ${existingCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📋 Total: ${collectionIds.length}`);

  if (failCount > 0) {
    console.log(`\n⚠️  Some collections failed. Re-run to retry.`);
  } else {
    console.log(`\n✅ All collections registered!`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
