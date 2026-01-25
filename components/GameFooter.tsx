"use client";

import { StatCard } from "./StatCard";

interface GameFooterProps {
  attempts: number;
  userWins: number;
  winnersToday: number;
  totalWinners: number;
}

// Icons as components for reusability
const AttemptsIcon = () => (
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
    <path d="M12 2v4" />
    <path d="M12 18v4" />
    <path d="M4.93 4.93l2.83 2.83" />
    <path d="M16.24 16.24l2.83 2.83" />
    <path d="M2 12h4" />
    <path d="M18 12h4" />
    <path d="M4.93 19.07l2.83-2.83" />
    <path d="M16.24 7.76l2.83-2.83" />
  </svg>
);

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

export function GameFooter({ attempts, userWins, winnersToday, totalWinners }: GameFooterProps) {
  return (
    <div className="w-full px-2 sm:px-4 py-4 mt-auto">
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
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
        <StatCard
          icon={<AttemptsIcon />}
          value={attempts}
          label="Essais aujourd'hui"
          variant="highlight"
          flex
        />
        <StatCard
          icon={<TrophyIcon />}
          value={userWins}
          label="Vos victoires"
          variant="highlight"
          flex
        />
        <StatCard
          icon={<TodayIcon />}
          value={winnersToday}
          label="Trouvé aujourd'hui"
          flex
        />
        <StatCard
          icon={<TotalIcon />}
          value={totalWinners}
          label="Total trouvé"
          flex
        />
      </div>
    </div>
  );
}
