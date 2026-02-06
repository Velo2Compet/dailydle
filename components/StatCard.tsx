"use client";

import Link from "next/link";
import { ReactNode } from "react";

export type StatCardVariant = "default" | "highlight" | "button";

interface StatCardProps {
  icon?: ReactNode;
  value?: string | number;
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: StatCardVariant;
  flex?: boolean;
  className?: string;
}

const variantClasses: Record<StatCardVariant, string> = {
  default: "border-white/20 bg-white/5",
  highlight: "border-violet-500/50 bg-violet-500/30",
  button: "border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-blue-500/20 cursor-pointer hover:from-violet-500/30 hover:to-blue-500/30",
};

function CardContent({ icon, value, label }: Pick<StatCardProps, "icon" | "value" | "label">) {
  return (
    <>
      <div className="flex items-center gap-1 sm:gap-2 h-4 sm:h-6">
        <span className="[&>svg]:w-3 [&>svg]:h-3 sm:[&>svg]:w-4 sm:[&>svg]:h-4 md:[&>svg]:w-5 md:[&>svg]:h-5">
          {icon}
        </span>
        {value !== undefined && (
          <span className="text-sm sm:text-base md:text-xl font-semibold">{value}</span>
        )}
      </div>
      <span className="text-[8px] sm:text-[10px] md:text-xs opacity-80 whitespace-nowrap">{label}</span>
    </>
  );
}

export function StatCard({
  icon,
  value,
  label,
  href,
  onClick,
  variant = "default",
  flex = false,
  className = "",
}: StatCardProps) {
  const baseClasses = `
    min-w-0 flex-shrink
    px-2 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-3
    rounded-lg sm:rounded-xl
    text-white
    flex flex-col items-center justify-center
    gap-0.5 sm:gap-1
    text-xs sm:text-sm
    font-medium
    transition-all duration-300
    border
    ${variantClasses[variant]}
    ${flex ? "flex-1" : ""}
    ${className}
  `.trim();

  // Si c'est un lien
  if (href) {
    return (
      <Link href={href} className={baseClasses}>
        <CardContent icon={icon} value={value} label={label} />
      </Link>
    );
  }

  // Si c'est un bouton cliquable
  if (onClick) {
    return (
      <button onClick={onClick} className={baseClasses}>
        <CardContent icon={icon} value={value} label={label} />
      </button>
    );
  }

  // Sinon c'est juste un affichage
  return (
    <div className={baseClasses}>
      <CardContent icon={icon} value={value} label={label} />
    </div>
  );
}
