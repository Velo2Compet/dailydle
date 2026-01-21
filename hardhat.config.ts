import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Charger les variables d'environnement depuis .env et .env.local
// .env.local a la priorité sur .env
const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, ".env"))) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}
if (fs.existsSync(path.join(rootDir, ".env.local"))) {
  dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY 
        ? [process.env.PRIVATE_KEY.startsWith("0x") 
            ? process.env.PRIVATE_KEY 
            : `0x${process.env.PRIVATE_KEY}`]
        : [],
      chainId: 84532,
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY 
        ? [process.env.PRIVATE_KEY.startsWith("0x") 
            ? process.env.PRIVATE_KEY 
            : `0x${process.env.PRIVATE_KEY}`]
        : [],
      chainId: 8453,
    },
  },
  paths: {
    sources: "./smart-contracts",
    tests: "./smart-contracts/test",
    cache: "./smart-contracts/cache",
    artifacts: "./smart-contracts/artifacts",
  },
};

export default config;
