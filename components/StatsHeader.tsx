"use client";

import { useEffect, useState, useRef } from "react";
import { useAccount, useReadContract, useConnect } from "wagmi";
import { parseAbi } from "viem";
import { base } from "wagmi/chains";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { StatCard } from "./StatCard";

const CONTRACT_ABI = parseAbi([
  "function getTotalWins(address _player) external view returns (uint256)",
  "function getGlobalTotalWins() external view returns (uint256)",
  "function getWinnersTodayCount(uint256 _collectionId, uint256 _day) external view returns (uint256)",
]);

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";

// Icons
const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);

const UserWinsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9c0-1 1-2 2-2s2 1 2 2"></path>
    <path d="M14 9c0-1 1-2 2-2s2 1 2 2"></path>
    <path d="M12 15s-1-1-2-1-2 1-2 1"></path>
    <path d="M12 15s1-1 2-1 2 1 2 1"></path>
    <circle cx="12" cy="12" r="10"></circle>
  </svg>
);

const GlobalWinsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

const TodayWinnersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9c0-1 1-2 2-2s2 1 2 2"></path>
    <path d="M14 9c0-1 1-2 2-2s2 1 2 2"></path>
    <path d="M9 17c0 0 1 1 3 1s3-1 3-1"></path>
    <circle cx="12" cy="12" r="10"></circle>
  </svg>
);

const WalletIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
    <path d="M1 10h22"></path>
  </svg>
);

const ConnectedIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

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
    chainId: base.id,
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" && isConnected,
    },
  });

  const { data: globalTotalWins } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getGlobalTotalWins",
    chainId: base.id,
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
    },
  });

  const { data: winnersTodayCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getWinnersTodayCount",
    args: [BigInt(0), BigInt(currentDay)],
    chainId: base.id,
    query: {
      enabled: !!CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" && currentDay > 0,
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
    <div className="w-full px-2 sm:px-4 py-4">
      {/* Wallet caché pour ouvrir le modal OnchainKit */}
      <div ref={walletRef} style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
        <Wallet />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
          gap: "0.75rem",
          flexWrap: "wrap",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <StatCard
          icon={<HomeIcon />}
          label="Accueil"
          href="/"
          variant="button"
        />

        <StatCard
          icon={<UserWinsIcon />}
          value={userTotalWins}
          label="Vos victoires"
          variant="highlight"
          flex
        />

        <StatCard
          icon={<GlobalWinsIcon />}
          value={globalTotalWins}
          label="Total victoires"
          flex
        />

        <StatCard
          icon={<TodayWinnersIcon />}
          value={winnersTodayCount}
          label="Gagnants aujourd'hui"
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
