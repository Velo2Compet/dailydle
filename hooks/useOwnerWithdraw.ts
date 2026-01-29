"use client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from "wagmi";
import { useCallback } from "react";
import { parseAbi } from "viem";
import { baseSepolia } from "wagmi/chains";

const CACHE_TIME = 30 * 1000; // 30 seconds

const GAME_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

const OWNER_ABI = parseAbi([
  "function owner() external view returns (address)",
  "function withdraw(address payable _to) external",
  "function totalReferralRewards() external view returns (uint256)",
  "function totalReferralsClaimed() external view returns (uint256)",
  "function totalWinnerRewardsDistributed() external view returns (uint256)",
  "function totalWinnerRewardsClaimed() external view returns (uint256)",
]);

/**
 * Hook to check if connected user is the owner
 */
export function useIsOwner() {
  const { address, isConnected } = useAccount();

  const { data: ownerAddress } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: OWNER_ABI,
    functionName: "owner",
    chainId: baseSepolia.id,
    query: {
      enabled: GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
    },
  });

  const isOwner = address && ownerAddress && address.toLowerCase() === ownerAddress.toLowerCase();

  return {
    isOwner: Boolean(isOwner),
    ownerAddress,
    isConnected,
  };
}

/**
 * Hook to get withdrawable amount for owner
 */
export function useOwnerWithdrawableAmount() {
  const { address, isConnected } = useAccount();
  const { isOwner } = useIsOwner();

  // Get contract balance
  const { data: contractBalance, refetch: refetchBalance } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: parseAbi(["function getBalance() external view returns (uint256)"]),
    functionName: "getBalance",
    chainId: baseSepolia.id,
    query: {
      enabled: false, // We'll use provider.getBalance instead
    },
  });

  // Get reserves
  const { data: totalReferralRewards, refetch: refetchReferralRewards } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: OWNER_ABI,
    functionName: "totalReferralRewards",
    chainId: baseSepolia.id,
    query: {
      enabled: isOwner && GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  const { data: totalReferralsClaimed, refetch: refetchReferralsClaimed } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: OWNER_ABI,
    functionName: "totalReferralsClaimed",
    chainId: baseSepolia.id,
    query: {
      enabled: isOwner && GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  const { data: totalWinnerRewardsDistributed, refetch: refetchWinnerDistributed } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: OWNER_ABI,
    functionName: "totalWinnerRewardsDistributed",
    chainId: baseSepolia.id,
    query: {
      enabled: isOwner && GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  const { data: totalWinnerRewardsClaimed, refetch: refetchWinnerClaimed } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: OWNER_ABI,
    functionName: "totalWinnerRewardsClaimed",
    chainId: baseSepolia.id,
    query: {
      enabled: isOwner && GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: true,
    },
  });

  // Calculate reserves and withdrawable amount
  const reservedForReferrals = totalReferralRewards && totalReferralsClaimed
    ? totalReferralRewards - totalReferralsClaimed
    : BigInt(0);

  const reservedForWinners = totalWinnerRewardsDistributed && totalWinnerRewardsClaimed
    ? totalWinnerRewardsDistributed - totalWinnerRewardsClaimed
    : BigInt(0);

  const totalReserved = reservedForReferrals + reservedForWinners;

  // We need to get the actual contract balance from the provider
  // This will be handled in the component using useBalance or similar

  const refetchAll = useCallback(() => {
    refetchReferralRewards();
    refetchReferralsClaimed();
    refetchWinnerDistributed();
    refetchWinnerClaimed();
  }, [refetchReferralRewards, refetchReferralsClaimed, refetchWinnerDistributed, refetchWinnerClaimed]);

  return {
    reservedForReferrals,
    reservedForWinners,
    totalReserved,
    refetch: refetchAll,
  };
}

/**
 * Hook to withdraw funds as owner
 */
export function useOwnerWithdraw() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const withdraw = useCallback(async (to?: `0x${string}`) => {
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

    // Default to withdrawing to connected address
    const withdrawTo = to || address;

    return writeContract({
      address: GAME_CONTRACT_ADDRESS,
      abi: OWNER_ABI,
      functionName: "withdraw",
      args: [withdrawTo],
      chainId: baseSepolia.id,
    });
  }, [writeContract, address, chainId, switchChain]);

  return {
    withdraw,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}
