"use client";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from "wagmi";
import { useCallback } from "react";
import { parseAbi } from "viem";
import { baseSepolia } from "wagmi/chains";

const CACHE_TIME = 30 * 1000; // 30 seconds

const REFERAL_CONTRACT_ABI = parseAbi([
  "function setReferralCode(string calldata _code) external",
  "function registerWithReferral(string calldata _referralCode) external",
  "function isCodeAvailable(string calldata _code) external view returns (bool)",
  "function getReferralCount(address _user) external view returns (uint256)",
  "function getUserReferrals(address _user) external view returns (address[] memory)",
  "function getUserStats(address _user) external view returns (string memory code, address referrer, uint256 referralCount, bool registered)",
  "function getGlobalStats() external view returns (uint256 totalUsers_, uint256 totalReferrals_)",
  "function codeToAddress(string) external view returns (address)",
  "function addressToCode(address) external view returns (string)",
]);

const REFERAL_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

/**
 * Hook to set a referral code
 */
export function useSetReferralCode() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const setCode = useCallback(async (code: string) => {
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
      address: REFERAL_CONTRACT_ADDRESS,
      abi: REFERAL_CONTRACT_ABI,
      functionName: "setReferralCode",
      args: [code],
      chainId: baseSepolia.id,
    });
  }, [writeContract, address, chainId, switchChain]);

  return {
    setCode,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

/**
 * Hook to register with a referral code
 */
export function useRegisterWithReferral() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const register = useCallback(async (referralCode: string = "") => {
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
      address: REFERAL_CONTRACT_ADDRESS,
      abi: REFERAL_CONTRACT_ABI,
      functionName: "registerWithReferral",
      args: [referralCode],
      chainId: baseSepolia.id,
    });
  }, [writeContract, address, chainId, switchChain]);

  return {
    register,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

/**
 * Hook to get user referral stats
 */
export function useReferalStats() {
  const { address, isConnected } = useAccount();

  const { data: userStats, refetch } = useReadContract({
    address: REFERAL_CONTRACT_ADDRESS,
    abi: REFERAL_CONTRACT_ABI,
    functionName: "getUserStats",
    args: address ? [address] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: !!address && isConnected && REFERAL_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
    },
  });

  const { data: globalStats } = useReadContract({
    address: REFERAL_CONTRACT_ADDRESS,
    abi: REFERAL_CONTRACT_ABI,
    functionName: "getGlobalStats",
    chainId: baseSepolia.id,
    query: {
      enabled: REFERAL_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
    },
  });

  // Destructure results
  const [code, referrer, referralCount, registered] = userStats || ["", "0x0000000000000000000000000000000000000000", BigInt(0), false];
  const [totalUsers, totalReferrals] = globalStats || [BigInt(0), BigInt(0)];

  return {
    // User stats
    referralCode: code as string,
    referredBy: referrer as `0x${string}`,
    referralCount: Number(referralCount),
    isRegistered: Boolean(registered),
    // Global stats
    totalUsers: Number(totalUsers),
    totalReferrals: Number(totalReferrals),
    // Utils
    isConnected,
    refetch,
    contractEnabled: REFERAL_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
  };
}

/**
 * Hook to check if a code is available
 */
export function useIsCodeAvailable(code: string) {
  const { data: isAvailable } = useReadContract({
    address: REFERAL_CONTRACT_ADDRESS,
    abi: REFERAL_CONTRACT_ABI,
    functionName: "isCodeAvailable",
    args: [code],
    chainId: baseSepolia.id,
    query: {
      enabled: code.length >= 3 && REFERAL_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: 5000,
    },
  });

  return isAvailable as boolean | undefined;
}
