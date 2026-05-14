"use client";

import { useCallback } from "react";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { parseAbi } from "viem";
import { APP_CHAIN_ID } from "@/lib/chain-config";

const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

const ABI = parseAbi([
  "function feePerGuess() external view returns (uint256)",
  "function setFee(uint256 _fee) external",
]);

/**
 * Read the contract's current per-guess fee (in wei).
 *
 * Anyone can read it; the value matters most to the owner UI because
 * raising it is the simplest way to make on-chain brute-forcing of a
 * daily collection uneconomic.
 */
export function useFeePerGuess() {
  const { data, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: "feePerGuess",
    chainId: APP_CHAIN_ID,
    query: {
      enabled:
        CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    },
  });
  return {
    fee: (data as bigint | undefined) ?? BigInt(0),
    refetch,
  };
}

/**
 * Owner-only write: set a new per-guess fee. The contract reverts for
 * non-owner callers, so this hook can be wired up unconditionally; the
 * caller decides whether to render the UI.
 */
export function useSetFee() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error, reset } =
    useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  const setFee = useCallback(
    async (newFeeWei: bigint) => {
      if (chainId !== APP_CHAIN_ID) {
        try {
          await switchChain({ chainId: APP_CHAIN_ID });
        } catch {
          throw new Error("Please switch to the game's network");
        }
      }
      return writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "setFee",
        args: [newFeeWei],
        chainId: APP_CHAIN_ID,
      });
    },
    [writeContract, chainId, switchChain]
  );

  return {
    setFee,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    reset,
  };
}
