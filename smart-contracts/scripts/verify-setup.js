const { ethers, network } = require("hardhat");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Post-deploy sanity check. Reads the contract state and prints whether
 * everything is wired correctly. Idempotent and read-only.
 *
 *   npx hardhat run smart-contracts/scripts/verify-setup.js --network base-sepolia
 */
async function main() {
  console.log("");
  console.log("=".repeat(72));
  console.log(`🔍 VERIFY SETUP — ${network.name}`);
  console.log("=".repeat(72));

  const main_ = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const refer = process.env.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS;
  const gm = process.env.NEXT_PUBLIC_GM_CONTRACT_ADDRESS;
  const expectedServer = process.env.SERVER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.SERVER_PRIVATE_KEY).address
    : null;

  console.log(`Main:    ${main_}`);
  console.log(`Referal: ${refer}`);
  console.log(`Gm:      ${gm}`);
  console.log("");

  const quizzdle = await ethers.getContractAt("Quizzdle", main_);

  // ---- Code present? ----
  const code = await ethers.provider.getCode(main_);
  if (code === "0x") {
    console.log("❌ Main: no contract code at this address.");
    process.exit(1);
  }
  console.log("✅ Main contract code present.");

  // ---- Owner ----
  const owner = await quizzdle.owner();
  console.log(`👤 owner:           ${owner}`);

  // ---- Server ----
  const server = await quizzdle.server();
  console.log(`🖥️  server:          ${server}`);
  if (expectedServer && server.toLowerCase() !== expectedServer.toLowerCase()) {
    console.log(`   ⚠️  expected server ${expectedServer} — server is NOT the SERVER_PRIVATE_KEY signer!`);
  } else if (expectedServer) {
    console.log("   ✅ matches SERVER_PRIVATE_KEY");
  }

  // ---- Referral ----
  const ref = await quizzdle.referralContract();
  console.log(`🤝 referralContract: ${ref}`);
  if (refer && ref.toLowerCase() !== refer.toLowerCase()) {
    console.log(`   ⚠️  expected ${refer} — referral NOT wired correctly!`);
  } else if (refer) {
    console.log("   ✅ matches .env.local NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS");
  }

  // ---- Fee ----
  const fee = await quizzdle.feePerGuess();
  console.log(`💰 feePerGuess:      ${fee} wei (${ethers.formatEther(fee)} ETH)`);

  // ---- Collections (fetch from API and check each) ----
  const QUIZZDLE_API_URL = process.env.NEXT_PUBLIC_QUIZZDLE_API_URL || "https://quizzdle.com";
  const QUIZZDLE_API_KEY = process.env.QUIZZDLE_API_KEY;

  async function fetchPage(page) {
    const url = `${QUIZZDLE_API_URL}/api/public/categories?lang=en&limit=50&page=${page}`;
    const res = await fetch(url, {
      headers: { "x-api-key": QUIZZDLE_API_KEY, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`API page ${page}: ${res.status}`);
    return res.json();
  }

  const first = await fetchPage(1);
  const total = first.pagination?.total_pages ?? 1;
  const categories = [...(first.data ?? [])];
  for (let p = 2; p <= total; p++) {
    const page = await fetchPage(p);
    categories.push(...(page.data ?? []));
  }
  console.log("");
  console.log(`📦 Checking ${categories.length} collections on-chain…`);

  let ok = 0;
  const missing = [];
  for (const cat of categories) {
    const exists = await quizzdle.collectionExists(cat.id);
    if (exists) ok++;
    else missing.push(cat);
  }
  console.log(`   ${ok}/${categories.length} registered`);
  if (missing.length > 0) {
    console.log("   ❌ Missing:");
    missing.forEach((c) => console.log(`      - ${c.id} (${c.name})`));
  } else {
    console.log("   ✅ All registered");
  }

  // ---- Referral contract sanity ----
  if (refer) {
    const refCode = await ethers.provider.getCode(refer);
    if (refCode === "0x") {
      console.log("");
      console.log("❌ Referal contract has NO code at the referenced address.");
    } else {
      console.log("");
      console.log("✅ Referal contract has code.");
    }
  }

  // ---- GM contract sanity ----
  if (gm) {
    const gmCode = await ethers.provider.getCode(gm);
    if (gmCode === "0x") {
      console.log("❌ Gm contract has NO code at the referenced address.");
    } else {
      console.log("✅ Gm contract has code.");
    }
  }

  console.log("");
  console.log("=".repeat(72));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
