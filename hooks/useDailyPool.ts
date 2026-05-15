"use client";

import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi, parseEther } from "viem";
import { APP_CHAIN_ID } from "@/lib/chain-config";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";
const CACHE_TIME = 30 * 1000;

const POOL_ABI = parseAbi([
  "function getCurrentDay() external view returns (uint256)",
  "function getDayPool(uint256 _day) external view returns (uint256 totalPool, uint256 winnersPool, bool isFinalized, uint256 totalWins)",
  "function getTomorrowPool() external view returns (uint256 totalPool, uint256 winnersPool, uint256 day)",
  "function addDailyBonus(uint256 _day) external payable",
  "function addBonusForTomorrow() external payable",
]);

/**
 * Daily pool view. Mirrors the contract's day index (`block.timestamp/86400`)
 * with the client clock instead of an extra RPC call — the two are within
 * a few seconds of each other on Base, and the contract is the source of
 * truth for any actual write. This removes the chained `getCurrentDay`
 * roundtrip and packs the three remaining reads (today, yesterday,
 * tomorrow) into a single Multicall3 via `useReadContracts`.
 *
 * Was: 4 separate eth_call. Now: 1 multicall.
 */
export function useDailyPool() {
  const { isConnected } = useAccount();
  const enabled = isConnected && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

  // Client-derived day index; OK because we only use it to fetch read-only
  // pool views — the contract validates `_day` itself on writes.
  const currentDay = BigInt(Math.floor(Date.now() / 1000 / 86400));

  const { data, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACT_ADDRESS,
        abi: POOL_ABI,
        functionName: "getDayPool",
        args: [currentDay],
        chainId: APP_CHAIN_ID,
      },
      {
        address: CONTRACT_ADDRESS,
        abi: POOL_ABI,
        functionName: "getDayPool",
        args: [currentDay - BigInt(1)],
        chainId: APP_CHAIN_ID,
      },
      {
        address: CONTRACT_ADDRESS,
        abi: POOL_ABI,
        functionName: "getTomorrowPool",
        chainId: APP_CHAIN_ID,
      },
    ],
    allowFailure: true,
    query: {
      enabled,
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
    },
  });

  const todayResult = data?.[0]?.status === "success"
    ? (data[0].result as readonly [bigint, bigint, boolean, bigint])
    : null;
  const yesterdayResult = data?.[1]?.status === "success"
    ? (data[1].result as readonly [bigint, bigint, boolean, bigint])
    : null;
  const tomorrowResult = data?.[2]?.status === "success"
    ? (data[2].result as readonly [bigint, bigint, bigint])
    : null;

  return {
    currentDay,
    today: {
      day: currentDay,
      totalPool: todayResult?.[0] ?? BigInt(0),
      winnersPool: todayResult?.[1] ?? BigInt(0),
      isFinalized: todayResult?.[2] ?? false,
      totalWins: Number(todayResult?.[3] ?? 0),
    },
    yesterday: {
      day: currentDay - BigInt(1),
      totalPool: yesterdayResult?.[0] ?? BigInt(0),
      winnersPool: yesterdayResult?.[1] ?? BigInt(0),
      isFinalized: yesterdayResult?.[2] ?? false,
      totalWins: Number(yesterdayResult?.[3] ?? 0),
    },
    tomorrow: {
      day: tomorrowResult?.[2] ?? BigInt(0),
      totalPool: tomorrowResult?.[0] ?? BigInt(0),
      winnersPool: tomorrowResult?.[1] ?? BigInt(0),
    },
    refetch,
  };
}

export function useAddDailyBonus() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Client-derived day index. Was previously an RPC call to getCurrentDay()
  // just so addBonusForToday could pass the right arg — but the math is
  // identical (`block.timestamp / 86400`) and the contract validates _day
  // itself, so we skip the roundtrip.
  const currentDay = BigInt(Math.floor(Date.now() / 1000 / 86400));

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
