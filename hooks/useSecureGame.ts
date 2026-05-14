"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage, useWriteContract, useReadContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from "wagmi";
import { parseAbi } from "viem";
import { APP_CHAIN_ID } from "@/lib/chain-config";
import { getDeviceId, trackWalletOnDevice } from "@/lib/device-fingerprint";
import type { Collection, Character, AttributeComparison } from "@/types/game";

// Contract configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

// ABI with submitSaltedGuess: server attests isCorrect + shouldFlag via signature
const saltedContractAbi = parseAbi([
  "function submitSaltedGuess(uint256 _collectionId, bytes32 _saltedGuess, bool _isCorrect, bool _shouldFlag, bytes calldata _serverSignature) external payable returns (bool isCorrect, uint256 attempts)",
  "function getUserSession(address _player, uint256 _collectionId, uint256 _day) external view returns (bool hasWonToday, uint256 attemptsToday)",
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
 * Flow (server never pays gas):
 * 1. User signs session message locally (persisted in localStorage)
 * 2. submitGuess(characterId):
 *    a. POST /api/guess with sessionSignature + characterId
 *    b. Server computes saltedGuess, decides isCorrect, signs the attestation
 *       bound to (contract, player, day, collection, saltedGuess, isCorrect, shouldFlag)
 *    c. Server returns {saltedGuess, isCorrect, shouldFlag, serverSignature, ...}
 *    d. User submits all to the contract in one transaction
 *    e. Contract verifies the signature and records the (correct/wrong) guess
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
  // Mirror of sessionSignatureRef for reactive UI (button states)
  const [hasSessionSignature, setHasSessionSignature] = useState(false);
  const [isSigningSession, setIsSigningSession] = useState(false);

  // Pending guess data carried across the tx-confirmation gap.
  //
  // We deliberately do NOT store `comparisons` or `dailyCharacter` here:
  // /api/guess no longer returns them (that was the brute-force leak).
  // Instead we keep the bits needed to call /api/reveal after the tx is
  // mined: the saltedGuess, the player's identity, and the guessed
  // character metadata we already had locally (since the user selected
  // it from the UI).
  const pendingGuessRef = useRef<{
    saltedGuess: `0x${string}`;
    isCorrect: boolean;
    guessedCharacter: { id: number; name: string; imageUrl?: string };
  } | null>(null);

  // Guard against double-reveal across re-renders.
  const revealInFlightRef = useRef<string | null>(null);

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
      setHasSessionSignature(true);
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
      const [hasWon, attempts] = sessionData as [boolean, bigint];

      setGameState((prev) => ({
        ...prev,
        hasWonToday: hasWon,
        attemptsToday: Number(attempts),
      }));
    }
  }, [sessionData]);

  // Handle successful guess transaction.
  //
  // Two-phase reveal: /api/guess no longer hands over comparisons or the
  // daily character (that was the brute-force leak). Now that we have an
  // on-chain receipt, we POST it to /api/reveal which checks the receipt
  // emitted the matching SaltedGuessMade event before releasing the
  // attribute hints. Without this proof of payment, no hints come out.
  useEffect(() => {
    if (!isGuessSuccess || !pendingGuessRef.current || !guessTxHash || !address) return;

    // Guard against the effect firing twice for the same tx (StrictMode,
    // dependency churn) — we'd otherwise hit /api/reveal twice and
    // double-decrement the rate-limit slot.
    if (revealInFlightRef.current === guessTxHash) return;
    revealInFlightRef.current = guessTxHash;

    const pending = pendingGuessRef.current;

    (async () => {
      let comparisons: AttributeComparison[] = [];
      let revealedDaily: { id: number; name: string; imageUrl?: string } | undefined;
      let revealError: string | null = null;

      try {
        const res = await fetch("/api/reveal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            saltedGuess: pending.saltedGuess,
            txHash: guessTxHash,
            playerAddress: address,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to reveal guess result");
        }
        comparisons = (data.comparisons as AttributeComparison[]) ?? [];
        revealedDaily = data.dailyCharacter as
          | { id: number; name: string; imageUrl?: string }
          | undefined;
      } catch (err) {
        console.error("Reveal error:", err);
        revealError =
          err instanceof Error ? err.message : "Failed to load guess details";
      }

      const isCorrect = pending.isCorrect;
      const guessResult: GuessResult = {
        isCorrect,
        characterId: pending.guessedCharacter.id,
        characterName: pending.guessedCharacter.name,
        characterImage: pending.guessedCharacter.imageUrl,
        comparisons,
        timestamp: Date.now(),
        attempts: gameState.attemptsToday + 1,
      };

      setGameState((prev) => {
        const newGuesses = [...prev.guesses, guessResult];
        if (address) {
          saveGuessesToStorage(address, collection.id, currentDay, newGuesses);
        }
        return {
          ...prev,
          guesses: newGuesses,
          attemptsToday: prev.attemptsToday + 1,
          hasWonToday: isCorrect || prev.hasWonToday,
          dailyCharacter: revealedDaily
            ? {
                id: revealedDaily.id,
                name: revealedDaily.name,
                imageUrl: revealedDaily.imageUrl,
                attributes: {},
              }
            : prev.dailyCharacter,
          isLoading: false,
          error: revealError,
        };
      });

      pendingGuessRef.current = null;
      resetGuessTx();
      refetchSession();
    })();
  }, [
    isGuessSuccess,
    guessTxHash,
    address,
    gameState.attemptsToday,
    resetGuessTx,
    refetchSession,
    collection.id,
    currentDay,
  ]);

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
        setHasSessionSignature(true);
        return savedSignature;
      }
    }

    if (!address || !isConnected) {
      setGameState((prev) => ({ ...prev, error: "Wallet not connected" }));
      return null;
    }

    try {
      setIsSigningSession(true);
      // Sign session message locally (one signature for all collections)
      const message = getSessionMessage(currentDay);
      const signature = await signMessageAsync({ message });

      // Store signature in memory and localStorage
      sessionSignatureRef.current = signature;
      sessionDayRef.current = currentDay;
      saveSessionToStorage(address, currentDay, signature);
      setHasSessionSignature(true);

      return signature;
    } catch (error) {
      console.error("Signature error:", error);
      setGameState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to sign session",
      }));
      return null;
    } finally {
      setIsSigningSession(false);
    }
  }, [address, isConnected, currentDay, signMessageAsync]);

  /**
   * Public action: trigger the session signing explicitly (used by the
   * "Sign session" button before character selection, to avoid losing UI
   * state during a wallet redirect mid-guess).
   */
  const signSession = useCallback(async (): Promise<boolean> => {
    const sig = await ensureSessionSignature();
    return Boolean(sig);
  }, [ensureSessionSignature]);

  /**
   * Submit a guess:
   * 1. Ensure we have a session signature
   * 2. Get saltedGuess + signed isCorrect/shouldFlag attestation from API
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

        // 2. Get salted hash + signed (isCorrect, shouldFlag) attestation from API
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

        // Stash what we'll need to call /api/reveal once the tx is mined.
        // The guessed character metadata comes from the local collection
        // (the user just picked it), not from the API response — /api/guess
        // no longer returns character details by design.
        const guessedCharacterLocal = collection.characters?.find(
          (c) => c.id === characterId
        );
        pendingGuessRef.current = {
          saltedGuess: data.saltedGuess as `0x${string}`,
          isCorrect: Boolean(data.isCorrect),
          guessedCharacter: {
            id: characterId,
            name: guessedCharacterLocal?.name ?? `#${characterId}`,
            imageUrl: guessedCharacterLocal?.imageUrl,
          },
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
        // Le serveur a signé (contract, player, day, collection, saltedGuess, isCorrect, shouldFlag).
        // L'utilisateur ne peut pas inverser isCorrect ni shouldFlag sans casser la signature.
        await submitGuessAsync({
          address: CONTRACT_ADDRESS,
          abi: saltedContractAbi,
          functionName: "submitSaltedGuess",
          args: [
            BigInt(collection.id),
            data.saltedGuess as `0x${string}`,
            data.isCorrect as boolean,
            data.shouldFlag as boolean,
            data.serverSignature as `0x${string}`,
          ],
          value: feePerGuess,
          chainId: APP_CHAIN_ID,
        });

        // Optimistic return: caller only checks for non-null. The full
        // GuessResult with comparisons lands in state after /api/reveal
        // completes in the tx-success effect above.
        const isCorrect = Boolean(data.isCorrect);
        const localChar = collection.characters?.find((c) => c.id === characterId);
        return {
          isCorrect,
          characterId,
          characterName: localChar?.name ?? `#${characterId}`,
          characterImage: localChar?.imageUrl,
          comparisons: [],
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
    [address, isConnected, feePerGuess, collection.id, collection.characters, gameState.hasWonToday, gameState.attemptsToday, ensureSessionSignature, submitGuessAsync, chainId, switchChainAsync]
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
    hasSessionSignature,
    isSigningSession,

    // Actions
    submitGuess,
    signSession,
    clearError,
    refresh,
  };
}
