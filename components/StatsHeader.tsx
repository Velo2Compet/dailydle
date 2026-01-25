"use client";

import { useEffect, useState, useRef } from "react";
import { useAccount, useReadContract, useConnect } from "wagmi";
import { parseAbi } from "viem";
import { baseSepolia } from "wagmi/chains";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { StatCard } from "./StatCard";

const CONTRACT_ABI = parseAbi([
  "function getTotalWins(address _player) external view returns (uint256)",
  "function getGlobalTotalWins() external view returns (uint256)",
  "function getWinnersTodayCount(uint256 _collectionId, uint256 _day) external view returns (uint256)",
]);

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

// Icons matching the footer style
const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);

// Trophy icon for user wins (same as footer)
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

// Users icon for total wins (same as footer)
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

// Calendar check icon for today winners (same as footer)
const TodayIcon = () => (
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
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M3 10h18" />
    <path d="M9 16l2 2 4-4" />
  </svg>
);

const WalletIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </svg>
);

const ConnectedIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

// Cache settings to reduce RPC calls
const CACHE_TIME = 5 * 60 * 1000; // 5 minutes

// Hook for stats
function useStatsData() {
  const { address, isConnected } = useAccount();
  const [currentDay, setCurrentDay] = useState(0);

  useEffect(() => {
    setCurrentDay(Math.floor(Date.now() / 1000 / 86400));
  }, []);

  const { data: userTotalWins } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getTotalWins",
    args: [address || "0x0000000000000000000000000000000000000000"],
    chainId: baseSepolia.id,
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" && isConnected,
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  const { data: globalTotalWins } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getGlobalTotalWins",
    chainId: baseSepolia.id,
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  const { data: winnersTodayCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getWinnersTodayCount",
    args: [BigInt(0), BigInt(currentDay)],
    chainId: baseSepolia.id,
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" && currentDay > 0,
      staleTime: CACHE_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  return {
    userTotalWins: userTotalWins ? Number(userTotalWins) : 0,
    globalTotalWins: globalTotalWins ? Number(globalTotalWins) : 0,
    winnersTodayCount: winnersTodayCount ? Number(winnersTodayCount) : 0,
    isConnected,
  };
}

export function StatsHeader() {
  const { userTotalWins, globalTotalWins, winnersTodayCount, isConnected } = useStatsData();
  const { context } = useMiniKit();
  const { connect, connectors } = useConnect();
  const walletRef = useRef<HTMLDivElement>(null);
  const isOnBaseApp = !!context?.user?.fid;

  const handleWalletClick = () => {
    if (isConnected) return;

    if (isOnBaseApp) {
      const farcasterConnector = connectors.find(c =>
        c.id === 'farcasterFrame' ||
        c.id === 'minikit' ||
        c.name.toLowerCase().includes('farcaster')
      );

      if (farcasterConnector) {
        connect({ connector: farcasterConnector });
      } else {
        const firstConnector = connectors[0];
        if (firstConnector) {
          connect({ connector: firstConnector });
        }
      }
    } else {
      const walletButton = walletRef.current?.querySelector('button') as HTMLButtonElement;
      if (walletButton) {
        walletButton.click();
      } else {
        const allWalletButtons = document.querySelectorAll('button[data-testid="ockWalletButton"], button[data-onchainkit="wallet-button"], [data-onchainkit="wallet-button"] button');
        if (allWalletButtons.length > 0) {
          (allWalletButtons[0] as HTMLButtonElement).click();
        }
      }
    }
  };

  return (
    <div className="w-full px-2 sm:px-4 py-2 sm:py-4">
      {/* Wallet caché pour ouvrir le modal OnchainKit */}
      <div ref={walletRef} style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
        <Wallet />
      </div>

      <div className="flex justify-center items-stretch gap-1.5 sm:gap-2 md:gap-3 flex-nowrap max-w-[1200px] mx-auto p-2 sm:p-3 md:p-4 rounded-xl bg-white/[0.08] backdrop-blur-lg border border-white/10">
        <StatCard
          icon={<HomeIcon />}
          label="Accueil"
          href="/"
          variant="button"
        />

        <StatCard
          icon={<TrophyIcon />}
          value={userTotalWins}
          label="Vos victoires"
          variant="highlight"
          flex
        />

        <StatCard
          icon={<TotalIcon />}
          value={globalTotalWins}
          label="Total"
          flex
        />

        <StatCard
          icon={<TodayIcon />}
          value={winnersTodayCount}
          label="Aujourd'hui"
          flex
        />

        <StatCard
          icon={isConnected ? <ConnectedIcon /> : <WalletIcon />}
          label={isConnected ? "Connecté" : "Connecter"}
          onClick={handleWalletClick}
          variant="button"
        />
      </div>
    </div>
  );
}
