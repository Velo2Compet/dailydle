"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage, useWriteContract, useReadContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from "wagmi";
import { parseAbi } from "viem";
import { APP_CHAIN_ID } from "@/lib/chain-config";
import { getDeviceId, trackWalletOnDevice } from "@/lib/device-fingerprint";
import type { Collection, Character, AttributeComparison } from "@/types/game";

// Contract configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

// Updated ABI with new submitSaltedGuess signature (includes commitment + serverSignature + shouldFlag)
const saltedContractAbi = parseAbi([
  "function submitSaltedGuess(uint256 _collectionId, bytes32 _saltedGuess, bytes32 _commitment, bytes calldata _serverSignature, bool _shouldFlag) external payable returns (bool isCorrect, uint256 attempts)",
  "function getUserSession(address _player, uint256 _collectionId, uint256 _day) external view returns (bytes32 commitment, bool hasWonToday, uint256 attemptsToday)",
  "function feePerGuess() external view returns (uint256)",
  "function getAttemptsToday(address _player, uint256 _collectionId) external view returns (uint256)",
]);

// Types
export interface GuessResult {
  isCorrect: boolean;
  characterId: number;
  characterName: string;
  characterImage?: string;
  comparisons: AttributeComparison[];
  timestamp: number;
  attempts: number;
}

export interface SecureGameState {
  hasWonToday: boolean;
  attemptsToday: number;
  guesses: GuessResult[];
  dailyCharacter: Character | null;
  isLoading: boolean;
  error: string | null;
  multiWalletWarning: boolean;
}

/**
 * Generate the session message to sign
 * One signature per day for all collections (better UX)
 */
function getSessionMessage(day: number): string {
  return `Quizzdle Onchain Session Authentication\nDay: ${day}\nSign to play securely.`;
}

/**
 * LocalStorage keys for session persistence
 * Session is shared across all collections for the same day
 */
function getSessionStorageKey(address: string, day: number): string {
  return `quizzdle-session-${address.toLowerCase()}-${day}`;
}

function getGuessesStorageKey(address: string, collectionId: number, day: number): string {
  return `quizzdle-guesses-${address.toLowerCase()}-${collectionId}-${day}`;
}

/**
 * Save session signature to localStorage
 */
function saveSessionToStorage(address: string, day: number, signature: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = getSessionStorageKey(address, day);
    localStorage.setItem(key, signature);
  } catch (e) {
    console.error("Failed to save session to localStorage:", e);
  }
}

/**
 * Load session signature from localStorage
 */
function loadSessionFromStorage(address: string, day: number): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = getSessionStorageKey(address, day);
    return localStorage.getItem(key);
  } catch (e) {
    console.error("Failed to load session from localStorage:", e);
    return null;
  }
}

/**
 * Save guesses to localStorage
 */
function saveGuessesToStorage(address: string, collectionId: number, day: number, guesses: GuessResult[]): void {
  if (typeof window === "undefined") return;
  try {
    const key = getGuessesStorageKey(address, collectionId, day);
    localStorage.setItem(key, JSON.stringify(guesses));
  } catch (e) {
    console.error("Failed to save guesses to localStorage:", e);
  }
}

/**
 * Load guesses from localStorage
 */
function loadGuessesFromStorage(address: string, collectionId: number, day: number): GuessResult[] {
  if (typeof window === "undefined") return [];
  try {
    const key = getGuessesStorageKey(address, collectionId, day);
    const data = localStorage.getItem(key);
    if (data) {
      return JSON.parse(data) as GuessResult[];
    }
  } catch (e) {
    console.error("Failed to load guesses from localStorage:", e);
  }
  return [];
}

/**
 * Hook for secure salted game flow
 *
 * NEW FLOW (server never pays gas):
 * 1. User signs session message locally (persisted in localStorage)
 * 2. Call submitGuess(characterId) to:
 *    a. Send signature to server
 *    b. Server computes saltedGuess, commitment, and signs commitment
 *    c. Server returns {saltedGuess, commitment, serverSignature, comparisons}
 *    d. User submits ALL to blockchain in ONE transaction
 *    e. Contract verifies server signature and records guess
 */
export function useSecureGame(collection: Collection) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  // Get current day
  const currentDay = Math.floor(Date.now() / 1000 / 86400);

  // State
  const [gameState, setGameState] = useState<SecureGameState>({
    hasWonToday: false,
    attemptsToday: 0,
    guesses: [],
    dailyCharacter: null,
    isLoading: false,
    error: null,
    multiWalletWarning: false,
  });

  // Session signature cache (valid for current day only)
  const sessionSignatureRef = useRef<string | null>(null);
  const sessionDayRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  // Pending guess data (for after tx confirmation)
  const pendingGuessRef = useRef<{
    comparisons: AttributeComparison[];
    guessedCharacter: { id: number; name: string; imageUrl?: string };
    dailyCharacter?: { id: number; name: string; imageUrl?: string };
  } | null>(null);

  // Read fee per guess
  const { data: feePerGuess } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: saltedContractAbi,
    functionName: "feePerGuess",
    chainId: APP_CHAIN_ID,
  });

  // Read user session
  const { data: sessionData, refetch: refetchSession } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: saltedContractAbi,
    functionName: "getUserSession",
    args: address ? [address, BigInt(collection.id), BigInt(currentDay)] : undefined,
    chainId: APP_CHAIN_ID,
    query: {
      enabled: !!address && !!collection.id,
    },
  });

  // Submit guess transaction
  const { writeContractAsync: submitGuessAsync, data: guessTxHash, reset: resetGuessTx } = useWriteContract();
  const { isLoading: isGuessPending, isSuccess: isGuessSuccess } = useWaitForTransactionReceipt({
    hash: guessTxHash,
  });

  // Load session and guesses from localStorage on mount
  useEffect(() => {
    if (!address || !collection.id || initializedRef.current) return;

    // Load saved session signature (shared across all collections for the day)
    const savedSignature = loadSessionFromStorage(address, currentDay);
    if (savedSignature) {
      sessionSignatureRef.current = savedSignature;
      sessionDayRef.current = currentDay;
    }

    // Load saved guesses
    const savedGuesses = loadGuessesFromStorage(address, collection.id, currentDay);
    if (savedGuesses.length > 0) {
      // Check if there's a winning guess to get the daily character
      const winningGuess = savedGuesses.find(g => g.isCorrect);

      setGameState((prev) => ({
        ...prev,
        guesses: savedGuesses,
        dailyCharacter: winningGuess ? {
          id: winningGuess.characterId,
          name: winningGuess.characterName,
          imageUrl: winningGuess.characterImage,
          attributes: {},
        } : prev.dailyCharacter,
      }));
    }

    initializedRef.current = true;
  }, [address, collection.id, currentDay]);

  // Update game state from session data
  useEffect(() => {
    if (sessionData) {
      const [, hasWon, attempts] = sessionData as [string, boolean, bigint];

      setGameState((prev) => ({
        ...prev,
        hasWonToday: hasWon,
        attemptsToday: Number(attempts),
      }));
    }
  }, [sessionData]);

  // Handle successful guess transaction
  useEffect(() => {
    if (isGuessSuccess && pendingGuessRef.current) {
      const pending = pendingGuessRef.current;
      const isCorrect = !!pending.dailyCharacter;

      const guessResult: GuessResult = {
        isCorrect,
        characterId: pending.guessedCharacter.id,
        characterName: pending.guessedCharacter.name,
        characterImage: pending.guessedCharacter.imageUrl,
        comparisons: pending.comparisons,
        timestamp: Date.now(),
        attempts: gameState.attemptsToday + 1,
      };

      setGameState((prev) => {
        const newGuesses = [...prev.guesses, guessResult];

        // Save guesses to localStorage
        if (address) {
          saveGuessesToStorage(address, collection.id, currentDay, newGuesses);
        }

        return {
          ...prev,
          guesses: newGuesses,
          attemptsToday: prev.attemptsToday + 1,
          hasWonToday: isCorrect || prev.hasWonToday,
          dailyCharacter: pending.dailyCharacter
            ? {
                id: pending.dailyCharacter.id,
                name: pending.dailyCharacter.name,
                imageUrl: pending.dailyCharacter.imageUrl,
                attributes: {},
              }
            : prev.dailyCharacter,
          isLoading: false,
        };
      });

      pendingGuessRef.current = null;
      resetGuessTx();
      refetchSession();
    }
  }, [isGuessSuccess, gameState.attemptsToday, resetGuessTx, refetchSession, address, collection.id, currentDay]);

  /**
   * Ensure we have a valid session signature for today
   * First checks localStorage, then asks for signature if needed
   */
  const ensureSessionSignature = useCallback(async (): Promise<string | null> => {
    // Check if we already have a valid signature in memory
    if (sessionSignatureRef.current && sessionDayRef.current === currentDay) {
      return sessionSignatureRef.current;
    }

    // Check localStorage (shared across all collections for the day)
    if (address) {
      const savedSignature = loadSessionFromStorage(address, currentDay);
      if (savedSignature) {
        sessionSignatureRef.current = savedSignature;
        sessionDayRef.current = currentDay;
        return savedSignature;
      }
    }

    if (!address || !isConnected) {
      setGameState((prev) => ({ ...prev, error: "Wallet not connected" }));
      return null;
    }

    try {
      // Sign session message locally (one signature for all collections)
      const message = getSessionMessage(currentDay);
      const signature = await signMessageAsync({ message });

      // Store signature in memory and localStorage
      sessionSignatureRef.current = signature;
      sessionDayRef.current = currentDay;
      saveSessionToStorage(address, currentDay, signature);

      return signature;
    } catch (error) {
      console.error("Signature error:", error);
      setGameState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to sign session",
      }));
      return null;
    }
  }, [address, isConnected, currentDay, signMessageAsync]);

  /**
   * Submit a guess:
   * 1. Ensure we have a session signature
   * 2. Get saltedGuess + commitment + serverSignature from API
   * 3. Submit everything to blockchain in ONE transaction (user pays gas)
   */
  const submitGuess = useCallback(
    async (characterId: number): Promise<GuessResult | null> => {
      if (!address || !isConnected) {
        setGameState((prev) => ({ ...prev, error: "Wallet not connected" }));
        return null;
      }

      if (!feePerGuess) {
        setGameState((prev) => ({ ...prev, error: "Fee not loaded" }));
        return null;
      }

      if (gameState.hasWonToday) {
        setGameState((prev) => ({ ...prev, error: "Already won today" }));
        return null;
      }

      setGameState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // 1. Ensure we have a valid session signature
        const sessionSignature = await ensureSessionSignature();
        if (!sessionSignature) {
          setGameState((prev) => ({ ...prev, isLoading: false }));
          return null;
        }

        // 2. Get salted hash + commitment + server signature from API
        // Also send deviceId for multi-wallet detection
        const deviceId = getDeviceId();

        // Track wallet on this device locally
        if (deviceId) {
          trackWalletOnDevice(address);
        }

        const response = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerAddress: address,
            collectionId: collection.id,
            characterId,
            sessionSignature,
            deviceId, // For multi-wallet detection
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to get salted guess");
        }

        // Check for multi-wallet warning from server
        if (data.multiWalletWarning) {
          setGameState((prev) => ({ ...prev, multiWalletWarning: true }));
          console.warn("[MULTI-WALLET] Warning: Multiple wallets detected on this device");
        }

        // Store pending guess data for after tx confirmation
        pendingGuessRef.current = {
          comparisons: data.comparisons,
          guessedCharacter: data.guessedCharacter,
          dailyCharacter: data.dailyCharacter,
        };

        // 3. Switch to Base Sepolia if needed
        if (chainId !== APP_CHAIN_ID) {
          try {
            await switchChainAsync({ chainId: APP_CHAIN_ID });
          } catch {
            throw new Error("Please switch to Base Sepolia network");
          }
        }

        // 4. Submit EVERYTHING to blockchain in ONE transaction
        // Note: shouldFlag is signed by server - if multi-wallet detected, user auto-flags themselves!
        await submitGuessAsync({
          address: CONTRACT_ADDRESS,
          abi: saltedContractAbi,
          functionName: "submitSaltedGuess",
          args: [
            BigInt(collection.id),
            data.saltedGuess as `0x${string}`,
            data.commitment as `0x${string}`,
            data.serverSignature as `0x${string}`,
            data.shouldFlag as boolean, // Auto-flag if multi-wallet detected
          ],
          value: feePerGuess,
          chainId: APP_CHAIN_ID,
        });

        // Return optimistic result (final update happens in useEffect when tx confirmed)
        const isCorrect = !!data.dailyCharacter;
        return {
          isCorrect,
          characterId: data.guessedCharacter.id,
          characterName: data.guessedCharacter.name,
          characterImage: data.guessedCharacter.imageUrl,
          comparisons: data.comparisons,
          timestamp: Date.now(),
          attempts: gameState.attemptsToday + 1,
        };
      } catch (error) {
        console.error("Submit guess error:", error);
        pendingGuessRef.current = null;
        setGameState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to submit guess",
        }));
        return null;
      }
    },
    [address, isConnected, feePerGuess, collection.id, gameState.hasWonToday, gameState.attemptsToday, ensureSessionSignature, submitGuessAsync, chainId, switchChainAsync]
  );

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setGameState((prev) => ({ ...prev, error: null }));
  }, []);

  /**
   * Refresh session data
   */
  const refresh = useCallback(async () => {
    await refetchSession();
  }, [refetchSession]);

  return {
    // State
    ...gameState,
    feePerGuess: feePerGuess ? Number(feePerGuess) : 0,
    isGuessPending,
    currentDay,

    // Actions
    submitGuess,
    clearError,
    refresh,
  };
}
