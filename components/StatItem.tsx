"use client";

interface StatItemProps {
  label: string;
  value: number | string;
  className?: string;
}

export function StatItem({ label, value, className = "" }: StatItemProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
        {label}
      </span>
      <span className="text-violet-400 font-bold text-base">
        {value}
      </span>
    </div>
  );
}
