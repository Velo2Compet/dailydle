/**
 * Utilities for salted guess system
 *
 * This module handles the cryptographic salting of guesses to prevent
 * observers from identifying the daily character.
 */

import { keccak256, encodePacked } from "viem";

// Types
export interface SaltedGuessParams {
  characterId: number;
  sessionSignature: string;
  saltDecrypt: string;
}

export interface CommitmentParams {
  dailyCharacterId: number;
  sessionSignature: string;
  saltDecrypt: string;
}

/**
 * Compute salted hash for a guess
 * saltedGuess = keccak256(characterId, sessionSignature, SALT_DECRYPT)
 */
export function computeSaltedGuess(params: SaltedGuessParams): `0x${string}` {
  const { characterId, sessionSignature, saltDecrypt } = params;

  return keccak256(
    encodePacked(
      ["uint256", "bytes", "bytes32"],
      [BigInt(characterId), sessionSignature as `0x${string}`, saltDecrypt as `0x${string}`]
    )
  );
}

/**
 * Compute commitment for a user session
 * commitment = keccak256(dailyCharacterId, sessionSignature, SALT_DECRYPT)
 */
export function computeCommitment(params: CommitmentParams): `0x${string}` {
  const { dailyCharacterId, sessionSignature, saltDecrypt } = params;

  return keccak256(
    encodePacked(
      ["uint256", "bytes", "bytes32"],
      [BigInt(dailyCharacterId), sessionSignature as `0x${string}`, saltDecrypt as `0x${string}`]
    )
  );
}

/**
 * Verify if a salted guess matches the commitment
 */
export function verifySaltedGuess(
  saltedGuess: `0x${string}`,
  commitment: `0x${string}`
): boolean {
  return saltedGuess === commitment;
}

/**
 * Compute the daily character ID using the same logic as the contract
 * dailyCharId = characterIds[hash(salt, day, collectionId) % numCharacters]
 */
export function computeDailyCharacterId(
  salt: string,
  day: number,
  collectionId: number,
  characterIds: number[]
): number {
  const seed = keccak256(
    encodePacked(
      ["bytes32", "uint256", "uint256"],
      [salt as `0x${string}`, BigInt(day), BigInt(collectionId)]
    )
  );

  const seedBigInt = BigInt(seed);
  const index = Number(seedBigInt % BigInt(characterIds.length));

  return characterIds[index];
}

/**
 * Generate the message to sign for session authentication
 * One signature per day for all collections (better UX)
 */
export function getSessionMessage(day: number): string {
  return `Quizzdle Onchain Session Authentication\nDay: ${day}\nSign to play securely.`;
}

/**
 * Verify session signature (for server-side verification)
 */
export async function verifySessionSignature(
  address: string,
  signature: string,
  day: number
): Promise<boolean> {
  const { verifyMessage } = await import("viem");

  const message = getSessionMessage(day);

  try {
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return isValid;
  } catch {
    return false;
  }
}
