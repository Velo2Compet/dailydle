"use client";
import { useAccount, useDisconnect } from "wagmi";
import { usePlayerStats, useGlobalTotalWins } from "@/hooks/useGame";
import { WalletButton } from "./WalletButton";
import { Button } from "./Button";
import { StatItem } from "./StatItem";
import { LogOut } from "lucide-react";
import Link from "next/link";

interface GameHeaderProps {
  className?: string;
}

export function GameHeader({ className }: GameHeaderProps) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { totalWins } = usePlayerStats(address);
  const { globalTotalWins } = useGlobalTotalWins();

  return (
    <header className={`w-full border-b border-violet-500/20 bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] sticky top-0 z-50 ${className ?? ""}`.trim()}>
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-0">
          {/* Logo et statistiques */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-wrap">
            <Link href="/" className="flex items-center">
              <img 
                src="/logo.png" 
                alt="Dailydle Logo" 
                className="w-16 sm:w-24 md:w-32 h-auto object-contain"
              />
            </Link>
            {/* Statistiques de victoires */}
            {isConnected && (
              <div className="flex items-center gap-1 sm:gap-2 bg-gradient-to-r from-violet-600/20 to-blue-600/20 border border-violet-500/30 rounded-lg sm:rounded-xl px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2">
                <StatItem label="Your total wins" shortLabel="Yours" value={totalWins} />
              </div>
            )}
            <div className="flex items-center gap-1 sm:gap-2 bg-gradient-to-r from-violet-600/20 to-blue-600/20 border border-violet-500/30 rounded-lg sm:rounded-xl px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2">
              <StatItem label="Total wins" shortLabel="Total" value={globalTotalWins} />
            </div>
          </div>

          {/* Statut du wallet */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
            {isConnected && address ? (
              <>
                <div className="flex items-center gap-1 sm:gap-2 bg-black/20 border border-white/10 rounded-md sm:rounded-lg px-2 sm:px-3 py-1 sm:py-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">Wallet connected</span>
                    <span className="text-white text-xs sm:text-sm font-mono">
                      {address.slice(0, 4)}...{address.slice(-3)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => disconnect()}
                  title="Disconnect wallet"
                  className="!p-1.5 sm:!p-2"
                >
                  <LogOut className="w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
              </>
            ) : (
              <WalletButton size="sm" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
