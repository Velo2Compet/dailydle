import { NextRequest, NextResponse } from "next/server";
import { verifyMessage, createPublicClient, http, parseAbi, keccak256, encodePacked } from "viem";
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
import type { AttributeComparison, Character } from "@/types/game";

// Contract configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SALT_DECRYPT = process.env.SALT_DECRYPT as `0x${string}`;
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY as `0x${string}`;

// Rate limiting: track hash requests per user/collection/day
// In production, use Redis or a database
const hashRequestCounts = new Map<string, number>();
const MAX_HASH_REQUESTS_PER_SESSION = 50; // Limite généreuse mais empêche le brute-force massif

// Multi-wallet detection: track device -> wallets mapping
// In production, use Redis or a database with persistence
const deviceWalletMap = new Map<string, Set<string>>(); // deviceId -> Set of wallet addresses
const deviceFirstWalletMap = new Map<string, string>(); // deviceId -> first wallet address (protected)
const MULTI_WALLET_THRESHOLD = 2; // Flag after this many wallets on same device

// ABI for reading contract state
const saltedContractAbi = parseAbi([
  "function getUserSession(address _player, uint256 _collectionId, uint256 _day) external view returns (bytes32 commitment, bool hasWonToday, uint256 attemptsToday)",
  "function feePerGuess() external view returns (uint256)",
]);

const publicClient = createPublicClient({
  chain: APP_CHAIN,
  transport: http(RPC_URL),
});

/**
 * Sign the commitment with the server's private key
 * The contract will verify this signature to trust the commitment
 * Now includes shouldFlag for multi-wallet detection
 */
async function signCommitment(
  playerAddress: string,
  collectionId: number,
  day: number,
  commitment: string,
  shouldFlag: boolean
): Promise<string> {
  const account = privateKeyToAccount(SERVER_PRIVATE_KEY);

  // Create message hash exactly as the contract does:
  // keccak256(abi.encodePacked(msg.sender, _collectionId, currentDay, _commitment, _shouldFlag))
  const messageHash = keccak256(
    encodePacked(
      ["address", "uint256", "uint256", "bytes32", "bool"],
      [playerAddress as `0x${string}`, BigInt(collectionId), BigInt(day), commitment as `0x${string}`, shouldFlag]
    )
  );

  // Sign with Ethereum prefix (as per EIP-191)
  const signature = await account.signMessage({
    message: { raw: messageHash },
  });

  return signature;
}

/**
 * Compute the commitment hash for the daily character
 * commitment = keccak256(dailyCharId, sessionSignature, SALT_DECRYPT)
 */
function computeCommitment(
  dailyCharacterId: number,
  sessionSignature: string,
  saltDecrypt: string
): string {
  return keccak256(
    encodePacked(
      ["uint256", "bytes", "bytes32"],
      [BigInt(dailyCharacterId), sessionSignature as `0x${string}`, saltDecrypt as `0x${string}`]
    )
  );
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
 * Track device-wallet association and detect multi-wallet usage
 * Returns warning info if multiple wallets detected
 *
 * Important: Only flags wallets that are NOT the first one on the device
 * The first wallet stays protected and can claim rewards
 */
function trackDeviceWallet(deviceId: string, walletAddress: string): {
  isMultiWallet: boolean;
  walletsOnDevice: string[];
  isNewWalletOnDevice: boolean;
  isFirstWalletOnDevice: boolean;
} {
  const address = walletAddress.toLowerCase();

  // Get or create wallet set for this device
  if (!deviceWalletMap.has(deviceId)) {
    deviceWalletMap.set(deviceId, new Set());
  }
  const walletsOnDevice = deviceWalletMap.get(deviceId)!;

  // Track if this is a new wallet on this device
  const isNewWalletOnDevice = !walletsOnDevice.has(address);

  // Add wallet to device tracking
  if (isNewWalletOnDevice) {
    walletsOnDevice.add(address);

    // Track the FIRST wallet on this device (it stays protected)
    if (!deviceFirstWalletMap.has(deviceId)) {
      deviceFirstWalletMap.set(deviceId, address);
    }
  }

  const walletsList = Array.from(walletsOnDevice);
  const firstWallet = deviceFirstWalletMap.get(deviceId);
  const isFirstWalletOnDevice = firstWallet === address;

  return {
    isMultiWallet: walletsList.length >= MULTI_WALLET_THRESHOLD,
    walletsOnDevice: walletsList,
    isNewWalletOnDevice,
    isFirstWalletOnDevice,
  };
}

/**
 * POST /api/guess
 *
 * Retourne le hash salé pour un guess + commitment + signature serveur
 * L'USER soumettra ensuite TOUT en une seule transaction
 *
 * Body:
 * - playerAddress: string
 * - collectionId: number
 * - characterId: number (the character being guessed)
 * - sessionSignature: string (signature of session message)
 * - deviceId: string (optional, for multi-wallet detection)
 *
 * Response:
 * - saltedGuess: string (hash du guess)
 * - commitment: string (hash de la réponse correcte, signé par le serveur)
 * - serverSignature: string (signature du serveur sur le commitment)
 * - comparisons: AttributeComparison[]
 * - guessedCharacter: { id, name, imageUrl }
 * - dailyCharacter?: { id, name, imageUrl } (only if correct)
 * - feePerGuess: string (wei)
 * - multiWalletWarning?: boolean (if multi-wallet detected)
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
    if (!playerAddress || typeof playerAddress !== "string" || !playerAddress.startsWith("0x")) {
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

    // Track device-wallet association for multi-wallet detection
    let multiWalletInfo: { isMultiWallet: boolean; walletsOnDevice: string[]; isNewWalletOnDevice: boolean; isFirstWalletOnDevice: boolean } | null = null;
    if (deviceId && typeof deviceId === "string" && deviceId.length > 0) {
      multiWalletInfo = trackDeviceWallet(deviceId, playerAddress);

      // Log multi-wallet detection for monitoring
      if (multiWalletInfo.isMultiWallet && multiWalletInfo.isNewWalletOnDevice) {
        console.warn(`[MULTI-WALLET] Device ${deviceId.slice(0, 8)}... has ${multiWalletInfo.walletsOnDevice.length} wallets:`, multiWalletInfo.walletsOnDevice);
        console.warn(`[MULTI-WALLET] First wallet (protected): ${deviceFirstWalletMap.get(deviceId)}`);
        console.warn(`[MULTI-WALLET] Current wallet: ${playerAddress.toLowerCase()} - Will be flagged: ${!multiWalletInfo.isFirstWalletOnDevice}`);
      }
    }

    // Rate limiting: check hash request count
    const rateLimitKey = `${playerAddress}-${collectionId}-${currentDay}-${sessionSignature.slice(0, 20)}`;
    const currentCount = hashRequestCounts.get(rateLimitKey) || 0;

    if (currentCount >= MAX_HASH_REQUESTS_PER_SESSION) {
      return NextResponse.json(
        { error: "Too many hash requests. Please start a new session." },
        { status: 429 }
      );
    }

    // Increment count
    hashRequestCounts.set(rateLimitKey, currentCount + 1);

    // Check user session on-chain (to see if already won)
    const session = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: saltedContractAbi,
      functionName: "getUserSession",
      args: [playerAddress as `0x${string}`, BigInt(collectionId), BigInt(currentDay)],
    });

    const [, hasWonToday] = session as [string, boolean, bigint];

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

    // Compute commitment (the correct answer hash)
    const commitment = computeCommitment(
      dailyCharacterId,
      sessionSignature,
      SALT_DECRYPT
    );

    // Determine if user should be flagged for multi-wallet
    // Only flag if: multi-wallet detected AND this is NOT the first wallet on the device
    const shouldFlag = Boolean(multiWalletInfo?.isMultiWallet && !multiWalletInfo?.isFirstWalletOnDevice);

    // Sign the commitment with server's private key (includes shouldFlag)
    const serverSignature = await signCommitment(
      playerAddress,
      collectionId,
      currentDay,
      commitment,
      shouldFlag
    );

    // Check if guess is correct (for comparisons, NOT revealed to user directly)
    const isCorrect = characterId === dailyCharacterId;

    // Get guessed character for comparison
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

    // Build response
    const response: {
      saltedGuess: string;
      commitment: string;
      serverSignature: string;
      comparisons: AttributeComparison[];
      guessedCharacter: {
        id: number;
        name: string;
        imageUrl?: string;
      };
      dailyCharacter?: {
        id: number;
        name: string;
        imageUrl?: string;
      };
      feePerGuess: string;
      hashRequestsRemaining: number;
      shouldFlag: boolean;
      multiWalletWarning?: boolean;
      walletsOnDevice?: string[];
    } = {
      saltedGuess,
      commitment,
      serverSignature,
      comparisons,
      guessedCharacter: {
        id: guessedCharacter.id,
        name: guessedCharacter.name,
        imageUrl: guessedCharacter.imageUrl,
      },
      feePerGuess: feePerGuess.toString(),
      hashRequestsRemaining: MAX_HASH_REQUESTS_PER_SESSION - (currentCount + 1),
      shouldFlag, // For contract auto-flag
    };

    // Add multi-wallet warning if detected
    if (shouldFlag) {
      response.multiWalletWarning = true;
      response.walletsOnDevice = multiWalletInfo?.walletsOnDevice;
    }

    // Only reveal daily character if player guessed correctly
    if (isCorrect) {
      response.dailyCharacter = {
        id: dailyCharacter.id,
        name: dailyCharacter.name,
        imageUrl: dailyCharacter.imageUrl,
      };
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
