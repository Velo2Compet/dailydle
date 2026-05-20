"use client";
import { ConnectWallet } from "@coinbase/onchainkit/wallet";
import { useConnect } from "wagmi";
import { Button } from "./Button";

/**
 * Wallet connect button.
 *
 * Delegates to OnchainKit's <ConnectWallet/> with a render prop so we keep
 * our custom <Button/> styling while letting OnchainKit pick the right
 * connector at runtime:
 *   - In Farcaster mini-app context → connect({ connector: farcasterMiniApp })
 *   - In Base App (post-April-2026) / regular browser with display:"modal"
 *     → opens the wallet selection modal (baseAccount, injected, …)
 *
 * We also surface useConnect().error so a silent failure in Base App's
 * webview shows up in the UI instead of disappearing.
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
  const { error } = useConnect();

  return (
    <div className="flex flex-col items-stretch gap-1">
      <ConnectWallet
        disconnectedLabel="Connect Wallet"
        render={({ label, onClick, isLoading }) => (
          <Button
            size={size}
            fullWidth={fullWidth}
            onClick={onClick}
            disabled={isLoading}
            className={className}
          >
            {isLoading ? "Connecting…" : label}
          </Button>
        )}
      />
      {error && (
        <p className="text-xs text-red-400 px-1">
          {error.message}
        </p>
      )}
    </div>
  );
}
