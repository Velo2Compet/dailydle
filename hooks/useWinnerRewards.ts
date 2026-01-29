"use client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from "wagmi";
import { useCallback } from "react";
import { parseAbi } from "viem";
import { baseSepolia } from "wagmi/chains";

const CACHE_TIME = 30 * 1000; // 30 seconds

const GAME_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

const WINNER_REWARDS_ABI = parseAbi([
  "function getCurrentDay() external view returns (uint256)",
  "function getPendingWinnerRewards(address _player, uint256 _day) external view returns (uint256)",
  "function getPlayerWinsForDay(address _player, uint256 _day) external view returns (uint256)",
  "function hasClaimedDay(address _player, uint256 _day) external view returns (bool)",
  "function dayFinalized(uint256) external view returns (bool)",
  "function claimWinnerRewards(uint256 _day) external",
  "function rewardPerWinPerDay(uint256) external view returns (uint256)",
  "function totalWinsPerDay(uint256) external view returns (uint256)",
  "function dailyRevenue(uint256) external view returns (uint256)",
]);

/**
 * Hook to get current day from contract
 */
export function useCurrentDay() {
  const { data: currentDay } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: WINNER_REWARDS_ABI,
    functionName: "getCurrentDay",
    chainId: baseSepolia.id,
    query: {
      enabled: GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  return currentDay ? Number(currentDay) : null;
}

/**
 * Hook to get winner rewards data for a specific day
 */
export function useWinnerRewardsForDay(day: number | null) {
  const { address, isConnected } = useAccount();
  const enabled = !!address && isConnected && day !== null && GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

  // Get pending rewards for the day
  const { data: pendingRewards, refetch: refetchPending } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: WINNER_REWARDS_ABI,
    functionName: "getPendingWinnerRewards",
    args: address && day !== null ? [address, BigInt(day)] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled,
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  // Get player wins for the day
  const { data: playerWins, refetch: refetchWins } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: WINNER_REWARDS_ABI,
    functionName: "getPlayerWinsForDay",
    args: address && day !== null ? [address, BigInt(day)] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled,
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  // Check if already claimed
  const { data: hasClaimed, refetch: refetchClaimed } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: WINNER_REWARDS_ABI,
    functionName: "hasClaimedDay",
    args: address && day !== null ? [address, BigInt(day)] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled,
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  // Check if day is finalized
  const { data: isFinalized, refetch: refetchFinalized } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: WINNER_REWARDS_ABI,
    functionName: "dayFinalized",
    args: day !== null ? [BigInt(day)] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: day !== null && GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  // Get reward per win for the day (for display)
  const { data: rewardPerWin } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: WINNER_REWARDS_ABI,
    functionName: "rewardPerWinPerDay",
    args: day !== null ? [BigInt(day)] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: day !== null && GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  const refetchAll = useCallback(() => {
    refetchPending();
    refetchWins();
    refetchClaimed();
    refetchFinalized();
  }, [refetchPending, refetchWins, refetchClaimed, refetchFinalized]);

  return {
    pendingRewards: pendingRewards ? BigInt(pendingRewards.toString()) : BigInt(0),
    playerWins: playerWins ? Number(playerWins) : 0,
    hasClaimed: Boolean(hasClaimed),
    isFinalized: Boolean(isFinalized),
    rewardPerWin: rewardPerWin ? BigInt(rewardPerWin.toString()) : BigInt(0),
    refetch: refetchAll,
  };
}

/**
 * Hook to get yesterday's and today's wins
 */
export function usePlayerWinsYesterdayAndToday() {
  const currentDay = useCurrentDay();

  const yesterday = currentDay !== null ? currentDay - 1 : null;
  const today = currentDay;

  const yesterdayData = useWinnerRewardsForDay(yesterday);
  const todayData = useWinnerRewardsForDay(today);

  return {
    currentDay,
    yesterday: {
      day: yesterday,
      wins: yesterdayData.playerWins,
      pendingRewards: yesterdayData.pendingRewards,
      hasClaimed: yesterdayData.hasClaimed,
      isFinalized: yesterdayData.isFinalized,
      rewardPerWin: yesterdayData.rewardPerWin,
    },
    today: {
      day: today,
      wins: todayData.playerWins,
    },
    refetch: () => {
      yesterdayData.refetch();
      todayData.refetch();
    },
  };
}

/**
 * Hook to claim winner rewards for a specific day
 */
export function useClaimWinnerRewards() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const claim = useCallback(async (day: number) => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    if (chainId !== baseSepolia.id) {
      try {
        await switchChain({ chainId: baseSepolia.id });
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch {
        throw new Error("Please switch to Base Sepolia network");
      }
    }

    return writeContract({
      address: GAME_CONTRACT_ADDRESS,
      abi: WINNER_REWARDS_ABI,
      functionName: "claimWinnerRewards",
      args: [BigInt(day)],
      chainId: baseSepolia.id,
    });
  }, [writeContract, address, chainId, switchChain]);

  return {
    claim,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}
