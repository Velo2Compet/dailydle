"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useDisconnect } from "wagmi";
import { useRouter } from "next/navigation";
import { parseAbi } from "viem";
import { baseSepolia } from "wagmi/chains";
import { useGmStats } from "@/hooks/useGmStreak";
import { useReferalStats, useSetReferralCode, useReferralRewards, useClaimReferralRewards } from "@/hooks/useReferal";
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

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <StatsHeader />
        <main className={styles.mainContainer}>
          <div className="flex flex-col items-center justify-center py-16">
            <div className="text-center max-w-md">
              <h1 className="text-2xl font-bold text-white mb-4">Connect your wallet</h1>
              <p className="text-white/60 mb-6">Connect your wallet to view your profile and stats.</p>
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
          <div className="bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-4 mb-6">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center overflow-hidden">
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
                <div className="text-xl font-bold text-white">
                  {address && (
                    <Name
                      address={address}
                      chain={baseSepolia}
                      className="text-white"
                    />
                  )}
                </div>
                <p className="text-white/50 text-sm font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              {/* Total Wins */}
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="flex justify-center mb-2 text-yellow-400">
                  <TrophyIcon />
                </div>
                <p className="text-2xl font-bold text-white">{totalWins}</p>
                <p className="text-white/50 text-xs">Total Wins</p>
              </div>

              {/* Current Streak */}
              {gmContractEnabled && (
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="flex justify-center mb-2 text-orange-400">
                    <FlameIcon />
                  </div>
                  <p className="text-2xl font-bold text-white">{streak}</p>
                  <p className="text-white/50 text-xs">GM Streak</p>
                </div>
              )}

              {/* Longest Streak */}
              {gmContractEnabled && (
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="flex justify-center mb-2 text-orange-400/60">
                    <FlameIcon />
                  </div>
                  <p className="text-2xl font-bold text-white">{longestStreak}</p>
                  <p className="text-white/50 text-xs">Best Streak</p>
                </div>
              )}
            </div>
          </div>

          {/* Referral Section + Rewards Row */}
          {referalContractEnabled && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Invite Friends */}
              <div className="bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-violet-500/20 text-violet-400">
                    <UsersIcon />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Invite Friends</h2>
                    <p className="text-white/50 text-sm">Share your referral link</p>
                  </div>
                </div>

                {/* Referral Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-white">{referralCount}</p>
                    <p className="text-white/50 text-xs">Referred users</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-violet-400">
                      {formatEther(totalEarned)} ETH
                    </p>
                    <p className="text-white/50 text-xs">Volume generated</p>
                  </div>
                </div>

                {/* Referral Code */}
                {referralCode && !isEditingCode ? (
                  <div className="mb-4">
                    <p className="text-white/50 text-xs mb-2">Your referral code</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-violet-400">{referralCode}</span>
                      <button
                        onClick={() => setIsEditingCode(true)}
                        className="text-white/40 hover:text-white text-sm"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    <p className="text-white/50 text-xs mb-2">
                      {referralCode ? "Change your referral code" : "Create your referral code"}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="yourcode"
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                        maxLength={20}
                        className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-violet-500/50"
                      />
                      <button
                        onClick={handleSetCode}
                        disabled={newCode.length < 3 || isPending || isConfirming}
                        className="px-4 py-2 bg-violet-500 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-violet-600 transition-colors"
                      >
                        {isPending || isConfirming ? "..." : "Save"}
                      </button>
                      {referralCode && (
                        <button
                          onClick={() => {
                            setIsEditingCode(false);
                            setNewCode("");
                          }}
                          className="px-4 py-2 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    <p className="text-white/40 text-xs mt-2">3-20 characters, letters and numbers only</p>
                  </div>
                )}

                {/* Share URL */}
                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 bg-transparent text-white/70 text-sm outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className="p-2 text-white/60 hover:text-white transition-colors"
                    title="Copy link"
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>

                {/* Share Button */}
                <button
                  onClick={handleShare}
                  className="w-full mt-4 py-3 bg-gradient-to-r from-violet-500 to-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <ShareIcon />
                  Share with friends
                </button>
              </div>

              {/* Referral Rewards */}
              <div className="bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-violet-500/20 text-violet-400">
                    <GiftIcon />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Referral Rewards</h2>
                    <p className="text-white/50 text-sm">Earnings from your referrals</p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-4 mb-4 text-center flex-1 flex flex-col items-center justify-center">
                  <p className="text-3xl font-bold text-violet-400">
                    {formatEther(pendingRewards)} ETH
                  </p>
                  <p className="text-white/50 text-sm mt-1">Pending rewards</p>
                </div>

                <button
                  onClick={() => claim()}
                  disabled={isClaimPending || isClaimConfirming || pendingRewards === BigInt(0)}
                  className="w-full py-3 bg-gradient-to-r from-violet-500 to-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isClaimPending || isClaimConfirming ? "Claiming..." : "Claim Rewards"}
                </button>

                {isClaimConfirmed && (
                  <p className="text-violet-400 text-sm text-center mt-2">Rewards claimed!</p>
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
            className="w-full py-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-red-500/30 transition-colors"
          >
            <LogoutIcon />
            Disconnect
          </button>
        </div>
      </main>
    </div>
  );
}
