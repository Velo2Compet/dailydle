"use client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from "wagmi";
import { useCallback } from "react";
import { parseAbi } from "viem";
import { APP_CHAIN_ID } from "@/lib/chain-config";

const CACHE_TIME = 30 * 1000; // 30 seconds

const GAME_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

const WINNER_REWARDS_ABI = parseAbi([
  "function getCurrentDay() external view returns (uint256)",
  "function getPendingWinnerRewards(address _player, uint256 _day) external view returns (uint256)",
  "function getTotalPendingRewards(address _player, uint256 _maxDaysToCheck) external view returns (uint256 totalPending, uint256 unclaimedDaysCount)",
  "function playerTotalWinsPerDay(address player, uint256 day) external view returns (uint256)",
  "function claimedDays(address player, uint256 day) external view returns (bool)",
  "function dayFinalized(uint256) external view returns (bool)",
  "function claimWinnerRewards(uint256 _day) external",
  "function claimAllWinnerRewards(uint256 _maxDaysToCheck) external",
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
    chainId: APP_CHAIN_ID,
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
    chainId: APP_CHAIN_ID,
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
    functionName: "playerTotalWinsPerDay",
    args: address && day !== null ? [address, BigInt(day)] : undefined,
    chainId: APP_CHAIN_ID,
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
    functionName: "claimedDays",
    args: address && day !== null ? [address, BigInt(day)] : undefined,
    chainId: APP_CHAIN_ID,
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
    chainId: APP_CHAIN_ID,
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
    chainId: APP_CHAIN_ID,
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

    if (chainId !== APP_CHAIN_ID) {
      try {
        await switchChain({ chainId: APP_CHAIN_ID });
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
      chainId: APP_CHAIN_ID,
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

/**
 * Hook to get total pending rewards across all unclaimed days
 */
export function useTotalPendingRewards(maxDaysToCheck: number = 30) {
  const { address, isConnected } = useAccount();
  const enabled = !!address && isConnected && GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

  const { data, refetch } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: WINNER_REWARDS_ABI,
    functionName: "getTotalPendingRewards",
    args: address ? [address, BigInt(maxDaysToCheck)] : undefined,
    chainId: APP_CHAIN_ID,
    query: {
      enabled,
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  return {
    totalPending: data ? BigInt(data[0].toString()) : BigInt(0),
    unclaimedDaysCount: data ? Number(data[1]) : 0,
    refetch,
  };
}

/**
 * Hook to claim all unclaimed winner rewards in one transaction
 */
export function useClaimAllWinnerRewards() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const claimAll = useCallback(async (maxDaysToCheck: number = 30) => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    if (chainId !== APP_CHAIN_ID) {
      try {
        await switchChain({ chainId: APP_CHAIN_ID });
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch {
        throw new Error("Please switch to Base Sepolia network");
      }
    }

    return writeContract({
      address: GAME_CONTRACT_ADDRESS,
      abi: WINNER_REWARDS_ABI,
      functionName: "claimAllWinnerRewards",
      args: [BigInt(maxDaysToCheck)],
      chainId: APP_CHAIN_ID,
    });
  }, [writeContract, address, chainId, switchChain]);

  return {
    claimAll,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}
