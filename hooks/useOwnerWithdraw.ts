"use client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from "wagmi";
import { useCallback } from "react";
import { parseAbi } from "viem";
import { APP_CHAIN_ID } from "@/lib/chain-config";

const CACHE_TIME = 5 * 1000; // 5 seconds - faster refresh for accurate reserve data

const GAME_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

const OWNER_ABI = parseAbi([
  "function owner() external view returns (address)",
  "function withdraw(address payable _to) external",
  "function emergencyWithdraw(address payable _to) external",
  "function getTotalReserved() external view returns (uint256 totalReserved, uint256 reservedForReferrals, uint256 reservedForWinners, uint256 reservedForUnfinalized)",
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
    chainId: APP_CHAIN_ID,
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
 * Uses the contract's getTotalReserved() which includes unfinalized daily revenue
 */
export function useOwnerWithdrawableAmount() {
  const { isOwner } = useIsOwner();

  const { data: reserveData, refetch } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: OWNER_ABI,
    functionName: "getTotalReserved",
    chainId: APP_CHAIN_ID,
    query: {
      enabled: isOwner && GAME_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
    },
  });

  // reserveData = [totalReserved, reservedForReferrals, reservedForWinners, reservedForUnfinalized]
  const totalReserved = reserveData ? BigInt(reserveData[0].toString()) : BigInt(0);
  const reservedForReferrals = reserveData ? BigInt(reserveData[1].toString()) : BigInt(0);
  const reservedForWinners = reserveData ? BigInt(reserveData[2].toString()) : BigInt(0);
  const reservedForUnfinalized = reserveData ? BigInt(reserveData[3].toString()) : BigInt(0);

  return {
    totalReserved,
    reservedForReferrals,
    reservedForWinners,
    reservedForUnfinalized,
    refetch,
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

    if (chainId !== APP_CHAIN_ID) {
      try {
        await switchChain({ chainId: APP_CHAIN_ID });
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
      chainId: APP_CHAIN_ID,
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

/**
 * Hook to emergency withdraw ALL funds as owner (ignores reserves)
 */
export function useEmergencyWithdraw() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const emergencyWithdraw = useCallback(async (to?: `0x${string}`) => {
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

    // Default to withdrawing to connected address
    const withdrawTo = to || address;

    return writeContract({
      address: GAME_CONTRACT_ADDRESS,
      abi: OWNER_ABI,
      functionName: "emergencyWithdraw",
      args: [withdrawTo],
      chainId: APP_CHAIN_ID,
    });
  }, [writeContract, address, chainId, switchChain]);

  return {
    emergencyWithdraw,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}
