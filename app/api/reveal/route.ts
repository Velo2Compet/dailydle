import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  parseAbi,
  parseEventLogs,
  isAddress,
  isHash,
  keccak256,
  encodePacked,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { APP_CHAIN, RPC_URL } from "@/lib/chain-config";
import {
  getPendingReveal,
  markRevealedFirstTime,
} from "@/lib/pending-reveals";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY as `0x${string}`;

// Event signature in the v2 contract: no isCorrect bit (commit doesn't know it).
const saltedGuessMadeAbi = parseAbi([
  "event SaltedGuessMade(address indexed player, uint256 indexed collectionId, bytes32 saltedHash, uint256 attempts)",
]);

const publicClient = createPublicClient({
  chain: APP_CHAIN,
  transport: http(RPC_URL),
});

/**
 * Sign the WIN attestation. Distinct preimage from the commit signature
 * (domain separator "WIN") so the two cannot be cross-used. The contract
 * additionally requires a matching on-chain commit, so even a compromised
 * server cannot make an un-paid wallet win.
 *
 * MUST mirror the on-chain hash exactly:
 *   keccak256("WIN", address(this), player, collectionId, day, saltedGuess)
 */
async function signWinAttestation(
  contractAddress: string,
  playerAddress: string,
  collectionId: number,
  day: number,
  saltedGuess: string
): Promise<string> {
  const account = privateKeyToAccount(SERVER_PRIVATE_KEY);

  const messageHash = keccak256(
    encodePacked(
      ["string", "address", "address", "uint256", "uint256", "bytes32"],
      [
        "WIN",
        contractAddress as `0x${string}`,
        playerAddress as `0x${string}`,
        BigInt(collectionId),
        BigInt(day),
        saltedGuess as `0x${string}`,
      ]
    )
  );

  return account.signMessage({ message: { raw: messageHash } });
}

/**
 * POST /api/reveal
 *
 * Phase 2 of the commit/claim flow. After the player has submitted the
 * COMMIT transaction on-chain (paying the fee), this endpoint validates
 * the receipt and releases:
 *   - isCorrect (the correctness bit, withheld from /api/guess on purpose)
 *   - comparisons (per-attribute hints)
 *   - dailyCharacter (only if the player won)
 *   - winSignature (only if the player won — used to call claimWin on-chain)
 *
 * Validations on the tx receipt:
 *   1. mined and succeeded,
 *   2. tx sender matches the claimed player,
 *   3. tx targets our contract,
 *   4. SaltedGuessMade event present with the matching saltedHash and player.
 *
 * Because none of these checks can succeed without a paid commit on-chain,
 * the correctness bit can never be learned for free — every probe costs the
 * fee. This is what makes brute-forcing the daily answer uneconomic.
 *
 * Body:
 * - saltedGuess: `0x${string}`
 * - txHash:      `0x${string}`
 * - playerAddress: string  (must match the tx sender and the pending entry)
 */
export async function POST(request: NextRequest) {
  try {
    if (!CONTRACT_ADDRESS || !SERVER_PRIVATE_KEY) {
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

    // markRevealedFirstTime is kept for idempotency; today it doesn't
    // gate any one-shot side-effect (claimWin is player-triggered via
    // the UI), but it's a useful hook for any future fire-once server
    // behaviour we want to add to this endpoint.
    await markRevealedFirstTime(saltedGuess);

    // Sign the WIN attestation only when the player actually won. The
    // contract additionally checks that a matching commit exists on-chain
    // before crediting the win, so this signature alone is not enough —
    // it has to be paired with the paid commit from the same wallet.
    //
    // The signature is RE-SIGNABLE: each reveal call regenerates it
    // deterministically (same preimage → same signature output up to
    // randomness in the signing scheme; either way the resulting sig is
    // valid). That lets the client recover after a page refresh by
    // re-POSTing /api/reveal with the same saltedGuess + txHash.
    let winSignature: `0x${string}` | undefined;
    if (pending.isCorrect) {
      winSignature = (await signWinAttestation(
        getAddress(CONTRACT_ADDRESS),
        getAddress(playerAddress),
        pending.collectionId,
        pending.day,
        saltedGuess
      )) as `0x${string}`;
    }

    return NextResponse.json({
      isCorrect: pending.isCorrect,
      comparisons: pending.comparisons,
      guessedCharacter: pending.guessedCharacter,
      // Only reveal the daily character if the player actually won.
      dailyCharacter: pending.isCorrect ? pending.dailyCharacter : undefined,
      // Win attestation: the client uses this with claimWin() to record
      // the win on-chain. Only present when isCorrect=true.
      winSignature,
      day: pending.day,
      collectionId: pending.collectionId,
    });
  } catch (error) {
    console.error("Reveal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
