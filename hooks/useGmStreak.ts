"use client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from "wagmi";
import { useCallback } from "react";
import { parseAbi } from "viem";
import { baseSepolia } from "wagmi/chains";

// Cache settings
const CACHE_TIME = 30 * 1000; // 30 seconds

const GM_CONTRACT_ABI = parseAbi([
  "function gm() external",
  "function canGmToday(address _player) external view returns (bool)",
  "function isStreakActive(address _player) external view returns (bool)",
  "function getEffectiveStreak(address _player) external view returns (uint256)",
  "function getPlayerStats(address _player) external view returns (uint256 streak, uint256 longest, uint256 total, bool canGm, bool streakActive)",
  "function getGlobalStats() external view returns (uint256 totalGms_, uint256 uniquePlayers_)",
  "function currentStreak(address) external view returns (uint256)",
  "function longestStreak(address) external view returns (uint256)",
  "function totalGms(address) external view returns (uint256)",
]);

const GM_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_GM_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

/**
 * Hook pour envoyer un GM
 */
export function useSendGm() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const sendGm = useCallback(async () => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    // Vérifier et forcer Base Sepolia
    if (chainId !== baseSepolia.id) {
      try {
        await switchChain({ chainId: baseSepolia.id });
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch {
        throw new Error("Please switch to Base Sepolia network");
      }
    }

    return writeContract({
      address: GM_CONTRACT_ADDRESS,
      abi: GM_CONTRACT_ABI,
      functionName: "gm",
      chainId: baseSepolia.id,
    });
  }, [writeContract, address, chainId, switchChain]);

  return {
    sendGm,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

/**
 * Hook pour récupérer les stats de streak d'un joueur
 */
export function useGmStats() {
  const { address, isConnected } = useAccount();

  const { data: playerStats, refetch } = useReadContract({
    address: GM_CONTRACT_ADDRESS,
    abi: GM_CONTRACT_ABI,
    functionName: "getPlayerStats",
    args: address ? [address] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: !!address && isConnected && GM_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
    },
  });

  const { data: globalStats } = useReadContract({
    address: GM_CONTRACT_ADDRESS,
    abi: GM_CONTRACT_ABI,
    functionName: "getGlobalStats",
    chainId: baseSepolia.id,
    query: {
      enabled: GM_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
    },
  });

  // Déstructurer les résultats
  const [streak, longest, total, canGm, streakActive] = playerStats || [BigInt(0), BigInt(0), BigInt(0), true, false];
  const [totalGmsGlobal, uniquePlayers] = globalStats || [BigInt(0), BigInt(0)];

  return {
    // Stats du joueur
    streak: Number(streak),
    longestStreak: Number(longest),
    totalGms: Number(total),
    canGmToday: Boolean(canGm),
    isStreakActive: Boolean(streakActive),
    // Stats globales
    totalGmsGlobal: Number(totalGmsGlobal),
    uniquePlayers: Number(uniquePlayers),
    // Utils
    isConnected,
    refetch,
    contractEnabled: GM_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
  };
}
