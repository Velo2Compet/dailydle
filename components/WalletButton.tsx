"use client";
import { useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { sdk } from "@farcaster/miniapp-sdk";
import { Button } from "./Button";

/**
 * Wallet connect button.
 * - Inside Base App / Farcaster mini-app: connects directly via the farcasterMiniApp connector.
 * - Anywhere else: connects via the baseAccount connector (Base Smart Wallet).
 *
 * No hidden <Wallet/> portal trick — the previous version dispatched .click() on a
 * display:none button, which OnchainKit refuses to open inside Base App's webview.
 */
export function WalletButton({
  size = "md",
  fullWidth = false,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
}) {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const [isMiniApp, setIsMiniApp] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    sdk
      .isInMiniApp()
      .then((v) => {
        if (!cancelled) setIsMiniApp(v);
      })
      .catch(() => {
        if (!cancelled) setIsMiniApp(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = () => {
    if (isConnected || isPending) return;

    if (isMiniApp) {
      const farcaster =
        connectors.find(
          (c) =>
            c.id === "farcaster" ||
            c.id === "farcasterMiniApp" ||
            c.name.toLowerCase().includes("farcaster")
        ) ?? connectors[0];
      if (farcaster) connect({ connector: farcaster });
      return;
    }

    const base =
      connectors.find(
        (c) =>
          c.id === "baseAccount" ||
          c.name.toLowerCase().includes("base")
      ) ?? connectors[0];
    if (base) connect({ connector: base });
  };

  return (
    <Button
      size={size}
      fullWidth={fullWidth}
      onClick={handleClick}
      className={className}
      disabled={isPending || isMiniApp === null}
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </Button>
  );
}
