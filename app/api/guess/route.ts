import { NextRequest, NextResponse } from "next/server";
import {
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
import { setPendingReveal } from "@/lib/pending-reveals";
import { trackDeviceWallet } from "@/lib/device-tracking";
import { readOrIssueDeviceId, applyDeviceIdCookie } from "@/lib/server-device-id";
import type { AttributeComparison, Character } from "@/types/game";

// Contract configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SALT_DECRYPT = process.env.SALT_DECRYPT as `0x${string}`;
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY as `0x${string}`;

// No off-chain rate-limit on guesses. The commit/claim flow makes every
// guess cost `feePerGuess` on-chain, so brute-forcing the answer is
// economically self-defeating (and revenue-positive for the contract).
// The on-chain `hasWonToday` lock naturally ends a session after a win.

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
 * Sign the COMMIT attestation. The preimage deliberately does NOT include
 * the correctness bit — the contract's submitSaltedGuess only records a
 * paid commit and never branches on correctness. The win attestation is
 * signed separately by /api/reveal once the commit's on-chain receipt has
 * been validated.
 *
 * IMPORTANT: this MUST mirror the on-chain hash exactly:
 *   keccak256("COMMIT", address(this), player, collectionId, day, saltedGuess, shouldFlag)
 *
 * The "COMMIT" domain separator makes the preimage unambiguously distinct
 * from a WIN signature (which uses "WIN") — defence in depth against any
 * future preimage change that might shrink the difference.
 */
async function signCommitAttestation(
  contractAddress: string,
  playerAddress: string,
  collectionId: number,
  day: number,
  saltedGuess: string,
  shouldFlag: boolean
): Promise<string> {
  const account = privateKeyToAccount(SERVER_PRIVATE_KEY);

  const messageHash = keccak256(
    encodePacked(
      ["string", "address", "address", "uint256", "uint256", "bytes32", "bool"],
      [
        "COMMIT",
        contractAddress as `0x${string}`,
        playerAddress as `0x${string}`,
        BigInt(collectionId),
        BigInt(day),
        saltedGuess as `0x${string}`,
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
 * Phase 1 of the 2-phase commit/claim guess flow. Returns ONLY the
 * minimum required to build the COMMIT transaction:
 *   - saltedGuess        (opaque hash, safe to expose)
 *   - shouldFlag         (server-attested multi-wallet flag)
 *   - commitSignature    (server signature over the commit preimage —
 *                         NO correctness bit included)
 *   - feePerGuess        (so the wallet attaches the right value)
 *
 * Everything that depends on correctness — `isCorrect`, `comparisons`,
 * `dailyCharacter`, the win signature — is NEVER returned here. They
 * are stashed server-side in `pending-reveals` keyed by saltedGuess,
 * and only released by /api/reveal after the player has proven on-chain
 * payment via the commit tx receipt.
 *
 * This closes the brute-force-via-fresh-wallets attack: an attacker
 * who calls this endpoint learns nothing about correctness. The only
 * way to learn whether a guess is correct is to actually pay the fee
 * on-chain (via submitSaltedGuess) and then call /api/reveal with the
 * receipt — at which point each probe has a real cost.
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
    const { playerAddress, collectionId, characterId, sessionSignature } = body;

    // Server-issued, HMAC-signed cookie. Replaces the previous client-supplied
    // `deviceId` field in the body, which was trivially spoofable (just omit
    // it, or rotate it per-wallet). The client cannot influence this value;
    // worst case, an attacker clears cookies and gets a fresh "first wallet"
    // protection — same friction as a fresh browser profile.
    const serverDevice = readOrIssueDeviceId(request);

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

    // Verify the session signature (one signature per day for all collections).
    //
    // Uses publicClient.verifyMessage (not the standalone viem helper) so we
    // also accept ERC-1271 / ERC-6492 signatures from smart wallets — Coinbase
    // Smart Wallet (Base App), Safe, etc. The standalone helper only does
    // EOA-style 65-byte ECDSA recover and throws "invalid signature length"
    // when a smart-wallet sig comes in.
    const expectedMessage = getSessionMessage(currentDay);
    let isValidSignature = false;
    try {
      isValidSignature = await publicClient.verifyMessage({
        address: playerAddress as `0x${string}`,
        message: expectedMessage,
        signature: sessionSignature as `0x${string}`,
      });
    } catch (err) {
      console.warn("[session-sig] verifyMessage threw", {
        player: playerAddress,
        sigLen: sessionSignature?.length,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Invalid session signature" },
        { status: 401 }
      );
    }

    // Track device-wallet association for multi-wallet detection (Redis-backed).
    // The device id is the server-signed cookie value, not anything from the
    // request body — see lib/server-device-id.ts for the rationale.
    const multiWalletInfo = await trackDeviceWallet(serverDevice.deviceId, playerAddress);

    if (multiWalletInfo.isMultiWallet && multiWalletInfo.isNewWalletOnDevice) {
      console.warn(
        `[MULTI-WALLET] Device ${serverDevice.deviceId.slice(0, 8)}… now has ${multiWalletInfo.walletsOnDevice.length} wallets. First (protected): ${multiWalletInfo.firstWallet}. New: ${playerAddress.toLowerCase()} — flag=${!multiWalletInfo.isFirstWalletOnDevice}`
      );
    }

    const normalizedPlayer = playerAddress.toLowerCase();

    // Batch the two on-chain reads we need (getUserSession + feePerGuess)
    // into a single Multicall3 round trip — saves one RPC call per guess.
    // viem auto-uses Multicall3 from the chain config on Base + Base Sepolia.
    const [sessionResult, feeResult] = await publicClient.multicall({
      allowFailure: false,
      contracts: [
        {
          address: CONTRACT_ADDRESS,
          abi: saltedContractAbi,
          functionName: "getUserSession",
          args: [playerAddress as `0x${string}`, BigInt(collectionId), BigInt(currentDay)],
        },
        {
          address: CONTRACT_ADDRESS,
          abi: saltedContractAbi,
          functionName: "feePerGuess",
        },
      ],
    });

    const [hasWonToday] = sessionResult as readonly [boolean, bigint];
    const feePerGuess = feeResult as bigint;

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

    // Determine correctness server-side. Stashed in pending-reveals;
    // NEVER returned in this response and NEVER signed at this stage.
    const isCorrect = characterId === dailyCharacterId;

    // Multi-wallet flag: only if detected AND not the protected first wallet on device
    const shouldFlag = Boolean(multiWalletInfo.isMultiWallet && !multiWalletInfo.isFirstWalletOnDevice);

    // Sign the COMMIT attestation only — preimage has no correctness bit.
    // The win attestation is produced separately by /api/reveal after
    // the commit's on-chain receipt has been validated.
    const checksummedContract = getAddress(CONTRACT_ADDRESS);
    const checksummedPlayer = getAddress(playerAddress);
    const commitSignature = await signCommitAttestation(
      checksummedContract,
      checksummedPlayer,
      collectionId,
      currentDay,
      saltedGuess,
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

    // feePerGuess was already fetched above in the same multicall as
    // getUserSession — no extra RPC call here.

    // Stash sensitive data server-side, keyed by the opaque saltedGuess.
    // /api/reveal will hand this over after on-chain payment is proven.
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
    });

    // Minimal response: just what's needed for the COMMIT tx. No
    // correctness bit, no attribute hints, no daily character, no
    // guessed character details — those land via /api/reveal after the
    // commit is mined and validated.
    const response: {
      saltedGuess: string;
      shouldFlag: boolean;
      commitSignature: string;
      feePerGuess: string;
      multiWalletWarning?: boolean;
    } = {
      saltedGuess,
      shouldFlag,
      commitSignature,
      feePerGuess: feePerGuess.toString(),
    };

    if (shouldFlag) {
      response.multiWalletWarning = true;
    }

    // Attach the device cookie on the way out if we just issued one. The
    // browser will replay it on subsequent /api/guess calls.
    return applyDeviceIdCookie(NextResponse.json(response), serverDevice.cookieToSet);
  } catch (error) {
    console.error("Salted guess error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
