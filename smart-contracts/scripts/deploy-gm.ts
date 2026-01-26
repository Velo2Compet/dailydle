const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying GmQuizzdle with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const GmQuizzdle = await ethers.getContractFactory("GmQuizzdle");
  const gmQuizzdle = await GmQuizzdle.deploy();

  await gmQuizzdle.waitForDeployment();

  const address = await gmQuizzdle.getAddress();
  console.log("GmQuizzdle deployed to:", address);

  // Sauvegarder l'adresse pour le frontend
  console.log("\n✅ Add this to your .env.local file:");
  console.log(`NEXT_PUBLIC_GM_CONTRACT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
