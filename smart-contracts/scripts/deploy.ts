const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const quizzdle = await Quizzdle.deploy();

  await quizzdle.waitForDeployment();

  const address = await quizzdle.getAddress();
  console.log("Quizzdle deployed to:", address);

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
