import { base, baseSepolia } from "wagmi/chains";
import type { Chain } from "viem";

/**
 * Chain configuration based on environment variable
 *
 * Set NEXT_PUBLIC_CHAIN_ID in .env.local:
 * - 84532 = Base Sepolia (testnet)
 * - 8453 = Base (mainnet)
 */

const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532", 10);

// Map of supported chains
const SUPPORTED_CHAINS: Record<number, Chain> = {
  84532: baseSepolia,
  8453: base,
};

// Get the active chain based on env
export const APP_CHAIN: Chain = SUPPORTED_CHAINS[CHAIN_ID] || baseSepolia;
export const APP_CHAIN_ID = APP_CHAIN.id;

// Helper to check if we're on testnet
export const IS_TESTNET = APP_CHAIN_ID === baseSepolia.id;

// RPC URL (uses env or chain default)
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ||
  (IS_TESTNET
    ? (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org")
    : (process.env.BASE_RPC_URL || "https://mainnet.base.org")
  );

// Export chain for wagmi config
export { base, baseSepolia };
