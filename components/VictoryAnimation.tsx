"use client";
import { useEffect, useState } from "react";

interface VictoryAnimationProps {
  characterName: string;
  attempts: number;
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

export function VictoryAnimation({ characterName, attempts }: VictoryAnimationProps) {
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
      </div>
    </div>
  );
}
