"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage, useWriteContract, useReadContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from "wagmi";
import { parseAbi } from "viem";
import { APP_CHAIN_ID } from "@/lib/chain-config";
import type { Collection, Character, AttributeComparison } from "@/types/game";

// Contract configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

// ABI for the commit/claim flow:
//   submitSaltedGuess = phase 1 (paid commit, no correctness bit)
//   claimWin          = phase 2 (gas-only, no fee) — triggered by the
//     player from the victory animation's claim button once /api/reveal
//     attests the win.
const saltedContractAbi = parseAbi([
  "function submitSaltedGuess(uint256 _collectionId, bytes32 _saltedGuess, bool _shouldFlag, bytes calldata _commitSignature) external payable returns (uint256 attempts)",
  "function claimWin(address _winner, uint256 _collectionId, uint256 _day, bytes32 _saltedGuess, bytes calldata _winSignature) external",
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
  // Set only on the winning guess. Persisted in localStorage so a page
  // refresh between commit and claim doesn't lose the win.
  saltedGuess?: `0x${string}`;
  winSignature?: `0x${string}`;
}

/**
 * The claim required to finalise a win on-chain. Derived from the
 * winning guess + current contract state (hasWonToday). When non-null,
 * the UI should surface a "Claim win" CTA.
 */
export interface PendingClaim {
  saltedGuess: `0x${string}`;
  winSignature: `0x${string}`;
  day: number;
  collectionId: number;
  characterId: number;
  characterName: string;
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
 * LocalStorage keys. The contract address is part of every key so a
 * redeploy automatically invalidates cached session signatures and
 * guesses — the old contract had no state for the wallet on the new
 * contract, so showing the old cache would mislead the player.
 */
function getSessionStorageKey(contract: string, address: string, day: number): string {
  return `quizzdle-session-${contract.toLowerCase()}-${address.toLowerCase()}-${day}`;
}

function getGuessesStorageKey(contract: string, address: string, collectionId: number, day: number): string {
  return `quizzdle-guesses-${contract.toLowerCase()}-${address.toLowerCase()}-${collectionId}-${day}`;
}

/**
 * Save session signature to localStorage
 */
function saveSessionToStorage(contract: string, address: string, day: number, signature: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = getSessionStorageKey(contract, address, day);
    localStorage.setItem(key, signature);
  } catch (e) {
    console.error("Failed to save session to localStorage:", e);
  }
}

/**
 * Load session signature from localStorage
 */
function loadSessionFromStorage(contract: string, address: string, day: number): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = getSessionStorageKey(contract, address, day);
    return localStorage.getItem(key);
  } catch (e) {
    console.error("Failed to load session from localStorage:", e);
    return null;
  }
}

/**
 * Save guesses to localStorage
 */
function saveGuessesToStorage(contract: string, address: string, collectionId: number, day: number, guesses: GuessResult[]): void {
  if (typeof window === "undefined") return;
  try {
    const key = getGuessesStorageKey(contract, address, collectionId, day);
    localStorage.setItem(key, JSON.stringify(guesses));
  } catch (e) {
    console.error("Failed to save guesses to localStorage:", e);
  }
}

/**
 * Load guesses from localStorage
 */
function loadGuessesFromStorage(contract: string, address: string, collectionId: number, day: number): GuessResult[] {
  if (typeof window === "undefined") return [];
  try {
    const key = getGuessesStorageKey(contract, address, collectionId, day);
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
 * Hook for the secure commit / claim guess flow.
 *
 * Per guess: ONE wallet popup (the commit). After the reveal validates
 * a winning guess, the victory card surfaces a separate "Claim win"
 * button that triggers the second tx — only shown to the player who
 * actually won. No automatic second popup.
 *
 * 1. User signs the daily session message (persisted in localStorage).
 * 2. submitGuess(characterId):
 *    a. POST /api/guess → { saltedGuess, shouldFlag, commitSignature }.
 *       Server NEVER returns the correctness bit.
 *    b. User submits submitSaltedGuess on-chain (pays the fee, records
 *       the commit). Only wallet popup the player sees per guess.
 *    c. After receipt: POST /api/reveal with the txHash. Server validates
 *       the receipt, releases isCorrect + comparisons (+ dailyCharacter
 *       and winSignature if won).
 * 3. If isCorrect: the hook exposes `pendingClaim` and a `claimWin()`
 *    action. The UI surfaces a button; clicking it submits the claimWin
 *    tx (gas-only). The win signature + saltedGuess are persisted in
 *    localStorage so a refresh between commit and claim doesn't lose
 *    the win.
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

  // Pending guess data carried across the commit-tx confirmation gap.
  //
  // We deliberately do NOT store `isCorrect`, `comparisons` or
  // `dailyCharacter` here: /api/guess no longer returns them. The
  // correctness bit is released by /api/reveal only after the commit tx
  // is validated on-chain — that's the entire point of the fix.
  const pendingGuessRef = useRef<{
    saltedGuess: `0x${string}`;
    day: number;
    collectionId: number;
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

  // Submit guess transaction (the COMMIT step — paid)
  const { writeContractAsync: submitGuessAsync, data: guessTxHash, reset: resetGuessTx } = useWriteContract();
  const { isLoading: isGuessPending, isSuccess: isGuessSuccess } = useWaitForTransactionReceipt({
    hash: guessTxHash,
  });

  // Claim-win transaction (the CLAIM step — gas-only, no fee). Kept on
  // a separate writeContract hook so its lifecycle doesn't entangle the
  // commit handler's effect.
  const {
    writeContractAsync: claimWinAsync,
    data: claimTxHash,
    reset: resetClaimTx,
  } = useWriteContract();
  const { isLoading: isClaimPending, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({
    hash: claimTxHash,
  });

  // Load session and guesses from localStorage on mount
  useEffect(() => {
    if (!address || !collection.id || initializedRef.current) return;

    // Load saved session signature (shared across all collections for the day)
    const savedSignature = loadSessionFromStorage(CONTRACT_ADDRESS, address, currentDay);
    if (savedSignature) {
      sessionSignatureRef.current = savedSignature;
      sessionDayRef.current = currentDay;
      setHasSessionSignature(true);
    }

    // Load saved guesses
    const savedGuesses = loadGuessesFromStorage(CONTRACT_ADDRESS, address, collection.id, currentDay);
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

  // Handle successful commit transaction.
  //
  // Once the commit is confirmed, POST the txHash to /api/reveal. The
  // server validates the receipt and releases isCorrect + comparisons —
  // plus a winSignature when the player won. We DO NOT auto-submit the
  // claimWin: the player will trigger it from the victory animation's
  // "Claim win" button. This gives the player a clean 1-popup-per-guess
  // UX with a clearly-labelled second action for finalising the win.
  useEffect(() => {
    if (!isGuessSuccess || !pendingGuessRef.current || !guessTxHash || !address) return;

    if (revealInFlightRef.current === guessTxHash) return;
    revealInFlightRef.current = guessTxHash;

    const pending = pendingGuessRef.current;

    (async () => {
      let revealData: {
        isCorrect: boolean;
        comparisons: AttributeComparison[];
        dailyCharacter?: { id: number; name: string; imageUrl?: string };
        winSignature?: `0x${string}`;
        day: number;
        collectionId: number;
      } | null = null;
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
        revealData = data;
      } catch (err) {
        console.error("Reveal error:", err);
        revealError =
          err instanceof Error ? err.message : "Failed to load guess details";
      }

      const isCorrect = Boolean(revealData?.isCorrect);
      const comparisons = revealData?.comparisons ?? [];
      const revealedDaily = revealData?.dailyCharacter;

      // Stash the winSignature + saltedGuess on the winning GuessResult.
      // Both are persisted in localStorage so a refresh between commit
      // and claim doesn't lose the win.
      const guessResult: GuessResult = {
        isCorrect,
        characterId: pending.guessedCharacter.id,
        characterName: pending.guessedCharacter.name,
        characterImage: pending.guessedCharacter.imageUrl,
        comparisons,
        timestamp: Date.now(),
        attempts: gameState.attemptsToday + 1,
        ...(isCorrect && revealData?.winSignature
          ? {
              saltedGuess: pending.saltedGuess,
              winSignature: revealData.winSignature,
            }
          : {}),
      };

      setGameState((prev) => {
        const newGuesses = [...prev.guesses, guessResult];
        if (address) {
          saveGuessesToStorage(CONTRACT_ADDRESS, address, collection.id, currentDay, newGuesses);
        }
        return {
          ...prev,
          guesses: newGuesses,
          attemptsToday: prev.attemptsToday + 1,
          // hasWonToday is sourced from on-chain. We don't flip it
          // optimistically because the claim hasn't happened yet — the
          // contract's hasWonToday only becomes true after claimWin.
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
      const savedSignature = loadSessionFromStorage(CONTRACT_ADDRESS, address, currentDay);
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
      saveSessionToStorage(CONTRACT_ADDRESS, address, currentDay, signature);
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
   * Submit a guess: one wallet popup, period.
   *
   * 1. Ensure we have a session signature.
   * 2. POST /api/guess → { saltedGuess, shouldFlag, commitSignature }.
   * 3. Submit submitSaltedGuess on-chain (pays the fee, records the commit).
   *    THIS IS THE ONLY WALLET POPUP THE PLAYER SEES.
   * 4. After the receipt lands, the effect above POSTs to /api/reveal which
   *    releases isCorrect, comparisons, and (if won) a winSignature. The win
   *    is finalised on-chain when the user clicks the claim button rendered
   *    by the victory card — see `claimWin()` below.
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

        // 2. Get saltedGuess + commit signature from API.
        // The device id is now derived server-side from an HMAC-signed,
        // HttpOnly cookie (see lib/server-device-id.ts), so the client
        // doesn't (and can't) send one. credentials: "same-origin" is the
        // default, but kept explicit for clarity — the cookie must round-trip.
        const response = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            playerAddress: address,
            collectionId: collection.id,
            characterId,
            sessionSignature,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to get salted guess");
        }

        if (data.multiWalletWarning) {
          setGameState((prev) => ({ ...prev, multiWalletWarning: true }));
          console.warn("[MULTI-WALLET] Warning: Multiple wallets detected on this device");
        }

        // Stash the data we'll need across commit → reveal → (maybe claim).
        // The guessed character metadata comes from the local collection
        // (the user just picked it) since /api/guess no longer returns
        // any character or correctness details.
        const guessedCharacterLocal = collection.characters?.find(
          (c) => c.id === characterId
        );
        pendingGuessRef.current = {
          saltedGuess: data.saltedGuess as `0x${string}`,
          day: currentDay,
          collectionId: collection.id,
          guessedCharacter: {
            id: characterId,
            name: guessedCharacterLocal?.name ?? `#${characterId}`,
            imageUrl: guessedCharacterLocal?.imageUrl,
          },
        };

        // 3. Switch to chain if needed
        if (chainId !== APP_CHAIN_ID) {
          try {
            await switchChainAsync({ chainId: APP_CHAIN_ID });
          } catch {
            throw new Error("Please switch to Base Sepolia network");
          }
        }

        // 4. Submit COMMIT to blockchain. No isCorrect arg — the contract
        //    only records a paid commit. If the reveal returns a win, the
        //    victory card surfaces a "Claim win" button that triggers the
        //    second tx (gas-only) when the player chooses.
        await submitGuessAsync({
          address: CONTRACT_ADDRESS,
          abi: saltedContractAbi,
          functionName: "submitSaltedGuess",
          args: [
            BigInt(collection.id),
            data.saltedGuess as `0x${string}`,
            data.shouldFlag as boolean,
            data.commitSignature as `0x${string}`,
          ],
          value: feePerGuess,
          chainId: APP_CHAIN_ID,
        });

        // Optimistic return: callers only check for non-null. Correctness
        // and the final GuessResult land in state after /api/reveal
        // completes in the effect above. We cannot return isCorrect here —
        // that's what makes brute-forcing impossible.
        const localChar = collection.characters?.find((c) => c.id === characterId);
        return {
          isCorrect: false,
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
    [address, isConnected, feePerGuess, collection.id, collection.characters, gameState.hasWonToday, gameState.attemptsToday, ensureSessionSignature, submitGuessAsync, chainId, switchChainAsync, currentDay]
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

  // Derive the pending claim from the winning guess + on-chain state.
  // Non-null whenever the player won but hasn't recorded the win on-chain yet.
  const winningGuess = gameState.guesses.find((g) => g.isCorrect);
  const pendingClaim: PendingClaim | null =
    winningGuess?.saltedGuess && winningGuess?.winSignature && !gameState.hasWonToday
      ? {
          saltedGuess: winningGuess.saltedGuess,
          winSignature: winningGuess.winSignature,
          day: currentDay,
          collectionId: collection.id,
          characterId: winningGuess.characterId,
          characterName: winningGuess.characterName,
        }
      : null;

  /**
   * Submit the claimWin transaction. The win signature was provided by
   * /api/reveal after the commit tx was validated, so calling this
   * just finalises the win on-chain (no fee, only gas).
   *
   * Player-triggered (UI button) — never auto-fired by the hook.
   */
  const claimWin = useCallback(async (): Promise<boolean> => {
    if (!address || !isConnected) {
      setGameState((prev) => ({ ...prev, error: "Wallet not connected" }));
      return false;
    }

    if (!pendingClaim) {
      setGameState((prev) => ({ ...prev, error: "No win to claim" }));
      return false;
    }

    try {
      setGameState((prev) => ({ ...prev, error: null }));

      if (chainId !== APP_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: APP_CHAIN_ID });
        } catch {
          throw new Error("Please switch to Base Sepolia network");
        }
      }

      await claimWinAsync({
        address: CONTRACT_ADDRESS,
        abi: saltedContractAbi,
        functionName: "claimWin",
        args: [
          address,
          BigInt(pendingClaim.collectionId),
          BigInt(pendingClaim.day),
          pendingClaim.saltedGuess,
          pendingClaim.winSignature,
        ],
        chainId: APP_CHAIN_ID,
      });
      return true;
    } catch (err) {
      console.error("claimWin error:", err);
      setGameState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to claim win",
      }));
      return false;
    }
  }, [address, isConnected, pendingClaim, claimWinAsync, chainId, switchChainAsync]);

  // Once the claim tx is confirmed, optimistically flip hasWonToday so the
  // victory card switches to the "claimed" state immediately. Public RPCs
  // (especially Base Sepolia) can lag 5–15s on state reads, so relying only
  // on `refetchSession` leaves the card stuck in "needs claim" mode long
  // enough that users assume the button didn't work. The tx succeeded
  // on-chain → the contract state IS true, we just don't need to wait for
  // the node to admit it. We still refetch in the background to reconcile.
  useEffect(() => {
    if (isClaimSuccess) {
      setGameState((prev) => (prev.hasWonToday ? prev : { ...prev, hasWonToday: true }));
      refetchSession();
      resetClaimTx();
    }
  }, [isClaimSuccess, refetchSession, resetClaimTx]);

  return {
    // State
    ...gameState,
    feePerGuess: feePerGuess ? Number(feePerGuess) : 0,
    isGuessPending,
    currentDay,
    hasSessionSignature,
    isSigningSession,
    pendingClaim,
    isClaimPending,

    // Actions
    submitGuess,
    signSession,
    claimWin,
    clearError,
    refresh,
  };
}
