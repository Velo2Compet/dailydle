"use client";
import { useAccount, useDisconnect } from "wagmi";
import { usePlayerStats, useGlobalTotalWins } from "@/hooks/useGame";
import { WalletButton } from "./WalletButton";
import { Button } from "./Button";
import { StatItem } from "./StatItem";
import { LogOut } from "lucide-react";

export function GameHeader() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { totalWins } = usePlayerStats(address);
  const { globalTotalWins } = useGlobalTotalWins();

  return (
    <header className="w-full border-b border-violet-500/20 bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Statistiques de victoires */}
          <div className="flex items-center gap-4">
            {isConnected && (
              <div className="flex items-center gap-2 bg-gradient-to-r from-violet-600/20 to-blue-600/20 border border-violet-500/30 rounded-xl px-4 py-2">
                <StatItem label="Vos victoires totales" value={totalWins} />
              </div>
            )}
            <div className="flex items-center gap-2 bg-gradient-to-r from-violet-600/20 to-blue-600/20 border border-violet-500/30 rounded-xl px-4 py-2">
              <StatItem label="Victoires totales" value={globalTotalWins} />
            </div>
          </div>

          {/* Statut du wallet */}
          <div className="flex items-center gap-3">
            {isConnected && address ? (
              <>
                <div className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-lg px-3 py-2">
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-muted-foreground">Wallet connecté</span>
                    <span className="text-white text-sm font-mono">
                      {address.slice(0, 6)}...{address.slice(-4)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => disconnect()}
                  title="Déconnecter le wallet"
                  className="!p-2"
                >
                  <LogOut className="w-4 h-4" />
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
