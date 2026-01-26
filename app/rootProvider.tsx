"use client";
import { ReactNode } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";

export function RootProvider({ children }: { children: ReactNode }) {
  // Utiliser la clé API seulement si elle est définie
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || undefined;

  return (
    <OnchainKitProvider
      {...(apiKey && { apiKey })}
      chain={base}
      config={{
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
