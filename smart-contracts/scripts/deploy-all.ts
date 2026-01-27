const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying all contracts with:", deployer.address);
  console.log("Balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy Quizzdle
  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const quizzdle = await Quizzdle.deploy();
  await quizzdle.waitForDeployment();
  await quizzdle.deploymentTransaction().wait(2);
  const quizzdleAddress = await quizzdle.getAddress();
  console.log("Quizzdle deployed to:", quizzdleAddress);

  // Deploy GmQuizzdle
  const GmQuizzdle = await ethers.getContractFactory("GmQuizzdle");
  const gmQuizzdle = await GmQuizzdle.deploy();
  await gmQuizzdle.waitForDeployment();
  await gmQuizzdle.deploymentTransaction().wait(2);
  const gmAddress = await gmQuizzdle.getAddress();
  console.log("GmQuizzdle deployed to:", gmAddress);

  // Deploy QuizzdleReferal
  const QuizzdleReferal = await ethers.getContractFactory("QuizzdleReferal");
  const referal = await QuizzdleReferal.deploy();
  await referal.waitForDeployment();
  await referal.deploymentTransaction().wait(2);
  const referalAddress = await referal.getAddress();
  console.log("QuizzdleReferal deployed to:", referalAddress);

  // Output .env format
  console.log("\n--- Copy to .env.local ---\n");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${quizzdleAddress}`);
  console.log(`NEXT_PUBLIC_GM_CONTRACT_ADDRESS=${gmAddress}`);
  console.log(`NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS=${referalAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
