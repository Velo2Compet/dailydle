"use client";

interface StatItemProps {
  label: string;
  shortLabel?: string;
  value: number | string;
  className?: string;
}

export function StatItem({ label, shortLabel, value, className = "" }: StatItemProps) {
  return (
    <div className={`flex items-center gap-1 sm:gap-2 ${className}`}>
      {shortLabel && (
        <span className="text-[9px] sm:text-[10px] md:text-xs text-muted-foreground font-medium uppercase tracking-wider whitespace-nowrap sm:hidden">
          {shortLabel}
        </span>
      )}
      <span className={`text-[9px] sm:text-[10px] md:text-xs text-muted-foreground font-medium uppercase tracking-wider whitespace-nowrap ${shortLabel ? 'hidden sm:inline' : ''}`}>
        {label}
      </span>
      <span className="text-violet-400 font-bold text-xs sm:text-sm md:text-base">
        {value}
      </span>
    </div>
  );
}
