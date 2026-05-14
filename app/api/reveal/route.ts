import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  parseAbi,
  parseEventLogs,
  isAddress,
  isHash,
} from "viem";
import { APP_CHAIN, RPC_URL } from "@/lib/chain-config";
import {
  getPendingReveal,
  markRevealedFirstTime,
  decrementInflight,
} from "@/lib/pending-reveals";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

const saltedGuessMadeAbi = parseAbi([
  "event SaltedGuessMade(address indexed player, uint256 indexed collectionId, bytes32 saltedHash, bool isCorrect, uint256 attempts)",
]);

const publicClient = createPublicClient({
  chain: APP_CHAIN,
  transport: http(RPC_URL),
});

/**
 * POST /api/reveal
 *
 * Phase 2 of the 2-phase guess flow. Releases the per-attribute
 * `comparisons` (and the daily character if the player won) only after
 * verifying via RPC that:
 *   1. the tx is mined and succeeded,
 *   2. it came from the claimed player,
 *   3. it targets our contract,
 *   4. it emitted SaltedGuessMade with the matching saltedHash.
 *
 * Why this exists: see /api/guess. The sensitive comparison data is
 * stashed there in `pending-reveals` keyed by the opaque saltedGuess.
 * This endpoint is the only way to retrieve it — proof of payment is
 * required, which neutralises the free-brute-force attack.
 *
 * Body:
 * - saltedGuess: `0x${string}`
 * - txHash:      `0x${string}`
 * - playerAddress: string  (must match the tx sender and the pending entry)
 */
export async function POST(request: NextRequest) {
  try {
    if (!CONTRACT_ADDRESS) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { saltedGuess, txHash, playerAddress } = body;

    if (!saltedGuess || typeof saltedGuess !== "string" || !isHash(saltedGuess)) {
      return NextResponse.json({ error: "Invalid saltedGuess" }, { status: 400 });
    }
    if (!txHash || typeof txHash !== "string" || !isHash(txHash)) {
      return NextResponse.json({ error: "Invalid txHash" }, { status: 400 });
    }
    if (!playerAddress || typeof playerAddress !== "string" || !isAddress(playerAddress)) {
      return NextResponse.json({ error: "Invalid player address" }, { status: 400 });
    }

    const pending = await getPendingReveal(saltedGuess);
    if (!pending) {
      // Either expired, or the saltedGuess was never issued by /api/guess
      // for this server instance (e.g. after a cold-start).
      return NextResponse.json(
        { error: "No pending reveal for this saltedGuess (expired or unknown)" },
        { status: 404 }
      );
    }

    const normalizedPlayer = playerAddress.toLowerCase();
    if (pending.playerAddress !== normalizedPlayer) {
      return NextResponse.json(
        { error: "Player mismatch for this saltedGuess" },
        { status: 403 }
      );
    }

    // Fetch the receipt. viem throws if the tx isn't mined yet.
    let receipt;
    try {
      receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
    } catch {
      return NextResponse.json(
        { error: "Transaction not mined yet" },
        { status: 409 }
      );
    }

    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "Transaction failed on-chain" },
        { status: 400 }
      );
    }

    // Tx must come from the claimed player and target our contract.
    if (receipt.from.toLowerCase() !== normalizedPlayer) {
      return NextResponse.json(
        { error: "Transaction sender does not match player" },
        { status: 403 }
      );
    }
    if (!receipt.to || receipt.to.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
      return NextResponse.json(
        { error: "Transaction does not target the game contract" },
        { status: 403 }
      );
    }

    // Decode logs and require a SaltedGuessMade event whose saltedHash
    // matches the one we issued, with the same player and collection.
    const decoded = parseEventLogs({
      abi: saltedGuessMadeAbi,
      eventName: "SaltedGuessMade",
      logs: receipt.logs,
    });

    const matching = decoded.find((log) => {
      const args = log.args as {
        player: `0x${string}`;
        collectionId: bigint;
        saltedHash: `0x${string}`;
      };
      return (
        args.saltedHash.toLowerCase() === saltedGuess.toLowerCase() &&
        args.player.toLowerCase() === normalizedPlayer &&
        Number(args.collectionId) === pending.collectionId
      );
    });

    if (!matching) {
      return NextResponse.json(
        { error: "Transaction does not contain a matching SaltedGuessMade event" },
        { status: 403 }
      );
    }

    // Decrement inflight only on the first successful reveal so retries
    // (e.g. client refresh) don't artificially raise the cap. The
    // markRevealedFirstTime() call uses Redis SET NX so it's atomic
    // across concurrent reveal calls.
    const isFirstReveal = await markRevealedFirstTime(saltedGuess);
    if (isFirstReveal) {
      await decrementInflight(pending.rateLimitKey);
    }

    return NextResponse.json({
      isCorrect: pending.isCorrect,
      comparisons: pending.comparisons,
      guessedCharacter: pending.guessedCharacter,
      // Only reveal the daily character if the player actually won.
      dailyCharacter: pending.isCorrect ? pending.dailyCharacter : undefined,
    });
  } catch (error) {
    console.error("Reveal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
