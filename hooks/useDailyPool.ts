"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi, parseEther } from "viem";
import { APP_CHAIN_ID } from "@/lib/chain-config";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

const POOL_ABI = parseAbi([
  "function getCurrentDay() external view returns (uint256)",
  "function getDayPool(uint256 _day) external view returns (uint256 totalPool, uint256 winnersPool, bool isFinalized, uint256 totalWins)",
  "function getTomorrowPool() external view returns (uint256 totalPool, uint256 winnersPool, uint256 day)",
  "function addDailyBonus(uint256 _day) external payable",
  "function addBonusForTomorrow() external payable",
]);

export function useDailyPool() {
  const { address, isConnected } = useAccount();

  // Get current day
  const { data: currentDay } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: POOL_ABI,
    functionName: "getCurrentDay",
    chainId: APP_CHAIN_ID,
    query: {
      enabled: isConnected && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
    },
  });

  // Get today's pool
  const { data: todayPoolData, refetch: refetchTodayPool } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: POOL_ABI,
    functionName: "getDayPool",
    args: currentDay ? [currentDay] : undefined,
    chainId: APP_CHAIN_ID,
    query: {
      enabled: isConnected && !!currentDay && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
    },
  });

  // Get yesterday's pool
  const { data: yesterdayPoolData, refetch: refetchYesterdayPool } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: POOL_ABI,
    functionName: "getDayPool",
    args: currentDay ? [currentDay - BigInt(1)] : undefined,
    chainId: APP_CHAIN_ID,
    query: {
      enabled: isConnected && !!currentDay && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
    },
  });

  // Get tomorrow's pool
  const { data: tomorrowPoolData, refetch: refetchTomorrowPool } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: POOL_ABI,
    functionName: "getTomorrowPool",
    chainId: APP_CHAIN_ID,
    query: {
      enabled: isConnected && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
    },
  });

  const refetchAll = () => {
    refetchTodayPool();
    refetchYesterdayPool();
    refetchTomorrowPool();
  };

  return {
    currentDay: currentDay || BigInt(0),
    today: {
      day: currentDay || BigInt(0),
      totalPool: todayPoolData?.[0] || BigInt(0),
      winnersPool: todayPoolData?.[1] || BigInt(0),
      isFinalized: todayPoolData?.[2] || false,
      totalWins: Number(todayPoolData?.[3] || 0),
    },
    yesterday: {
      day: currentDay ? currentDay - BigInt(1) : BigInt(0),
      totalPool: yesterdayPoolData?.[0] || BigInt(0),
      winnersPool: yesterdayPoolData?.[1] || BigInt(0),
      isFinalized: yesterdayPoolData?.[2] || false,
      totalWins: Number(yesterdayPoolData?.[3] || 0),
    },
    tomorrow: {
      day: tomorrowPoolData?.[2] || BigInt(0),
      totalPool: tomorrowPoolData?.[0] || BigInt(0),
      winnersPool: tomorrowPoolData?.[1] || BigInt(0),
    },
    refetch: refetchAll,
  };
}

export function useAddDailyBonus() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Get current day for addBonusForToday
  const { data: currentDay } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: POOL_ABI,
    functionName: "getCurrentDay",
    chainId: APP_CHAIN_ID,
  });

  const addBonus = (day: bigint, amountEth: string) => {
    const value = parseEther(amountEth);
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: POOL_ABI,
      functionName: "addDailyBonus",
      args: [day],
      value,
      chainId: APP_CHAIN_ID,
    });
  };

  // Add bonus to TODAY's pool (redistributed tomorrow to today's winners)
  const addBonusForToday = (amountEth: string) => {
    if (!currentDay) {
      console.error("Current day not loaded");
      return;
    }
    const value = parseEther(amountEth);
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: POOL_ABI,
      functionName: "addDailyBonus",
      args: [currentDay],
      value,
      chainId: APP_CHAIN_ID,
    });
  };

  const addBonusForTomorrow = (amountEth: string) => {
    const value = parseEther(amountEth);
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: POOL_ABI,
      functionName: "addBonusForTomorrow",
      value,
      chainId: APP_CHAIN_ID,
    });
  };

  return {
    addBonus,
    addBonusForToday,
    addBonusForTomorrow,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
    currentDay,
  };
}
