"use client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from "wagmi";
import { useState, useEffect, useCallback } from "react";
// Note: useCallback still needed for refetch
import { parseAbi } from "viem";
import { baseSepolia } from "wagmi/chains";
import { GameState, GuessResult, Character, Collection } from "@/types/game";
import { getDailyCharacter, hashCharacter, compareAttributes, getCurrentDay } from "@/utils/game";

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
 */
export function useGameState(collection: Collection) {
  const { address } = useAccount();
  const [gameState, setGameState] = useState<GameState>({
    collectionId: collection.id,
    dailyCharacter: null,
    dailyCharacterHash: "",
    attempts: 0,
    maxAttempts: 0, // Plus de limite
    guesses: [],
    isGameOver: false,
    isGameWon: false,
  });

  const currentDay = getCurrentDay();

  // Récupérer le personnage du jour depuis l'API server-side (salt-based)
  const [dailyCharacterId, setDailyCharacterId] = useState<bigint | null>(null);

  useEffect(() => {
    if (!collection.id) return;

    fetch(`/api/daily-character?collectionId=${collection.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.dailyCharacterId) {
          setDailyCharacterId(BigInt(data.dailyCharacterId));
        }
      })
      .catch((err) => console.error("Failed to fetch daily character:", err));
  }, [collection.id]);

  // Récupérer le nombre de tentatives
  const { data: attempts, refetch: refetchAttempts } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getAttempts",
    args: address ? [address as `0x${string}`, BigInt(collection.id), BigInt(currentDay)] : undefined,
    chainId: baseSepolia.id, // Forcer Base
    query: {
      enabled: !!address,
      staleTime: 30 * 1000, // 30 seconds for attempts (more dynamic)
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
    chainId: baseSepolia.id, // Forcer Base
    query: {
      enabled: !!address,
      staleTime: 30 * 1000, // 30 seconds for guesses (more dynamic)
      refetchInterval: false,
      refetchOnWindowFocus: false,
    },
  });

  // Mettre à jour l'état avec les données on-chain
  // Le nombre de tentatives vient directement du contrat (getAttempts)
  useEffect(() => {
    if (attempts !== undefined) {
      setGameState((prev) => ({
        ...prev,
        attempts: Number(attempts), // Compteur on-chain pour ce jour et cette collection
        // Plus de limite de tentatives, isGameOver sera true uniquement si le joueur a gagné
      }));
    }
  }, [attempts]);

  // Traiter les propositions précédentes
  // Les personnages sont maintenant chargés côté serveur via ?q=all
  useEffect(() => {
    if (!playerGuesses || !dailyCharacterId) return;

    // Récupérer le personnage du jour depuis la collection locale
    const dailyCharId = Number(dailyCharacterId);
    const dailyChar = collection.characters?.find((c) => c.id === dailyCharId) || null;

    console.log("Daily character:", dailyChar?.name || "NOT FOUND", "ID:", dailyCharId);

    // Filtrer les guesses d'aujourd'hui
    const todayGuessesRaw = (playerGuesses as any[]).filter((g) => {
      const guessDay = Math.floor(Number(g.timestamp) / 86400);
      return guessDay === currentDay;
    });

    // Traiter chaque guess avec les personnages locaux
    const processedGuesses: GuessResult[] = todayGuessesRaw.map((g) => {
      const charId = Number(g.characterId);
      const guessChar = collection.characters?.find((c) => c.id === charId) || null;

      console.log(`Character ${charId}:`, guessChar?.name || "NOT FOUND");

      // Calculer les comparaisons
      const comparisons = (guessChar && dailyChar)
        ? compareAttributes(guessChar, dailyChar, collection.attributes)
        : [];

      console.log(`Comparisons for ${charId}:`, comparisons.length);

      return {
        isCorrect: g.isCorrect,
        attempts: charId,
        characterId: charId,
        characterName: guessChar?.name ?? `Character #${charId}`,
        characterImage: guessChar?.imageUrl,
        comparisons,
        timestamp: Number(g.timestamp),
      };
    });

    const isWon = processedGuesses.some((g) => g.isCorrect);

    setGameState((prev) => ({
      ...prev,
      guesses: processedGuesses,
      isGameWon: isWon,
      isGameOver: isWon,
      dailyCharacter: dailyChar,
      dailyCharacterHash: dailyChar ? hashCharacter(dailyChar) : "",
    }));
  }, [playerGuesses, dailyCharacterId, collection, currentDay]);

  return {
    ...gameState,
    refetch: useCallback(() => {
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
 * Hook pour récupérer le personnage du jour
 */
export function useDailyCharacter(collection: Collection) {
  const [dailyCharacter, setDailyCharacter] = useState<Character | null>(null);

  useEffect(() => {
    const characters = collection?.characters ?? [];
    if (characters.length === 0) {
      setDailyCharacter(null);
      return;
    }

    const char = getDailyCharacter(collection);
    setDailyCharacter(char);
  }, [collection]);

  return dailyCharacter;
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
