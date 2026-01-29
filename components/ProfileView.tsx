"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useDisconnect, useBalance } from "wagmi";
import { useRouter } from "next/navigation";
import { parseAbi } from "viem";
import { baseSepolia } from "wagmi/chains";
import { useGmStats } from "@/hooks/useGmStreak";
import { useReferalStats, useSetReferralCode, useReferralRewards, useClaimReferralRewards } from "@/hooks/useReferal";
import { usePlayerWinsYesterdayAndToday, useClaimWinnerRewards } from "@/hooks/useWinnerRewards";
import { useIsOwner, useOwnerWithdrawableAmount, useOwnerWithdraw } from "@/hooks/useOwnerWithdraw";
import { formatEther } from "viem";
import { WalletButton } from "./WalletButton";
import { StatsHeader } from "./StatsHeader";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import styles from "@/app/page.module.css";

const CONTRACT_ABI = parseAbi([
  "function getTotalWins(address _player) external view returns (uint256)",
]);

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";
const APP_URL = process.env.NEXT_PUBLIC_URL || "https://dailydle.vercel.app";

// Icons
const TrophyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const FlameIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

const ShareIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const UsersIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const GiftIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);

const CoinsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="M7 6h1v4" />
    <path d="m16.71 13.88.7.71-2.82 2.82" />
  </svg>
);

const WalletIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export function ProfileView() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [isEditingCode, setIsEditingCode] = useState(false);

  // GM Stats
  const { streak, longestStreak, contractEnabled: gmContractEnabled } = useGmStats();

  // Referal Stats
  const {
    referralCode,
    referralCount,
    contractEnabled: referalContractEnabled,
    refetch: refetchReferal
  } = useReferalStats();

  // Set referral code
  const { setCode, isPending, isConfirming, isConfirmed } = useSetReferralCode();

  // Referral Rewards
  const { pendingRewards, totalEarned, refetchRewards } = useReferralRewards();
  const { claim, isPending: isClaimPending, isConfirming: isClaimConfirming, isConfirmed: isClaimConfirmed } = useClaimReferralRewards();

  // Winner Rewards
  const { yesterday, today, refetch: refetchWinnerRewards } = usePlayerWinsYesterdayAndToday();
  const {
    claim: claimWinnerRewards,
    isPending: isWinnerClaimPending,
    isConfirming: isWinnerClaimConfirming,
    isConfirmed: isWinnerClaimConfirmed
  } = useClaimWinnerRewards();

  // Owner Withdraw
  const { isOwner } = useIsOwner();
  const { totalReserved, refetch: refetchReserves } = useOwnerWithdrawableAmount();
  const {
    withdraw: ownerWithdraw,
    isPending: isWithdrawPending,
    isConfirming: isWithdrawConfirming,
    isConfirmed: isWithdrawConfirmed
  } = useOwnerWithdraw();

  // Get contract balance
  const { data: contractBalanceData, refetch: refetchContractBalance } = useBalance({
    address: CONTRACT_ADDRESS as `0x${string}`,
    chainId: baseSepolia.id,
  });

  // Game stats
  const { data: userTotalWins } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTotalWins",
    args: address ? [address] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: !!address && isConnected && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
    },
  });

  // Refetch after code is set
  useEffect(() => {
    if (isConfirmed) {
      const timeout = setTimeout(() => {
        refetchReferal();
        setIsEditingCode(false);
        setNewCode("");
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isConfirmed, refetchReferal]);

  // Refetch rewards after claim
  useEffect(() => {
    if (isClaimConfirmed) {
      const timeout = setTimeout(() => {
        refetchRewards();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isClaimConfirmed, refetchRewards]);

  // Refetch winner rewards after claim
  useEffect(() => {
    if (isWinnerClaimConfirmed) {
      const timeout = setTimeout(() => {
        refetchWinnerRewards();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isWinnerClaimConfirmed, refetchWinnerRewards]);

  // Refetch contract balance after owner withdraw
  useEffect(() => {
    if (isWithdrawConfirmed) {
      const timeout = setTimeout(() => {
        refetchContractBalance();
        refetchReserves();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isWithdrawConfirmed, refetchContractBalance, refetchReserves]);

  const totalWins = userTotalWins ? Number(userTotalWins) : 0;

  // Generate share URL
  const shareUrl = referralCode
    ? `${APP_URL}?ref=${referralCode}`
    : APP_URL;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Dailydle",
          text: "Join me on Dailydle! Guess the daily character and build your streak.",
          url: shareUrl,
        });
      } catch {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  const handleSetCode = async () => {
    if (newCode.length < 3 || newCode.length > 20) return;
    try {
      await setCode(newCode);
    } catch (err) {
      console.error("Error setting code:", err);
    }
  };

  const handleClaimWinnerRewards = async () => {
    if (!yesterday.day) return;
    try {
      await claimWinnerRewards(yesterday.day);
    } catch (err) {
      console.error("Error claiming winner rewards:", err);
    }
  };

  const handleOwnerWithdraw = async () => {
    try {
      await ownerWithdraw();
    } catch (err) {
      console.error("Error withdrawing funds:", err);
    }
  };

  // Calculate withdrawable amount
  const contractBalance = contractBalanceData?.value || BigInt(0);
  const withdrawableAmount = contractBalance > totalReserved ? contractBalance - totalReserved : BigInt(0);

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <StatsHeader />
        <main className={styles.mainContainer}>
          <div className="flex flex-col items-center justify-center py-8 sm:py-16">
            <div className="text-center max-w-md px-4">
              <h1 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4">Connect your wallet</h1>
              <p className="text-white/60 text-sm sm:text-base mb-4 sm:mb-6">Connect your wallet to view your profile and stats.</p>
              <WalletButton />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <StatsHeader />
      <main className={styles.mainContainer}>
        <div className="py-4">
          {/* Profile Card */}
          <div className="bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              {/* Avatar */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center overflow-hidden">
                {address && (
                  <Avatar
                    address={address}
                    chain={baseSepolia}
                    className="w-full h-full"
                  />
                )}
              </div>

              {/* Name/Address */}
              <div>
                <div className="text-base sm:text-xl font-bold text-white">
                  {address && (
                    <Name
                      address={address}
                      chain={baseSepolia}
                      className="text-white"
                    />
                  )}
                </div>
                <p className="text-white/50 text-xs sm:text-sm font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {/* Total Wins */}
              <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 text-center">
                <div className="flex justify-center mb-1 sm:mb-2 text-yellow-400 scale-75 sm:scale-100">
                  <TrophyIcon />
                </div>
                <p className="text-lg sm:text-2xl font-bold text-white">{totalWins}</p>
                <p className="text-white/50 text-[10px] sm:text-xs">Total Wins</p>
              </div>

              {/* Current Streak */}
              {gmContractEnabled && (
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 text-center">
                  <div className="flex justify-center mb-1 sm:mb-2 text-orange-400 scale-75 sm:scale-100">
                    <FlameIcon />
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-white">{streak}</p>
                  <p className="text-white/50 text-[10px] sm:text-xs">GM Streak</p>
                </div>
              )}

              {/* Longest Streak */}
              {gmContractEnabled && (
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 text-center">
                  <div className="flex justify-center mb-1 sm:mb-2 text-orange-400/60 scale-75 sm:scale-100">
                    <FlameIcon />
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-white">{longestStreak}</p>
                  <p className="text-white/50 text-[10px] sm:text-xs">Best Streak</p>
                </div>
              )}
            </div>
          </div>

          {/* Winner Redistribution Rewards */}
          <div className="mb-4 sm:mb-6 bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className="p-1.5 sm:p-2 rounded-lg bg-violet-500/20 text-violet-400 scale-75 sm:scale-100">
                <CoinsIcon />
              </div>
              <div>
                <h2 className="text-sm sm:text-lg font-bold text-white">Daily Redistribution Rewards</h2>
                <p className="text-white/50 text-xs sm:text-sm">Earn rewards for winning games</p>
              </div>
            </div>

            {yesterday.isFinalized ? (
              <>
                {/* Main Content Grid */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-3 sm:mb-4">
                {/* Yesterday's Wins */}
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 text-center">
                  <p className="text-[10px] sm:text-sm text-white/50 mb-0.5 sm:mb-1">Won yesterday</p>
                  <p className="text-xl sm:text-3xl font-bold text-violet-400">{yesterday.wins}</p>
                  <p className="text-[10px] sm:text-xs text-white/40 mt-0.5 sm:mt-1">Day {yesterday.day}</p>
                </div>

                {/* Today's Wins */}
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 text-center">
                  <p className="text-[10px] sm:text-sm text-white/50 mb-0.5 sm:mb-1">Won today</p>
                  <p className="text-xl sm:text-3xl font-bold text-blue-400">{today.wins}</p>
                  <p className="text-[10px] sm:text-xs text-white/40 mt-0.5 sm:mt-1">Day {today.day}</p>
                </div>

                {/* Claimable Rewards */}
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 text-center">
                  <p className="text-[10px] sm:text-sm text-white/50 mb-0.5 sm:mb-1">Claimable</p>
                  <p className="text-base sm:text-3xl font-bold text-green-400">
                    {formatEther(yesterday.pendingRewards)}
                  </p>
                  <p className="text-[10px] sm:text-xs text-white/40 mt-0.5 sm:mt-1">ETH</p>
                </div>
              </div>

              {/* Claim Button */}
              <button
                onClick={handleClaimWinnerRewards}
                disabled={
                  isWinnerClaimPending ||
                  isWinnerClaimConfirming ||
                  yesterday.hasClaimed ||
                  yesterday.pendingRewards === BigInt(0) ||
                  yesterday.wins === 0
                }
                className="w-full py-2 sm:py-3 bg-gradient-to-r from-violet-500 to-blue-500 text-white rounded-lg sm:rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isWinnerClaimPending || isWinnerClaimConfirming
                  ? "Claiming..."
                  : yesterday.hasClaimed
                  ? "Already Claimed"
                  : yesterday.wins === 0
                  ? "No Wins Yesterday"
                  : "Claim Rewards"}
              </button>

              {isWinnerClaimConfirmed && (
                <p className="text-green-400 text-xs sm:text-sm text-center mt-2">
                  Rewards claimed successfully! 🎉
                </p>
              )}

              {yesterday.hasClaimed && yesterday.wins > 0 && yesterday.rewardPerWin > BigInt(0) && (
                <p className="text-white/40 text-xs sm:text-sm text-center mt-2">
                  You already claimed {formatEther(yesterday.rewardPerWin * BigInt(yesterday.wins))} ETH for {yesterday.wins} win{yesterday.wins > 1 ? 's' : ''}
                </p>
              )}
              </>
            ) : (
              /* Day not finalized yet */
              <div className="bg-white/5 rounded-lg sm:rounded-xl p-4 sm:p-6 text-center">
                <p className="text-white/70 text-sm sm:text-base mb-2">
                  Yesterday&apos;s results are not finalized yet.
                </p>
                <p className="text-white/50 text-xs sm:text-sm">
                  Play today to trigger the distribution for yesterday!
                </p>
                {today.wins > 0 && (
                  <p className="text-violet-400 text-xs sm:text-sm mt-3">
                    You won {today.wins} game{today.wins > 1 ? 's' : ''} today! 🎉
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Owner Withdrawal */}
          {isOwner && (
            <div className="mb-4 sm:mb-6 bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-yellow-500/20 rounded-2xl p-4 sm:p-6">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className="p-1.5 sm:p-2 rounded-lg bg-yellow-500/20 text-yellow-400 scale-75 sm:scale-100">
                  <WalletIcon />
                </div>
                <div>
                  <h2 className="text-sm sm:text-lg font-bold text-white">Owner Treasury</h2>
                  <p className="text-white/50 text-xs sm:text-sm">Withdraw your share (45%)</p>
                </div>
              </div>

              {/* Treasury Stats */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-3 sm:mb-4">
                {/* Contract Balance */}
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 text-center">
                  <p className="text-[10px] sm:text-sm text-white/50 mb-0.5 sm:mb-1">Balance</p>
                  <p className="text-base sm:text-2xl font-bold text-blue-400">
                    {formatEther(contractBalance)}
                  </p>
                  <p className="text-[10px] sm:text-xs text-white/40 mt-0.5 sm:mt-1">ETH</p>
                </div>

                {/* Reserved Funds */}
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 text-center">
                  <p className="text-[10px] sm:text-sm text-white/50 mb-0.5 sm:mb-1">Reserved</p>
                  <p className="text-base sm:text-2xl font-bold text-orange-400">
                    {formatEther(totalReserved)}
                  </p>
                  <p className="text-[10px] sm:text-xs text-white/40 mt-0.5 sm:mt-1">ETH</p>
                </div>

                {/* Withdrawable */}
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 text-center">
                  <p className="text-[10px] sm:text-sm text-white/50 mb-0.5 sm:mb-1">Withdrawable</p>
                  <p className="text-base sm:text-2xl font-bold text-green-400">
                    {formatEther(withdrawableAmount)}
                  </p>
                  <p className="text-[10px] sm:text-xs text-white/40 mt-0.5 sm:mt-1">ETH</p>
                </div>
              </div>

              {/* Withdraw Button */}
              <button
                onClick={handleOwnerWithdraw}
                disabled={
                  isWithdrawPending ||
                  isWithdrawConfirming ||
                  withdrawableAmount === BigInt(0)
                }
                className="w-full py-2 sm:py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg sm:rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isWithdrawPending || isWithdrawConfirming
                  ? "Withdrawing..."
                  : withdrawableAmount === BigInt(0)
                  ? "No Funds"
                  : "Withdraw"}
              </button>

              {isWithdrawConfirmed && (
                <p className="text-green-400 text-xs sm:text-sm text-center mt-2">
                  Funds withdrawn successfully! 💰
                </p>
              )}

              {withdrawableAmount === BigInt(0) && contractBalance > BigInt(0) && (
                <p className="text-white/40 text-xs sm:text-sm text-center mt-2">
                  All funds reserved for pending claims
                </p>
              )}
            </div>
          )}

          {/* Referral Section + Rewards Row */}
          {referalContractEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 sm:mb-6">
              {/* Invite Friends */}
              <div className="bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl p-4 sm:p-6 flex flex-col">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-violet-500/20 text-violet-400 scale-75 sm:scale-100">
                    <UsersIcon />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-lg font-bold text-white">Invite Friends</h2>
                    <p className="text-white/50 text-xs sm:text-sm">Share your referral link</p>
                  </div>
                </div>

                {/* Referral Stats */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-3 text-center">
                    <p className="text-lg sm:text-xl font-bold text-white">{referralCount}</p>
                    <p className="text-white/50 text-[10px] sm:text-xs">Referred users</p>
                  </div>
                  <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-3 text-center">
                    <p className="text-lg sm:text-xl font-bold text-violet-400">
                      {formatEther(totalEarned)}
                    </p>
                    <p className="text-white/50 text-[10px] sm:text-xs">ETH generated</p>
                  </div>
                </div>

                {/* Referral Code */}
                {referralCode && !isEditingCode ? (
                  <div className="mb-3 sm:mb-4">
                    <p className="text-white/50 text-[10px] sm:text-xs mb-1 sm:mb-2">Your referral code</p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg sm:text-xl font-bold text-violet-400">{referralCode}</span>
                      <button
                        onClick={() => setIsEditingCode(true)}
                        className="text-white/40 hover:text-white text-xs sm:text-sm"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 sm:mb-4">
                    <p className="text-white/50 text-[10px] sm:text-xs mb-1 sm:mb-2">
                      {referralCode ? "Change your referral code" : "Create your referral code"}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="yourcode"
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                        maxLength={20}
                        className="flex-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:border-violet-500/50"
                      />
                      <button
                        onClick={handleSetCode}
                        disabled={newCode.length < 3 || isPending || isConfirming}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 bg-violet-500 text-white rounded-lg sm:rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-violet-600 transition-colors"
                      >
                        {isPending || isConfirming ? "..." : "Save"}
                      </button>
                      {referralCode && (
                        <button
                          onClick={() => {
                            setIsEditingCode(false);
                            setNewCode("");
                          }}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white/10 text-white rounded-lg sm:rounded-xl font-medium text-sm hover:bg-white/20 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    <p className="text-white/40 text-[10px] sm:text-xs mt-1 sm:mt-2">3-20 characters, letters and numbers only</p>
                  </div>
                )}

                {/* Share URL */}
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 bg-transparent text-white/70 text-xs sm:text-sm outline-none min-w-0"
                  />
                  <button
                    onClick={handleCopy}
                    className="p-1.5 sm:p-2 text-white/60 hover:text-white transition-colors flex-shrink-0"
                    title="Copy link"
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>

                {/* Share Button */}
                <button
                  onClick={handleShare}
                  className="w-full mt-3 sm:mt-4 py-2 sm:py-3 bg-gradient-to-r from-violet-500 to-blue-500 text-white rounded-lg sm:rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <span className="scale-75 sm:scale-100"><ShareIcon /></span>
                  Share
                </button>
              </div>

              {/* Referral Rewards */}
              <div className="bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl p-4 sm:p-6 flex flex-col">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-violet-500/20 text-violet-400 scale-75 sm:scale-100">
                    <GiftIcon />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-lg font-bold text-white">Referral Rewards</h2>
                    <p className="text-white/50 text-xs sm:text-sm">Earnings from your referrals</p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 text-center flex-1 flex flex-col items-center justify-center">
                  <p className="text-xl sm:text-3xl font-bold text-violet-400">
                    {formatEther(pendingRewards)} ETH
                  </p>
                  <p className="text-white/50 text-xs sm:text-sm mt-1">Pending rewards</p>
                </div>

                <button
                  onClick={() => claim()}
                  disabled={isClaimPending || isClaimConfirming || pendingRewards === BigInt(0)}
                  className="w-full py-2 sm:py-3 bg-gradient-to-r from-violet-500 to-blue-500 text-white rounded-lg sm:rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isClaimPending || isClaimConfirming ? "Claiming..." : "Claim Rewards"}
                </button>

                {isClaimConfirmed && (
                  <p className="text-violet-400 text-xs sm:text-sm text-center mt-2">Rewards claimed!</p>
                )}
              </div>
            </div>
          )}

          {/* Disconnect */}
          <button
            onClick={() => {
              disconnect();
              router.push("/");
            }}
            className="w-full py-2 sm:py-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg sm:rounded-xl font-medium text-sm sm:text-base flex items-center justify-center gap-2 hover:bg-red-500/30 transition-colors"
          >
            <span className="scale-75 sm:scale-100"><LogoutIcon /></span>
            Disconnect
          </button>
        </div>
      </main>
    </div>
  );
}
