"use client";
import { useAccount, useDisconnect } from "wagmi";
import { usePlayerStats, useGlobalTotalWins } from "@/hooks/useGame";
import { WalletButton } from "./WalletButton";
import { Button } from "./Button";
import { StatCard } from "./StatCard";
import Link from "next/link";

// Icons matching the footer style
const TrophyIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const TotalIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const WalletIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </svg>
);

const LogOutIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

interface GameHeaderProps {
  className?: string;
}

export function GameHeader({ className }: GameHeaderProps) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { totalWins } = usePlayerStats(address);
  const { globalTotalWins } = useGlobalTotalWins();

  return (
    <header className={`w-full sticky top-0 z-50 px-2 sm:px-4 py-4 ${className ?? ""}`.trim()}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "1rem",
          borderRadius: "1rem",
          background: "rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Logo et statistiques */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Link href="/" className="flex items-center">
            <img
              src="/logo.png"
              alt="Dailydle Logo"
              className="w-16 sm:w-24 md:w-32 h-auto object-contain"
            />
          </Link>
          {/* Statistiques de victoires */}
          {isConnected && (
            <StatCard
              icon={<TrophyIcon />}
              value={totalWins}
              label="Vos victoires"
              variant="highlight"
            />
          )}
          <StatCard
            icon={<TotalIcon />}
            value={globalTotalWins}
            label="Total victoires"
          />
        </div>

        {/* Statut du wallet */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {isConnected && address ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.75rem",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                }}
              >
                <WalletIcon />
                <div className="flex flex-col items-end">
                  <span className="text-[10px] sm:text-xs text-white/60 hidden sm:inline">Wallet connecté</span>
                  <span className="text-white text-xs sm:text-sm font-mono">
                    {address.slice(0, 4)}...{address.slice(-3)}
                  </span>
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => disconnect()}
                title="Déconnecter le wallet"
                className="!p-1.5 sm:!p-2"
              >
                <LogOutIcon />
              </Button>
            </>
          ) : (
            <WalletButton size="sm" />
          )}
        </div>
      </div>
    </header>
  );
}
