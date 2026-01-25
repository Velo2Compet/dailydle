"use client";

import Link from "next/link";
import { ReactNode, CSSProperties, MouseEvent } from "react";

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

const baseStyle: CSSProperties = {
  minWidth: "70px",
  padding: "0.75rem 1rem",
  borderRadius: "0.75rem",
  color: "white",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.25rem",
  fontSize: "0.875rem",
  fontWeight: "500",
  transition: "all 0.3s ease",
};

const variantStyles: Record<StatCardVariant, CSSProperties> = {
  default: {
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.05)",
  },
  highlight: {
    border: "1px solid rgba(168, 85, 247, 0.5)",
    background: "rgba(168, 85, 247, 0.3)",
  },
  button: {
    border: "1px solid rgba(168, 85, 247, 0.3)",
    background: "linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)",
    cursor: "pointer",
  },
};

const hoverStyles: Record<StatCardVariant, CSSProperties> = {
  default: {},
  highlight: {},
  button: {
    background: "linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(59, 130, 246, 0.3) 100%)",
  },
};

function CardContent({ icon, value, label }: Pick<StatCardProps, "icon" | "value" | "label">) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", height: "24px" }}>
        {icon}
        {value !== undefined && (
          <span style={{ fontSize: "1.25rem", fontWeight: "600" }}>{value}</span>
        )}
      </div>
      <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>{label}</span>
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
  className,
}: StatCardProps) {
  const style: CSSProperties = {
    ...baseStyle,
    ...variantStyles[variant],
    ...(flex ? { flex: 1, minWidth: "120px" } : {}),
  };

  const handleMouseEnter = (e: MouseEvent<HTMLElement>) => {
    const hoverStyle = hoverStyles[variant];
    if (hoverStyle.background) {
      (e.currentTarget as HTMLElement).style.background = hoverStyle.background as string;
    }
  };

  const handleMouseLeave = (e: MouseEvent<HTMLElement>) => {
    const baseBackground = variantStyles[variant].background;
    if (baseBackground) {
      (e.currentTarget as HTMLElement).style.background = baseBackground as string;
    }
  };

  // Si c'est un lien
  if (href) {
    return (
      <Link href={href} style={{ display: "flex" }} className={className}>
        <div
          style={style}
          onMouseEnter={variant === "button" ? handleMouseEnter : undefined}
          onMouseLeave={variant === "button" ? handleMouseLeave : undefined}
        >
          <CardContent icon={icon} value={value} label={label} />
        </div>
      </Link>
    );
  }

  // Si c'est un bouton cliquable
  if (onClick) {
    return (
      <button
        onClick={onClick}
        style={style}
        onMouseEnter={variant === "button" ? handleMouseEnter : undefined}
        onMouseLeave={variant === "button" ? handleMouseLeave : undefined}
        className={className}
      >
        <CardContent icon={icon} value={value} label={label} />
      </button>
    );
  }

  // Sinon c'est juste un affichage
  return (
    <div style={style} className={className}>
      <CardContent icon={icon} value={value} label={label} />
    </div>
  );
}
