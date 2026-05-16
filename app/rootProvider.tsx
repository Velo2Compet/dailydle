"use client";
import { ReactNode, useState } from "react";
import { base, baseSepolia } from "wagmi/chains";
import {
  createConfig,
  http,
  WagmiProvider,
  createStorage,
  cookieStorage,
} from "wagmi";
import { baseAccount } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { APP_TRANSPORT, APP_CHAIN_ID } from "@/lib/chain-config";

/**
 * We build our own wagmi config and wrap OnchainKitProvider with a
 * <WagmiProvider/>. Otherwise OnchainKit creates an internal wagmi config
 * via createWagmiConfig.js that only honors `apiKey` (CDP) and ignores
 * the `rpcUrl` prop — every `useReadContract` hook would then fall back
 * to wagmi/chains.base.rpcUrls.default (`https://mainnet.base.org`),
 * which 429s the moment we get any traffic.
 *
 * useProviderDependencies inside OnchainKit detects the ancestor
 * WagmiProvider via useConfig() and skips its own — so the connectors,
 * transports and storage we define here are the ones in effect.
 *
 * Connector order matters: OnchainKit's <AutoConnect/> picks
 * connectors[0] when it detects a Farcaster / Base App mini-app context,
 * so farcasterMiniApp must come first.
 */
function buildWagmiConfig() {
  return createConfig({
    chains: [base, baseSepolia],
    connectors: [
      farcasterMiniApp(),
      baseAccount({ appName: "Dailydle" }),
    ],
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
    transports: {
      [base.id]: APP_CHAIN_ID === base.id ? APP_TRANSPORT : http(),
      [baseSepolia.id]:
        APP_CHAIN_ID === baseSepolia.id ? APP_TRANSPORT : http(),
    },
  });
}

export function RootProvider({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || undefined;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || undefined;

  // Build once per mount; useState keeps the same reference across renders.
  const [wagmiConfig] = useState(buildWagmiConfig);

  return (
    <WagmiProvider config={wagmiConfig}>
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
    </WagmiProvider>
  );
}
