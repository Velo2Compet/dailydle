import { NextRequest, NextResponse } from "next/server";
import { keccak256, encodePacked, createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { fetchCategoryById } from "@/lib/quizzdle-api";
import { quizzdleCategoryToCollection } from "@/utils/quizzdle-transform";
import { normalizeCharacter } from "@/utils/game";
import type { AttributeComparison, Character } from "@/types/game";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const SALT = process.env.SALT_DECRYPT as `0x${string}`;
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

const abi = parseAbi([
  "function getCollectionCharacterIds(uint256 _collectionId) external view returns (uint256[])",
]);

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

/**
 * Compare attributes between guessed character and correct character
 * Returns comparison results without revealing the correct character's identity
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

    // Only return correctValue if the attribute matches (no info leak)
    // For numeric attributes, we return direction instead of correctValue
    return {
      attributeName: attr.name,
      attributeNameFront: attr.nameFront,
      guessValue,
      // Only reveal correctValue if it matches (or for display purposes in arrays)
      correctValue: isCorrect ? correctValue : (attr.type === "int" ? guessValue : correctValue),
      isCorrect,
      isPartial: isPartial || undefined,
      direction,
    } as AttributeComparison & { direction?: "higher" | "lower" };
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { collectionId, guessedCharacterId, guessedCharacterIds } = body;

    // Support both single guess and batch of guesses
    const guessIds: number[] = guessedCharacterIds
      ? guessedCharacterIds.map((id: number | string) => Number(id))
      : guessedCharacterId !== undefined
        ? [Number(guessedCharacterId)]
        : [];

    if (!collectionId || guessIds.length === 0) {
      return NextResponse.json(
        { error: "Missing collectionId or guessedCharacterId(s)" },
        { status: 400 }
      );
    }

    if (!SALT || !CONTRACT_ADDRESS) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    // 1. Get collection data from Quizzdle API
    const rawCategory = await fetchCategoryById(collectionId);
    const collection = quizzdleCategoryToCollection(rawCategory);

    if (!collection.characters || collection.characters.length === 0) {
      return NextResponse.json({ error: "Collection has no characters" }, { status: 404 });
    }

    // 2. Get character IDs from contract (to match on-chain logic)
    const onChainCharacterIds = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: "getCollectionCharacterIds",
      args: [BigInt(collectionId)],
    });

    if (!onChainCharacterIds || onChainCharacterIds.length === 0) {
      return NextResponse.json({ error: "Collection not registered on-chain" }, { status: 404 });
    }

    // 3. Calculate daily character using the same logic as on-chain
    const currentDay = BigInt(Math.floor(Date.now() / 1000 / 86400));
    const packed = encodePacked(
      ["bytes32", "uint256", "uint256"],
      [SALT, currentDay, BigInt(collectionId)]
    );
    const seed = BigInt(keccak256(packed));
    const characterIndex = Number(seed % BigInt(onChainCharacterIds.length));
    const dailyCharacterId = Number(onChainCharacterIds[characterIndex]);

    // 4. Find daily character in the collection
    const dailyCharacter = collection.characters.find((c) => c.id === dailyCharacterId);

    if (!dailyCharacter) {
      return NextResponse.json({ error: "Daily character not found in collection" }, { status: 500 });
    }

    // 5. Process all guesses
    const results = guessIds.map((guessId) => {
      const guessedCharacter = collection.characters!.find((c) => c.id === guessId);

      if (!guessedCharacter) {
        return {
          guessedCharacterId: guessId,
          error: "Character not found",
        };
      }

      const isCorrect = dailyCharacterId === guessId;
      const comparisons = compareAttributesSecure(
        guessedCharacter,
        dailyCharacter,
        collection.attributes
      );

      const result: {
        isCorrect: boolean;
        comparisons: (AttributeComparison & { direction?: "higher" | "lower" })[];
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
      } = {
        isCorrect,
        comparisons,
        guessedCharacter: {
          id: guessedCharacter.id,
          name: guessedCharacter.name,
          imageUrl: guessedCharacter.imageUrl,
        },
      };

      // Only reveal the daily character if the player won
      if (isCorrect) {
        result.dailyCharacter = {
          id: dailyCharacter.id,
          name: dailyCharacter.name,
          imageUrl: dailyCharacter.imageUrl,
        };
      }

      return result;
    });

    // If single guess was requested, return single result for backwards compatibility
    if (!body.guessedCharacterIds && body.guessedCharacterId !== undefined) {
      return NextResponse.json(results[0]);
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("compare-guess error:", error);
    return NextResponse.json(
      { error: "Failed to compare guess" },
      { status: 500 }
    );
  }
}
