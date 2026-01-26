const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying GmDailydle with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const GmDailydle = await ethers.getContractFactory("GmDailydle");
  const gmDailydle = await GmDailydle.deploy();

  await gmDailydle.waitForDeployment();

  const address = await gmDailydle.getAddress();
  console.log("GmDailydle deployed to:", address);

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
