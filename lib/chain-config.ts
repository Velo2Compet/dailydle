import { base, baseSepolia } from "wagmi/chains";
import { fallback, http, type Chain, type Transport } from "viem";

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

// Public RPC (Coinbase, shared with every other app) — heavily rate-limited.
// Kept as the LAST-RESORT fallback when the primary endpoint 429s.
const PUBLIC_FALLBACK = IS_TESTNET
  ? "https://sepolia.base.org"
  : "https://mainnet.base.org";

// Primary RPC. Set NEXT_PUBLIC_RPC_URL in your Vercel env to your private
// endpoint (Alchemy, QuickNode, CDP, etc.) to escape the public-RPC limits.
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (IS_TESTNET
    ? process.env.BASE_SEPOLIA_RPC_URL || PUBLIC_FALLBACK
    : process.env.BASE_RPC_URL || PUBLIC_FALLBACK);

/**
 * Shared viem transport for every server-side `createPublicClient` in the
 * app. Uses `fallback` so a 429 / timeout on the primary RPC automatically
 * retries on the public RPC instead of bubbling up as a 5xx in our API
 * routes. If no private RPC is configured we skip the fallback wrapper to
 * avoid double-firing requests to the same rate-limited endpoint.
 */
export const APP_TRANSPORT: Transport =
  RPC_URL === PUBLIC_FALLBACK
    ? http(PUBLIC_FALLBACK)
    : fallback([http(RPC_URL), http(PUBLIC_FALLBACK)], {
        retryCount: 1,
        retryDelay: 200,
      });

// Export chain for wagmi config
export { base, baseSepolia };
