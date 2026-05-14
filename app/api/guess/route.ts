import { NextRequest, NextResponse } from "next/server";
import {
  verifyMessage,
  createPublicClient,
  http,
  parseAbi,
  keccak256,
  encodePacked,
  isAddress,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fetchCategoryById } from "@/lib/quizzdle-api";
import { quizzdleCategoryToCollection } from "@/utils/quizzdle-transform";
import { normalizeCharacter } from "@/utils/game";
import {
  computeSaltedGuess,
  computeDailyCharacterId,
  getSessionMessage,
} from "@/lib/salted-guess";
import { APP_CHAIN, RPC_URL } from "@/lib/chain-config";
import {
  setPendingReveal,
  incrementInflight,
  decrementInflight,
  incrementTotal,
  decrementTotal,
  peekTotal,
  peekInflight,
} from "@/lib/pending-reveals";
import { trackDeviceWallet } from "@/lib/device-tracking";
import type { AttributeComparison, Character } from "@/types/game";

// Contract configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SALT_DECRYPT = process.env.SALT_DECRYPT as `0x${string}`;
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY as `0x${string}`;

// Rate limiting: cap concurrent unproven guesses per (player, collection, day).
// `inflight` only grows when a guess is issued and not yet proven on-chain via
// /api/reveal, so a legitimate player (1 guess → 1 tx → 1 reveal) stays at 0–1.
// An attacker spamming the endpoint without paying hits the cap quickly.
//
// Reason for the soft total cap: even a paying player can't reasonably need
// more than this many guesses for a single day — a runaway total signals an
// automated scraper trying to enumerate by characterId.
// 5 concurrent unproven guesses leaves headroom for a user retrying or
// switching collections mid-tx without locking them out. The on-chain
// `hasWonToday` ends the game on the first correct guess, so a focused
// player rarely needs more than a couple inflight at once.
const MAX_INFLIGHT_GUESSES = 5;

// 15 attempts/day/collection: an honest player who uses the attribute
// hints from /api/reveal converges in 5–8 tries; 15 is generous.
// Anything higher gives a brute-forcer enough room to enumerate a small
// collection (~50 chars) outright — combined with the off-chain INCR cap
// and on-chain `hasWonToday`, this is what bounds the worst case here.
const MAX_TOTAL_GUESSES_PER_DAY = 15;

// ABI for reading contract state
const saltedContractAbi = parseAbi([
  "function getUserSession(address _player, uint256 _collectionId, uint256 _day) external view returns (bool hasWonToday, uint256 attemptsToday)",
  "function feePerGuess() external view returns (uint256)",
]);

const publicClient = createPublicClient({
  chain: APP_CHAIN,
  transport: http(RPC_URL),
});

/**
 * Sign the guess attestation with the server's private key.
 * The signature attests on-chain that, for this (contract, player, day, collection),
 * the provided saltedGuess is/isn't the correct answer, and whether to flag.
 *
 * IMPORTANT: this MUST mirror the on-chain hash exactly:
 *   keccak256(address(this), player, collectionId, day, saltedGuess, isCorrect, shouldFlag)
 */
async function signGuessAttestation(
  contractAddress: string,
  playerAddress: string,
  collectionId: number,
  day: number,
  saltedGuess: string,
  isCorrect: boolean,
  shouldFlag: boolean
): Promise<string> {
  const account = privateKeyToAccount(SERVER_PRIVATE_KEY);

  const messageHash = keccak256(
    encodePacked(
      ["address", "address", "uint256", "uint256", "bytes32", "bool", "bool"],
      [
        contractAddress as `0x${string}`,
        playerAddress as `0x${string}`,
        BigInt(collectionId),
        BigInt(day),
        saltedGuess as `0x${string}`,
        isCorrect,
        shouldFlag,
      ]
    )
  );

  // Sign with Ethereum prefix (EIP-191)
  return account.signMessage({ message: { raw: messageHash } });
}

/**
 * Compare attributes between guessed character and correct character
 */
function compareAttributesSecure(
  guessCharacter: Character,
  correctCharacter: Character,
  attributes: Array<{ name: string; nameFront: string; type: string }>
): AttributeComparison[] {
  const normalizedGuess = normalizeCharacter(guessCharacter);
  const normalizedCorrect = normalizeCharacter(correctCharacter);

  return attributes.map((attr) => {
    const guessValue = normalizedGuess.attributes[attr.name];
    const correctValue = normalizedCorrect.attributes[attr.name];

    let isCorrect = false;
    let isPartial = false;
    let direction: "higher" | "lower" | undefined;

    const isGuessArray = Array.isArray(guessValue);
    const isCorrectArray = Array.isArray(correctValue);
    const hasArrayValue = isGuessArray || isCorrectArray;

    if (attr.type === "int") {
      const guessNum = Number(guessValue);
      const correctNum = Number(correctValue);
      isCorrect = guessNum === correctNum;
      if (!isCorrect) {
        direction = guessNum < correctNum ? "higher" : "lower";
      }
    } else if (hasArrayValue || attr.type === "array") {
      const guessArray = isGuessArray ? guessValue : [guessValue];
      const correctArray = isCorrectArray ? correctValue : [correctValue];

      const guessSet = new Set(guessArray.map((v) => String(v).toLowerCase()));
      const correctSet = new Set(correctArray.map((v) => String(v).toLowerCase()));

      isCorrect =
        guessSet.size === correctSet.size &&
        [...guessSet].every((v) => correctSet.has(v));

      if (!isCorrect) {
        const hasOverlap =
          [...guessSet].some((v) => correctSet.has(v)) ||
          [...correctSet].some((v) => guessSet.has(v));
        isPartial = hasOverlap;
      }
    } else {
      isCorrect =
        String(guessValue).toLowerCase() === String(correctValue).toLowerCase();
    }

    return {
      attributeName: attr.name,
      attributeNameFront: attr.nameFront,
      guessValue,
      correctValue: isCorrect ? correctValue : (attr.type === "int" ? guessValue : correctValue),
      isCorrect,
      isPartial: isPartial || undefined,
      direction,
    } as AttributeComparison & { direction?: "higher" | "lower" };
  });
}

/**
 * POST /api/guess
 *
 * Phase 1 of the 2-phase guess flow. Returns ONLY what is required to
 * build the on-chain transaction:
 *   - saltedGuess        (opaque hash, safe to expose)
 *   - isCorrect          (the signed bit; must travel as an arg to the
 *                         contract call, so it has to be exposed here)
 *   - shouldFlag         (idem)
 *   - serverSignature    (signed attestation)
 *   - feePerGuess        (so the wallet can attach the right value)
 *
 * Sensitive data — `comparisons`, `dailyCharacter`, `guessedCharacter` —
 * is NEVER returned in this response. It is stashed server-side in
 * `pending-reveals`, keyed by saltedGuess, and only released by
 * /api/reveal after the player has proven on-chain payment.
 *
 * This blocks the previous "ask without paying then brute-force"
 * attack: an attacker who calls this endpoint repeatedly learns only
 * the isCorrect bit (each test still costs nothing here, but cannot be
 * leveraged with attribute hints) and is rate-limited by the inflight
 * cap until they actually pay a tx.
 *
 * Body:
 * - playerAddress: string
 * - collectionId: number
 * - characterId: number
 * - sessionSignature: string
 * - deviceId?: string
 */
export async function POST(request: NextRequest) {
  try {
    // Validate environment variables
    if (!CONTRACT_ADDRESS || !SALT_DECRYPT || !SERVER_PRIVATE_KEY) {
      console.error("Missing environment variables for salted contract");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { playerAddress, collectionId, characterId, sessionSignature, deviceId } = body;

    // Validate inputs
    if (!playerAddress || typeof playerAddress !== "string" || !isAddress(playerAddress)) {
      return NextResponse.json(
        { error: "Invalid player address" },
        { status: 400 }
      );
    }

    if (typeof collectionId !== "number" || collectionId < 0) {
      return NextResponse.json(
        { error: "Invalid collection ID" },
        { status: 400 }
      );
    }

    if (typeof characterId !== "number" || characterId < 0) {
      return NextResponse.json(
        { error: "Invalid character ID" },
        { status: 400 }
      );
    }

    if (!sessionSignature || typeof sessionSignature !== "string") {
      return NextResponse.json(
        { error: "Invalid session signature" },
        { status: 400 }
      );
    }

    // Calculate current day
    const currentDay = Math.floor(Date.now() / 1000 / 86400);

    // Verify the session signature (one signature per day for all collections)
    const expectedMessage = getSessionMessage(currentDay);
    const isValidSignature = await verifyMessage({
      address: playerAddress as `0x${string}`,
      message: expectedMessage,
      signature: sessionSignature as `0x${string}`,
    });

    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Invalid session signature" },
        { status: 401 }
      );
    }

    // Track device-wallet association for multi-wallet detection (Redis-backed).
    let multiWalletInfo: {
      isMultiWallet: boolean;
      walletsOnDevice: string[];
      isNewWalletOnDevice: boolean;
      isFirstWalletOnDevice: boolean;
      firstWallet: string | null;
    } | null = null;
    if (deviceId && typeof deviceId === "string" && deviceId.length > 0) {
      multiWalletInfo = await trackDeviceWallet(deviceId, playerAddress);

      if (multiWalletInfo.isMultiWallet && multiWalletInfo.isNewWalletOnDevice) {
        console.warn(
          `[MULTI-WALLET] Device ${deviceId.slice(0, 8)}… now has ${multiWalletInfo.walletsOnDevice.length} wallets. First (protected): ${multiWalletInfo.firstWallet}. New: ${playerAddress.toLowerCase()} — flag=${!multiWalletInfo.isFirstWalletOnDevice}`
        );
      }
    }

    // Rate-limit key intentionally does NOT include the session signature.
    // Including it let an attacker bypass the limit by re-signing the
    // session message (some wallets are non-deterministic, producing a
    // fresh signature each time).
    const normalizedPlayer = playerAddress.toLowerCase();
    const rateLimitKey = `${normalizedPlayer}-${collectionId}-${currentDay}`;

    // Cheap pre-check: bail out without doing any expensive work when the
    // caller is obviously over the cap. The real enforcement is the
    // atomic INCR + rollback further down, which is race-safe.
    const [peekedInflight, peekedTotal] = await Promise.all([
      peekInflight(rateLimitKey),
      peekTotal(rateLimitKey),
    ]);
    if (peekedInflight >= MAX_INFLIGHT_GUESSES) {
      return NextResponse.json(
        {
          error:
            "Too many unconfirmed guesses. Confirm a transaction before requesting another guess.",
        },
        { status: 429 }
      );
    }
    if (peekedTotal >= MAX_TOTAL_GUESSES_PER_DAY) {
      return NextResponse.json(
        { error: "Daily guess limit reached." },
        { status: 429 }
      );
    }

    // Check user session on-chain (to see if already won)
    const session = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: saltedContractAbi,
      functionName: "getUserSession",
      args: [playerAddress as `0x${string}`, BigInt(collectionId), BigInt(currentDay)],
    });

    const [hasWonToday] = session as [boolean, bigint];

    // Verify user hasn't already won
    if (hasWonToday) {
      return NextResponse.json(
        { error: "Already won today for this collection" },
        { status: 400 }
      );
    }

    // Fetch collection data
    const categoryData = await fetchCategoryById(String(collectionId));
    if (!categoryData) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    const collection = quizzdleCategoryToCollection(categoryData);
    if (!collection.characters || collection.characters.length === 0) {
      return NextResponse.json(
        { error: "Collection has no characters" },
        { status: 400 }
      );
    }
    const characterIds = collection.characters.map((c) => c.id);

    // Verify character ID is valid for this collection
    if (!characterIds.includes(characterId)) {
      return NextResponse.json(
        { error: "Character not found in collection" },
        { status: 400 }
      );
    }

    // Calculate daily character ID
    const dailyCharacterId = computeDailyCharacterId(
      SALT_DECRYPT,
      currentDay,
      collectionId,
      characterIds
    );

    // Compute salted guess hash (what the player guessed)
    const saltedGuess = computeSaltedGuess({
      characterId,
      sessionSignature,
      saltDecrypt: SALT_DECRYPT,
    });

    // Determine correctness server-side. The bit is then signed and
    // bound to the saltedGuess so a client cannot flip it.
    const isCorrect = characterId === dailyCharacterId;

    // Multi-wallet flag: only if detected AND not the protected first wallet on device
    const shouldFlag = Boolean(multiWalletInfo?.isMultiWallet && !multiWalletInfo?.isFirstWalletOnDevice);

    // Sign the attestation (contract-bound, anti cross-deploy replay)
    const checksummedContract = getAddress(CONTRACT_ADDRESS);
    const checksummedPlayer = getAddress(playerAddress);
    const serverSignature = await signGuessAttestation(
      checksummedContract,
      checksummedPlayer,
      collectionId,
      currentDay,
      saltedGuess,
      isCorrect,
      shouldFlag
    );

    // Get guessed character (will be stashed for the reveal phase)
    const guessedCharacter = collection.characters.find((c) => c.id === characterId);
    if (!guessedCharacter) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    // Get daily character for comparison
    const dailyCharacter = collection.characters.find((c) => c.id === dailyCharacterId);
    if (!dailyCharacter) {
      return NextResponse.json(
        { error: "Daily character not found" },
        { status: 500 }
      );
    }

    // Compare attributes
    const comparisons = compareAttributesSecure(
      guessedCharacter,
      dailyCharacter,
      collection.attributes
    );

    // Get fee per guess
    const feePerGuess = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: saltedContractAbi,
      functionName: "feePerGuess",
    });

    // Atomic INCR is the race-safe enforcement. INCR returns the
    // post-increment value, so we compare it against the cap and roll
    // back if exceeded. This closes the TOCTOU window left by the
    // earlier peek-based pre-check.
    const newInflight = await incrementInflight(rateLimitKey);
    if (newInflight > MAX_INFLIGHT_GUESSES) {
      await decrementInflight(rateLimitKey);
      return NextResponse.json(
        {
          error:
            "Too many unconfirmed guesses. Confirm a transaction before requesting another guess.",
        },
        { status: 429 }
      );
    }

    const newTotal = await incrementTotal(rateLimitKey);
    if (newTotal > MAX_TOTAL_GUESSES_PER_DAY) {
      // Roll BOTH counters back: we never persist the pending reveal,
      // so neither slot should be considered taken.
      await Promise.all([
        decrementInflight(rateLimitKey),
        decrementTotal(rateLimitKey),
      ]);
      return NextResponse.json(
        { error: "Daily guess limit reached." },
        { status: 429 }
      );
    }

    // Stash sensitive data server-side, keyed by the opaque saltedGuess.
    // /api/reveal will hand this over after on-chain payment is proven.
    //
    // If the Redis SET fails after we've already INCRed inflight + total,
    // we must roll both counters back — otherwise the user's slot stays
    // reserved for the full TTL (24h) over a transient Redis hiccup and
    // they get locked out.
    try {
      await setPendingReveal(saltedGuess, {
        comparisons,
        guessedCharacter: {
          id: guessedCharacter.id,
          name: guessedCharacter.name,
          imageUrl: guessedCharacter.imageUrl,
        },
        dailyCharacter: {
          id: dailyCharacter.id,
          name: dailyCharacter.name,
          imageUrl: dailyCharacter.imageUrl,
        },
        isCorrect,
        shouldFlag,
        playerAddress: normalizedPlayer,
        collectionId,
        day: currentDay,
        rateLimitKey,
      });
    } catch (err) {
      // Best-effort rollback. We swallow rollback errors because the
      // original SET failure is the one worth surfacing.
      await Promise.all([
        decrementInflight(rateLimitKey).catch(() => {}),
        decrementTotal(rateLimitKey).catch(() => {}),
      ]);
      throw err;
    }

    // Minimal response: just what's needed for the on-chain tx, plus the
    // signed multi-wallet flag warning. No attribute hints, no daily
    // character, no guessed character details.
    const response: {
      saltedGuess: string;
      isCorrect: boolean;
      shouldFlag: boolean;
      serverSignature: string;
      feePerGuess: string;
      inflightRemaining: number;
      multiWalletWarning?: boolean;
    } = {
      saltedGuess,
      isCorrect,
      shouldFlag,
      serverSignature,
      feePerGuess: feePerGuess.toString(),
      inflightRemaining: Math.max(0, MAX_INFLIGHT_GUESSES - newInflight),
    };

    if (shouldFlag) {
      response.multiWalletWarning = true;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Salted guess error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
