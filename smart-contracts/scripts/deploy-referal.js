const { ethers } = require("hardhat");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Deploy QuizzdleReferal.
 *
 * Quizzdle's deploy.js reads NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS to wire
 * the referral contract via setReferralContract(). So this script must be
 * run FIRST, then .env.local updated with the printed address, then
 * deploy.js for Quizzdle.
 *
 * Usage:
 *   npx hardhat run smart-contracts/scripts/deploy-referal.js --network base-sepolia
 */
async function main() {
  console.log("🚀 DEPLOYING QUIZZDLE REFERAL");
  console.log("=".repeat(80));

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.0005")) {
    console.warn("⚠️  Low balance — deploy may fail.");
  }

  console.log("");
  console.log("📤 Sending deployment transaction…");

  const Referal = await ethers.getContractFactory("QuizzdleReferal");
  const referal = await Referal.deploy();
  await referal.waitForDeployment();
  const address = await referal.getAddress();

  console.log("");
  console.log("=".repeat(80));
  console.log("✅ QuizzdleReferal deployed!");
  console.log("=".repeat(80));
  console.log("📋 Address:", address);
  console.log("");
  console.log("📝 NEXT STEP — update .env.local:");
  console.log(`   NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS=${address}`);
  console.log("");
  console.log("Then redeploy Quizzdle so it picks up the new referal:");
  console.log("   npm run deploy:base-sepolia");
  console.log("=".repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
