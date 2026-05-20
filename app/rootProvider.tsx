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
import { MiniKitReady } from "./MiniKitReady";

/**
 * We build our own wagmi config and wrap OnchainKitProvider with a
 * <WagmiProvider/>. Otherwise OnchainKit creates an internal wagmi config
 * via createWagmiConfig.js that only honors `apiKey` (CDP) and ignores
 * the `rpcUrl` prop — every `useReadContract` hook would then fall back
 * to wagmi/chains.base.rpcUrls.default (`https://mainnet.base.org`),
 * which 429s the moment we get any traffic.
 *
 * Connector order matters:
 *   - <ConnectWallet/> in OnchainKit, when it detects a mini-app context,
 *     does a direct connect({ connector: connectors[0] }) bypassing the
 *     wallet selection modal. Inside Base App's in-app browser (post
 *     April-2026 migration) the Farcaster mini-app wallet provider is no
 *     longer wired — only baseAccount works. So baseAccount comes first.
 *   - farcasterMiniApp() stays in the array as a fallback for Warpcast or
 *     any other Farcaster client that still exposes sdk.wallet.ethProvider.
 */
function buildWagmiConfig() {
  return createConfig({
    chains: [base, baseSepolia],
    connectors: [
      baseAccount({ appName: "Dailydle" }),
      farcasterMiniApp(),
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
        <MiniKitReady />
        {children}
      </OnchainKitProvider>
    </WagmiProvider>
  );
}
