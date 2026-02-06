const { ethers } = require("hardhat");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const NEW_SERVER = "0x2Cd0E2e2A1E9d2C3072506487a681B1Dd544e201";

  const [deployer] = await ethers.getSigners();
  console.log("Owner:", deployer.address);

  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const contract = Quizzdle.attach(CONTRACT);

  const currentServer = await contract.server();
  console.log("Current server:", currentServer);
  console.log("New server:", NEW_SERVER);

  console.log("\nUpdating server address...");
  const tx = await contract.setServer(NEW_SERVER);
  await tx.wait();

  const updatedServer = await contract.server();
  console.log("✅ Server updated to:", updatedServer);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
