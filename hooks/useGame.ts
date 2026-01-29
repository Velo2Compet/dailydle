"use client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain, useSignMessage } from "wagmi";
import { useState, useEffect, useCallback, useRef } from "react";
import { parseAbi } from "viem";
import { baseSepolia } from "wagmi/chains";
import { GameState, GuessResult, Character, Collection, AttributeComparison } from "@/types/game";
import { getCurrentDay } from "@/utils/game";

// Signature cache - stored per collection to avoid re-signing
const signatureCache = new Map<string, { signature: string; timestamp: number }>();
const SIGNATURE_VALIDITY_MS = 4 * 60 * 1000; // 4 minutes (slightly less than server's 5 min)

// Cache settings to reduce RPC calls and avoid rate limiting
const CACHE_TIME = 5 * 60 * 1000; // 5 minutes staleTime
const REFETCH_INTERVAL = 60 * 1000; // Refetch every 60 seconds max

const CONTRACT_ABI = parseAbi([
  "function makeGuess(uint256 _collectionId, uint256 _characterId) external payable returns (bool isCorrect, uint256 attempts)",
  "function feePerGuess() external view returns (uint256)",
  "function verifyGuess(uint256 _collectionId, uint256 _characterId) external view returns (bool)",
  "function getDailyCharacterId(uint256 _collectionId) external view returns (uint256)",
  "function getAttempts(address _player, uint256 _collectionId, uint256 _day) external view returns (uint256)",
  "function getPlayerGuesses(address _player, uint256 _collectionId) external view returns ((address player, uint256 collectionId, uint256 characterId, uint256 timestamp, bool isCorrect)[])",
  "function collectionExists(uint256 _collectionId) external view returns (bool)",
  "function getCollectionCharacterIds(uint256 _collectionId) external view returns (uint256[])",
  "function updateCollectionCharacterIds(uint256 _collectionId, uint256[] memory _characterIds) external",
  "function updateMultipleCollections(uint256[] memory _collectionIds, uint256[][] memory _characterIdsArrays) external",
  "function getWinsPerCollection(address _player, uint256 _collectionId) external view returns (uint256)",
  "function getTotalWins(address _player) external view returns (uint256)",
  "function getGlobalTotalWins() external view returns (uint256)",
  "function getWinnersTodayCount(uint256 _collectionId, uint256 _day) external view returns (uint256)",
  "function getTotalWinnersCount(uint256 _collectionId) external view returns (uint256)",
]);

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

/**
 * Hook pour faire une proposition
 */
export function useMakeGuess() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Récupérer les frais actuels
  const { data: fee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "feePerGuess",
    chainId: baseSepolia.id, // Forcer Base pour la lecture
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  const makeGuess = useCallback(
    async (collectionId: number, characterId: number) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      // Vérifier et forcer Base (chainId 8453)
      if (chainId !== baseSepolia.id) {
        try {
          await switchChain({ chainId: baseSepolia.id });
          // Attendre un peu pour que le switch soit effectif
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (switchError) {
          throw new Error("Please switch to Base network to make a guess");
        }
      }

      // Utiliser les frais récupérés, ou 1000000000 wei (0.000001 ETH) par défaut
      const feeAmount = fee ? BigInt(fee.toString()) : BigInt("1000000000");

      return writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "makeGuess",
        args: [BigInt(collectionId), BigInt(characterId)],
        value: feeAmount,
        chainId: baseSepolia.id, // Forcer Base explicitement
      });
    },
    [writeContract, address, fee, chainId, switchChain]
  );

  return {
    makeGuess,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    fee: fee ? BigInt(fee.toString()) : BigInt("1000000000"),
  };
}

/**
 * Hook pour récupérer l'état du jeu
 * Sécurisé : le personnage du jour n'est JAMAIS exposé au client avant victoire
 * Requires wallet signature to prove ownership
 */
export function useGameState(collection: Collection) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [gameState, setGameState] = useState<GameState>({
    collectionId: collection.id,
    dailyCharacter: null,
    dailyCharacterHash: "",
    attempts: 0,
    maxAttempts: 0,
    guesses: [],
    isGameOver: false,
    isGameWon: false,
  });
  const [isSigningRequired, setIsSigningRequired] = useState(false);

  const currentDay = getCurrentDay();
  const lastProcessedGuessesRef = useRef<string>("");

  // Get or request signature for API authentication
  const getSignature = useCallback(async (): Promise<{ signature: string; timestamp: number } | null> => {
    if (!address) return null;

    const cacheKey = `${address}-${collection.id}`;
    const cached = signatureCache.get(cacheKey);

    // Return cached signature if still valid
    if (cached && Date.now() - cached.timestamp < SIGNATURE_VALIDITY_MS) {
      return cached;
    }

    // Request new signature
    try {
      setIsSigningRequired(true);
      const timestamp = Date.now();
      const message = `Dailydle: Verify wallet ownership\nCollection: ${collection.id}\nTimestamp: ${timestamp}`;

      const signature = await signMessageAsync({ message });

      const result = { signature, timestamp };
      signatureCache.set(cacheKey, result);
      setIsSigningRequired(false);
      return result;
    } catch (error) {
      console.error("Failed to sign message:", error);
      setIsSigningRequired(false);
      return null;
    }
  }, [address, collection.id, signMessageAsync]);

  // Récupérer le nombre de tentatives
  const { data: attempts, refetch: refetchAttempts } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getAttempts",
    args: address ? [address as `0x${string}`, BigInt(collection.id), BigInt(currentDay)] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: !!address,
      staleTime: 30 * 1000,
      refetchInterval: false,
      refetchOnWindowFocus: false,
    },
  });

  // Récupérer les propositions précédentes
  const { data: playerGuesses, refetch: refetchPlayerGuesses } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getPlayerGuesses",
    args: address ? [address as `0x${string}`, BigInt(collection.id)] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: !!address,
      staleTime: 30 * 1000,
      refetchInterval: false,
      refetchOnWindowFocus: false,
    },
  });

  // Mettre à jour le nombre de tentatives
  useEffect(() => {
    if (attempts !== undefined) {
      setGameState((prev) => ({
        ...prev,
        attempts: Number(attempts),
      }));
    }
  }, [attempts]);

  // Traiter les propositions via l'API sécurisée (comparaisons calculées côté serveur)
  useEffect(() => {
    if (!playerGuesses || !collection.id) return;

    // Filtrer les guesses d'aujourd'hui
    const todayGuessesRaw = (playerGuesses as any[]).filter((g) => {
      const guessDay = Math.floor(Number(g.timestamp) / 86400);
      return guessDay === currentDay;
    });

    if (todayGuessesRaw.length === 0) {
      setGameState((prev) => ({
        ...prev,
        guesses: [],
        isGameWon: false,
        isGameOver: false,
        dailyCharacter: null,
      }));
      return;
    }

    // Créer une clé unique pour éviter les appels dupliqués
    const guessKey = todayGuessesRaw.map((g) => `${g.characterId}-${g.timestamp}`).join(",");
    if (guessKey === lastProcessedGuessesRef.current) {
      return;
    }

    // Extraire les IDs des personnages devinés
    const guessedCharacterIds = todayGuessesRaw.map((g) => Number(g.characterId));

    // SECURITY: Get signature to prove wallet ownership
    // This prevents attackers from using other players' addresses
    const fetchWithSignature = async () => {
      const signatureData = await getSignature();
      if (!signatureData) {
        console.error("Failed to get signature for API call");
        return;
      }

      const response = await fetch("/api/compare-guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: collection.id,
          guessedCharacterIds,
          playerAddress: address,
          signature: signatureData.signature,
          signatureTimestamp: signatureData.timestamp,
        }),
      });

      const data = await response.json();

      if (data.error) {
        // If signature expired, clear cache and retry
        if (response.status === 401) {
          const cacheKey = `${address}-${collection.id}`;
          signatureCache.delete(cacheKey);
          console.error("Signature expired, please try again");
        } else {
          console.error("compare-guess error:", data.error);
        }
        return;
      }

      lastProcessedGuessesRef.current = guessKey;

      const results = data.results || [];

      // Mapper les résultats aux guesses
      const processedGuesses: GuessResult[] = todayGuessesRaw.map((g, index) => {
        const result = results[index];
        if (!result || result.error) {
          return {
            isCorrect: g.isCorrect,
            attempts: Number(g.characterId),
            characterId: Number(g.characterId),
            characterName: `Character #${g.characterId}`,
            characterImage: undefined,
            comparisons: [],
            timestamp: Number(g.timestamp),
          };
        }

        return {
          isCorrect: result.isCorrect,
          attempts: result.guessedCharacter.id,
          characterId: result.guessedCharacter.id,
          characterName: result.guessedCharacter.name,
          characterImage: result.guessedCharacter.imageUrl,
          comparisons: result.comparisons as AttributeComparison[],
          timestamp: Number(g.timestamp),
        };
      });

      const isWon = processedGuesses.some((g) => g.isCorrect);

      // Récupérer le personnage du jour UNIQUEMENT si le joueur a gagné
      let dailyChar: Character | null = null;
      if (isWon) {
        const winningGuess = results.find((r: { isCorrect: boolean; dailyCharacter?: { id: number; name: string; imageUrl?: string } }) => r.isCorrect && r.dailyCharacter);
        if (winningGuess?.dailyCharacter) {
          dailyChar = {
            id: winningGuess.dailyCharacter.id,
            name: winningGuess.dailyCharacter.name,
            imageUrl: winningGuess.dailyCharacter.imageUrl,
            attributes: {},
          };
        }
      }

      setGameState((prev) => ({
        ...prev,
        guesses: processedGuesses,
        isGameWon: isWon,
        isGameOver: isWon,
        dailyCharacter: dailyChar,
        dailyCharacterHash: "",
      }));
    };

    fetchWithSignature().catch((err) => {
      console.error("Failed to compare guesses:", err);
    });
  }, [playerGuesses, collection.id, currentDay, address, getSignature]);

  return {
    ...gameState,
    refetch: useCallback(() => {
      lastProcessedGuessesRef.current = "";
      refetchPlayerGuesses();
      refetchAttempts();
    }, [refetchPlayerGuesses, refetchAttempts]),
  };
}

/**
 * Hook pour vérifier une proposition (view function)
 */
export function useVerifyGuess(collectionId: number, characterId: number) {
  const { data: isCorrect } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "verifyGuess",
    args: [BigInt(collectionId), BigInt(characterId)],
    chainId: baseSepolia.id, // Forcer Base
  });

  return isCorrect;
}

/**
 * Hook pour récupérer les statistiques de victoires d'un joueur
 */
export function usePlayerStats(address?: `0x${string}`) {
  const { data: totalWins } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTotalWins",
    args: address ? [address] : undefined,
    chainId: baseSepolia.id, // Forcer Base
    query: {
      enabled: !!address,
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  return {
    totalWins: totalWins ? Number(totalWins) : 0,
  };
}

/**
 * Hook pour récupérer le total global de toutes les victoires (tous utilisateurs, toutes collections)
 */
export function useGlobalTotalWins() {
  const { data: globalTotalWins } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getGlobalTotalWins",
    chainId: baseSepolia.id, // Forcer Base
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  return {
    globalTotalWins: globalTotalWins ? Number(globalTotalWins) : 0,
  };
}

/**
 * Hook pour récupérer les statistiques d'une collection
 */
export function useCollectionStats(collectionId: number) {
  const { address } = useAccount();
  const currentDay = getCurrentDay();

  // Nombre de victoires de l'utilisateur pour cette collection
  const { data: userWins } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getWinsPerCollection",
    args: address ? [address as `0x${string}`, BigInt(collectionId)] : undefined,
    chainId: baseSepolia.id, // Forcer Base
    query: {
      enabled: !!address,
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  // Nombre de personnes qui ont trouvé aujourd'hui
  const { data: winnersToday } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getWinnersTodayCount",
    args: [BigInt(collectionId), BigInt(currentDay)],
    chainId: baseSepolia.id, // Forcer Base
    query: {
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  // Nombre total de personnes qui ont trouvé de tous temps
  const { data: totalWinners } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTotalWinnersCount",
    args: [BigInt(collectionId)],
    chainId: baseSepolia.id, // Forcer Base
    query: {
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  return {
    userWins: userWins ? Number(userWins) : 0,
    winnersToday: winnersToday ? Number(winnersToday) : 0,
    totalWinners: totalWinners ? Number(totalWinners) : 0,
  };
}
