import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, parseAbi, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { APP_CHAIN, APP_TRANSPORT } from "@/lib/chain-config";

// Contract configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY as `0x${string}`;
const ADMIN_SECRET = process.env.ADMIN_SECRET; // Secret key for admin API calls

// ABI for flagging wallets
const flagWalletAbi = parseAbi([
  "function flagWallet(address _wallet, string calldata _reason) external",
  "function unflagWallet(address _wallet) external",
  "function isWalletFlagged(address _wallet) external view returns (bool flagged, string memory reason)",
]);

const publicClient = createPublicClient({
  chain: APP_CHAIN,
  transport: APP_TRANSPORT,
});

/**
 * POST /api/flag-wallet
 *
 * Flag a wallet for multi-wallet abuse (server call, requires admin secret)
 *
 * Body:
 * - walletAddress: string (address to flag)
 * - reason: string (reason for flagging)
 * - adminSecret: string (admin authentication)
 *
 * Response:
 * - success: boolean
 * - txHash?: string (transaction hash)
 * - error?: string
 */
export async function POST(request: NextRequest) {
  try {
    // Validate environment variables
    if (!CONTRACT_ADDRESS || !SERVER_PRIVATE_KEY || !ADMIN_SECRET) {
      console.error("Missing environment variables for flag-wallet");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { walletAddress, reason, adminSecret } = body;

    // Validate admin secret
    if (!adminSecret || adminSecret !== ADMIN_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Validate inputs
    if (!walletAddress || typeof walletAddress !== "string" || !isAddress(walletAddress)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    if (!reason || typeof reason !== "string" || reason.length === 0 || reason.length > 200) {
      return NextResponse.json(
        { error: "Reason is required (1–200 chars)" },
        { status: 400 }
      );
    }

    // Check if wallet is already flagged
    const [isFlagged] = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: flagWalletAbi,
      functionName: "isWalletFlagged",
      args: [walletAddress as `0x${string}`],
    }) as [boolean, string];

    if (isFlagged) {
      return NextResponse.json(
        { error: "Wallet is already flagged" },
        { status: 400 }
      );
    }

    // Create wallet client for transaction
    const account = privateKeyToAccount(SERVER_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: APP_CHAIN,
      transport: APP_TRANSPORT,
    });

    // Submit flag transaction
    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: flagWalletAbi,
      functionName: "flagWallet",
      args: [walletAddress as `0x${string}`, reason],
    });

    console.log(`[FLAG-WALLET] Flagged ${walletAddress} - Reason: ${reason} - TX: ${txHash}`);

    return NextResponse.json({
      success: true,
      txHash,
      walletAddress,
      reason,
    });
  } catch (error) {
    console.error("Flag wallet error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/flag-wallet?address=0x...
 *
 * Check if a wallet is flagged
 *
 * Response:
 * - flagged: boolean
 * - reason?: string
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get("address");

    if (!walletAddress || !isAddress(walletAddress)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const [flagged, reason] = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: flagWalletAbi,
      functionName: "isWalletFlagged",
      args: [walletAddress as `0x${string}`],
    }) as [boolean, string];

    return NextResponse.json({
      flagged,
      reason: flagged ? reason : undefined,
    });
  } catch (error) {
    console.error("Check flagged wallet error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
