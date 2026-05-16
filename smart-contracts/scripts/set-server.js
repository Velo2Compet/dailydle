const { ethers } = require("hardhat");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Sync the on-chain server address with whatever SERVER_PRIVATE_KEY points
 * to in .env.local. Used after rotate-secrets.js to migrate a deployed
 * contract to a freshly-generated server signing key, or any time the
 * server wallet is rotated.
 *
 * Idempotent: if the on-chain server already matches, prints and exits 0.
 *
 *   npx hardhat run smart-contracts/scripts/set-server.js --network base
 *   npx hardhat run smart-contracts/scripts/set-server.js --network base-sepolia
 */
async function main() {
  const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const SERVER_KEY = process.env.SERVER_PRIVATE_KEY;

  if (!CONTRACT) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS missing in .env.local");
  if (!SERVER_KEY) throw new Error("SERVER_PRIVATE_KEY missing in .env.local");

  const newServerAddress = new ethers.Wallet(SERVER_KEY).address;

  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(72));
  console.log("🔄 SET SERVER ADDRESS");
  console.log("=".repeat(72));
  console.log("Owner (signer):", deployer.address);
  console.log("Contract:      ", CONTRACT);

  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const contract = Quizzdle.attach(CONTRACT);

  const currentServer = await contract.server();
  console.log("Current server:", currentServer);
  console.log("Target server: ", newServerAddress);

  if (currentServer.toLowerCase() === newServerAddress.toLowerCase()) {
    console.log("");
    console.log("✅ Already in sync — nothing to do.");
    return;
  }

  console.log("");
  console.log("📤 Sending setServer transaction…");
  const tx = await contract.setServer(newServerAddress);
  console.log("⏳ tx:", tx.hash);
  await tx.wait();

  // Retry the post-tx read: Base public RPCs (sepolia + mainnet) commonly
  // serve stale state for a few seconds after a write lands. Without this
  // retry, the script would throw a false-positive "expected X, got Y" even
  // though the tx mined successfully.
  let updated = await contract.server();
  for (let i = 0; updated.toLowerCase() !== newServerAddress.toLowerCase() && i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    updated = await contract.server();
  }
  if (updated.toLowerCase() !== newServerAddress.toLowerCase()) {
    throw new Error(
      `setServer tx ${tx.hash} mined but on-chain server still reads ${updated} after retries — possible re-org or RPC issue, please verify on the explorer.`
    );
  }
  console.log("✅ Server updated to:", updated);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
