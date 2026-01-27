const { ethers } = require("hardhat");

async function main() {
  const signers = await ethers.getSigners();
  
  if (signers.length === 0) {
    console.error("❌ No signers found!");
    console.error("Please make sure:");
    console.error("1. You have created a .env file in the root directory");
    console.error("2. You have set PRIVATE_KEY in your .env file");
    console.error("3. Your PRIVATE_KEY is correct (without 0x prefix)");
    process.exit(1);
  }

  const [deployer] = signers;

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const Dailydle = await ethers.getContractFactory("Quizzdle");
  const dailydle = await Dailydle.deploy();

  await dailydle.waitForDeployment();

  const address = await dailydle.getAddress();
  console.log("Dailydle deployed to:", address);

  // Sauvegarder l'adresse pour le frontend
  console.log("\nAdd this to your .env.local file:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
