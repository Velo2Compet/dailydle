const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying QuizzdleReferal with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const QuizzdleReferal = await ethers.getContractFactory("QuizzdleReferal");
  const referal = await QuizzdleReferal.deploy();

  await referal.waitForDeployment();

  const address = await referal.getAddress();
  console.log("QuizzdleReferal deployed to:", address);

  // Save the address for the frontend
  console.log("\n✅ Add this to your .env.local file:");
  console.log(`NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
