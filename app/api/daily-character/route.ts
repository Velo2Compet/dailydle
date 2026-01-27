import { NextRequest, NextResponse } from "next/server";
import { keccak256, encodePacked, createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

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

export async function GET(request: NextRequest) {
  const collectionId = request.nextUrl.searchParams.get("collectionId");

  if (!collectionId) {
    return NextResponse.json({ error: "Missing collectionId" }, { status: 400 });
  }

  if (!SALT || !CONTRACT_ADDRESS) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    // Read character IDs from contract
    const characterIds = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: "getCollectionCharacterIds",
      args: [BigInt(collectionId)],
    });

    if (!characterIds || characterIds.length === 0) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    // Replicate the on-chain logic: keccak256(abi.encodePacked(salt, currentDay, collectionId))
    const currentDay = BigInt(Math.floor(Date.now() / 1000 / 86400));

    const packed = encodePacked(
      ["bytes32", "uint256", "uint256"],
      [SALT, currentDay, BigInt(collectionId)]
    );
    const seed = BigInt(keccak256(packed));
    const characterIndex = Number(seed % BigInt(characterIds.length));
    const dailyCharacterId = Number(characterIds[characterIndex]);

    return NextResponse.json({ dailyCharacterId });
  } catch (error) {
    console.error("daily-character error:", error);
    return NextResponse.json({ error: "Failed to compute daily character" }, { status: 500 });
  }
}
