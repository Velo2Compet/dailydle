"use client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from "wagmi";
import { useState, useEffect, useCallback } from "react";
import { parseAbi } from "viem";
import { base } from "wagmi/chains";
import { GameState, GuessResult, Character, Collection } from "@/types/game";
import { getDailyCharacter, hashCharacter, compareAttributes, getCurrentDay } from "@/utils/game";

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
    chainId: base.id, // Forcer Base pour la lecture
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
    },
  });

  const makeGuess = useCallback(
    async (collectionId: number, characterId: number) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      // Vérifier et forcer Base (chainId 8453)
      if (chainId !== base.id) {
        try {
          await switchChain({ chainId: base.id });
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
        chainId: base.id, // Forcer Base explicitement
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

  // Récupérer le personnage du jour depuis le contrat (calculé on-chain)
  const { data: dailyCharacterId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getDailyCharacterId",
    args: [BigInt(collection.id)],
    chainId: base.id, // Forcer Base
    query: {
      enabled: !!collection.id,
    },
  });

  // Récupérer le nombre de tentatives
  const { data: attempts, refetch: refetchAttempts } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getAttempts",
    args: address ? [address as `0x${string}`, BigInt(collection.id), BigInt(currentDay)] : undefined,
    chainId: base.id, // Forcer Base
    query: {
      enabled: !!address,
      refetchInterval: false,
    },
  });

  // Récupérer les propositions précédentes
  const { data: playerGuesses, refetch: refetchPlayerGuesses } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getPlayerGuesses",
    args: address ? [address as `0x${string}`, BigInt(collection.id)] : undefined,
    chainId: base.id, // Forcer Base
    query: {
      enabled: !!address,
      refetchInterval: false, // Pas de polling automatique
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
  // Le personnage du jour vient maintenant du contrat (calculé on-chain)
  useEffect(() => {
    if (playerGuesses && dailyCharacterId) {
      const characters = collection.characters ?? [];

      // Récupérer le personnage du jour depuis la collection (basé sur l'ID du contrat)
      const dailyChar = characters.find((c) => c.id === Number(dailyCharacterId));

      const todayGuesses = (playerGuesses as any[])
        .filter((g) => {
          const guessDay = Math.floor(Number(g.timestamp) / 86400);
          return guessDay === currentDay;
        })
        .map((g) => {
          const guessChar = characters.find((c) => c.id === Number(g.characterId));

          // Si on n'a pas les données du personnage, créer un résultat minimal
          const comparisons = (guessChar && dailyChar)
            ? compareAttributes(guessChar, dailyChar, collection.attributes)
            : [];

          return {
            isCorrect: g.isCorrect, // Vient du contrat, calculé on-chain
            attempts: Number(g.characterId),
            characterId: Number(g.characterId),
            characterName: guessChar?.name ?? `Character #${g.characterId}`,
            comparisons,
            timestamp: Number(g.timestamp),
          } as GuessResult;
        });

      const isWon = todayGuesses.some((g) => g.isCorrect);

      setGameState((prev) => ({
        ...prev,
        guesses: todayGuesses,
        isGameWon: isWon,
        isGameOver: isWon, // Game over uniquement si le joueur a gagné
        // Stocker le personnage du jour (récupéré depuis le contrat)
        dailyCharacter: dailyChar ?? null,
        dailyCharacterHash: dailyChar ? hashCharacter(dailyChar) : "",
      }));
    }
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
    chainId: base.id, // Forcer Base
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
    chainId: base.id, // Forcer Base
    query: {
      enabled: !!address,
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
    chainId: base.id, // Forcer Base
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
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
    chainId: base.id, // Forcer Base
    query: {
      enabled: !!address,
    },
  });

  // Nombre de personnes qui ont trouvé aujourd'hui
  const { data: winnersToday } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getWinnersTodayCount",
    args: [BigInt(collectionId), BigInt(currentDay)],
    chainId: base.id, // Forcer Base
  });

  // Nombre total de personnes qui ont trouvé de tous temps
  const { data: totalWinners } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTotalWinnersCount",
    args: [BigInt(collectionId)],
    chainId: base.id, // Forcer Base
  });

  return {
    userWins: userWins ? Number(userWins) : 0,
    winnersToday: winnersToday ? Number(winnersToday) : 0,
    totalWinners: totalWinners ? Number(totalWinners) : 0,
  };
}
