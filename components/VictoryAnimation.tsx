"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface VictoryAnimationProps {
  characterName: string;
  attempts: number;
  // When true, the win still needs to be finalised on-chain via claimWin.
  // When false, the win is already recorded (hasWonToday == true).
  needsClaim: boolean;
  isClaimPending: boolean;
  claimError?: string | null;
  onClaim: () => void;
}

interface ConfettiPiece {
  id: number;
  left: string;
  size: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
}

const CONFETTI_COLORS = ['#60a5fa', '#a855f7', '#22d3ee', '#34d399', '#f59e0b'];

export function VictoryAnimation({
  characterName,
  attempts,
  needsClaim,
  isClaimPending,
  claimError,
  onClaim,
}: VictoryAnimationProps) {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    // Generate 70 random confetti pieces
    const pieces: ConfettiPiece[] = [];
    for (let i = 0; i < 70; i++) {
      pieces.push({
        id: i,
        left: `${Math.random() * 100}%`,
        size: Math.random() * 6 + 6, // 6-12px
        delay: Math.random() * 0.6, // 0-0.6s
        duration: Math.random() * 1.2 + 1.8, // 1.8-3.0s
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotate: Math.random() * 360, // 0-360°
      });
    }
    setConfetti(pieces);
  }, []);

  return (
    <div className="w-full relative bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl shadow-xl shadow-violet-500/10 p-4 sm:p-6 overflow-hidden">
      {/* Confetti animation */}
      {confetti.map((piece) => (
        <div
          key={piece.id}
          className="absolute animate-confetti-fall pointer-events-none"
          style={{
            left: piece.left,
            top: '-20px',
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            transform: `rotate(${piece.rotate}deg)`,
            borderRadius: '2px',
          }}
        />
      ))}

      {/* Victory message */}
      <div className="relative z-10 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">🎉 Congratulations!</h2>
        <p className="text-muted-foreground">
          You found <span className="text-violet-400 font-semibold">{characterName}</span> in {attempts} attempt(s)!
        </p>

        {needsClaim ? (
          <div className="mt-4 p-3 sm:p-4 bg-amber-500/10 border border-amber-500/40 rounded-xl text-sm sm:text-base">
            <p className="text-white/90">
              One more step: <span className="font-semibold text-amber-300">claim your win on-chain</span> to make it official.
            </p>
            <p className="text-white/60 text-xs sm:text-sm mt-1">
              Claim before the daily pool finalizes — otherwise the win won&apos;t count.
            </p>
            <button
              type="button"
              onClick={onClaim}
              disabled={isClaimPending}
              className="mt-3 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isClaimPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Claiming…
                </>
              ) : (
                <>Claim win on-chain →</>
              )}
            </button>
            {claimError && (
              <p className="text-red-400 text-xs sm:text-sm mt-2 break-all">
                {claimError}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 p-3 sm:p-4 bg-violet-500/10 border border-violet-500/30 rounded-xl text-sm sm:text-base">
            <p className="text-white/90">
              Your win is recorded on-chain ✓ Rewards become claimable{" "}
              <span className="font-semibold text-violet-300">tomorrow</span>, once the daily pool is finalized.
            </p>
            <Link
              href="/profile"
              className="mt-3 inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Go to claim page →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
