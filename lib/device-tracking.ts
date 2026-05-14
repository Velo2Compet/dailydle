/**
 * Per-device wallet tracking used to detect multi-wallet abuse.
 *
 * The first wallet seen on a device stays protected; any additional
 * wallets on the same device are flagged so on-chain rewards can't be
 * farmed via fresh wallets sharing one player.
 *
 * Backed by Upstash Redis when configured. The in-memory fallback is
 * acceptable for local dev only — across serverless instances/cold
 * starts, an attacker could appear "fresh" repeatedly and bypass the
 * multi-wallet flag entirely.
 */

import { getRedis } from "@/lib/redis";

const DEVICE_TTL_S = 60 * 60 * 24 * 90; // 90 days — long enough that a casual user staying logged in keeps their "first wallet" protection through a season; short enough to age out abandoned device ids.
const MULTI_WALLET_THRESHOLD = 2;

function walletsKey(deviceId: string): string {
  return `device:${deviceId}:wallets`;
}
function firstWalletKey(deviceId: string): string {
  return `device:${deviceId}:first`;
}

// =============================================================================
// In-memory fallback
// =============================================================================

const memWallets = new Map<string, Set<string>>();
const memFirst = new Map<string, string>();

// =============================================================================
// Public API
// =============================================================================

export interface DeviceWalletInfo {
  isMultiWallet: boolean;
  walletsOnDevice: string[];
  isNewWalletOnDevice: boolean;
  isFirstWalletOnDevice: boolean;
  firstWallet: string | null;
}

export async function trackDeviceWallet(
  deviceId: string,
  walletAddress: string
): Promise<DeviceWalletInfo> {
  const address = walletAddress.toLowerCase();
  const redis = getRedis();

  if (redis) {
    // SADD returns 1 if the member was newly added, 0 if already present.
    const added = await redis.sadd(walletsKey(deviceId), address);
    const isNewWalletOnDevice = added === 1;

    // SET ... NX — only sets if the key didn't exist. First wallet wins.
    if (isNewWalletOnDevice) {
      await redis.set(firstWalletKey(deviceId), address, {
        nx: true,
        ex: DEVICE_TTL_S,
      });
      await redis.expire(walletsKey(deviceId), DEVICE_TTL_S);
    }

    const walletsList = (await redis.smembers(walletsKey(deviceId))) as string[];
    const firstWallet =
      (await redis.get<string | null>(firstWalletKey(deviceId))) ?? null;

    return {
      isMultiWallet: walletsList.length >= MULTI_WALLET_THRESHOLD,
      walletsOnDevice: walletsList,
      isNewWalletOnDevice,
      isFirstWalletOnDevice: firstWallet === address,
      firstWallet,
    };
  }

  // In-memory fallback (dev only — see header).
  if (!memWallets.has(deviceId)) memWallets.set(deviceId, new Set());
  const walletsOnDevice = memWallets.get(deviceId)!;
  const isNewWalletOnDevice = !walletsOnDevice.has(address);

  if (isNewWalletOnDevice) {
    walletsOnDevice.add(address);
    if (!memFirst.has(deviceId)) memFirst.set(deviceId, address);
  }

  const firstWallet = memFirst.get(deviceId) ?? null;
  const walletsList = Array.from(walletsOnDevice);

  return {
    isMultiWallet: walletsList.length >= MULTI_WALLET_THRESHOLD,
    walletsOnDevice: walletsList,
    isNewWalletOnDevice,
    isFirstWalletOnDevice: firstWallet === address,
    firstWallet,
  };
}

export async function getDeviceFirstWallet(deviceId: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    return (await redis.get<string | null>(firstWalletKey(deviceId))) ?? null;
  }
  return memFirst.get(deviceId) ?? null;
}
