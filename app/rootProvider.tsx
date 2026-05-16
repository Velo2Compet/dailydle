"use client";
import { ReactNode } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";

export function RootProvider({ children }: { children: ReactNode }) {
  // Utiliser la clé API seulement si elle est définie
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || undefined;

  // Private RPC URL (Alchemy, QuickNode, CDP, etc.). Without this OnchainKit
  // falls back to the public Coinbase RPC which is heavily rate-limited and
  // 429s on any moderate traffic spike.
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || undefined;

  return (
    <OnchainKitProvider
      {...(apiKey && { apiKey })}
      {...(rpcUrl && { rpcUrl })}
      chain={base}
      config={{
        analytics: false,
        appearance: {
          mode: "auto",
        },
        wallet: {
          display: "modal",
          preference: "all",
        },
      }}
      projectId={undefined}
      miniKit={{
        enabled: true,
        autoConnect: true,
        notificationProxyUrl: undefined,
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
