"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useSendGm, useGmStats } from "@/hooks/useGmStreak";
import { WalletButton } from "./WalletButton";

// Flame icon for streak
const FlameIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

export function GmStreakCard() {
  const { isConnected } = useAccount();
  const { sendGm, isPending, isConfirming, isConfirmed } = useSendGm();
  const {
    streak,
    longestStreak,
    canGmToday,
    isStreakActive,
    contractEnabled,
    refetch,
  } = useGmStats();

  // Refresh after confirmation
  useEffect(() => {
    if (isConfirmed) {
      const timeout = setTimeout(() => {
        refetch();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isConfirmed, refetch]);

  const handleGm = async () => {
    try {
      await sendGm();
    } catch (err) {
      console.error("Error sending GM:", err);
    }
  };

  const isLoading = isPending || isConfirming;

  // Don't render if contract is not configured
  if (!contractEnabled) {
    return null;
  }

  return (
    <div className="w-full relative bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl shadow-xl shadow-violet-500/10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-blue-500/5 to-violet-500/5 pointer-events-none" />

      <div className="relative z-10 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Streak section */}
          <div className="flex items-center gap-4">
            {/* Icon with animation if streak active */}
            <div
              className={`p-3 rounded-xl ${
                isStreakActive && streak > 0
                  ? "bg-orange-500/20 text-orange-400"
                  : "bg-white/10 text-white/50"
              }`}
            >
              <FlameIcon />
            </div>

            {/* Stats */}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
                  {streak}
                </span>
                <span className="text-white/70 text-sm">
                  day{streak > 1 ? "s" : ""} streak
                </span>
              </div>
              {longestStreak > 0 && (
                <p className="text-white/50 text-xs mt-1">
                  Best: {longestStreak} day{longestStreak > 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>

          {/* GM Button */}
          <div className="w-full sm:w-auto">
            {!isConnected ? (
              <WalletButton fullWidth className="h-12" />
            ) : canGmToday ? (
              <button
                onClick={handleGm}
                disabled={isLoading}
                className={`
                  w-full sm:w-auto h-12 px-8 rounded-xl font-bold text-lg
                  transition-all duration-300 transform
                  ${
                    isLoading
                      ? "bg-white/10 text-white/50 cursor-not-allowed"
                      : "bg-gradient-to-r from-orange-500 to-yellow-500 text-white hover:scale-105 hover:shadow-lg hover:shadow-orange-500/30"
                  }
                `}
              >
                {isLoading ? "..." : "GM!"}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-500/20 border border-green-500/30">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-green-400"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-green-400 font-medium">
                  GM sent!
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Warning message if streak ended */}
        {isConnected && !isStreakActive && streak === 0 && longestStreak > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-sm text-center">
              Your {longestStreak} day{longestStreak > 1 ? "s" : ""} streak has ended. Start again today!
            </p>
          </div>
        )}

        {/* First time message */}
        {isConnected && streak === 0 && longestStreak === 0 && canGmToday && (
          <p className="mt-3 text-white/50 text-sm text-center sm:text-left">
            Start your streak by sending your first GM!
          </p>
        )}
      </div>
    </div>
  );
}
