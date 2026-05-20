"use client";

import { useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

/**
 * Calls setFrameReady() once on mount so the Farcaster / Base App host
 * delivers `context` (user.fid, client info, …) before any page interaction.
 *
 * Mounted globally inside <OnchainKitProvider> by RootProvider — do not
 * duplicate this in per-page components.
 */
export function MiniKitReady() {
  const { isFrameReady, setFrameReady } = useMiniKit();

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [isFrameReady, setFrameReady]);

  return null;
}
