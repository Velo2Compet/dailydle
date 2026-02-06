/**
 * Device fingerprinting for multi-wallet detection
 *
 * Generates a unique device ID stored in localStorage.
 * This ID is sent with each guess to detect if multiple wallets
 * are being used from the same device.
 */

const DEVICE_ID_KEY = "quizzdle-device-id";
const WALLETS_KEY = "quizzdle-known-wallets";

/**
 * Generate a random device ID
 */
function generateDeviceId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create device ID
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Track wallet usage on this device
 * Returns true if this is a NEW wallet on this device (potential multi-wallet)
 */
export function trackWalletOnDevice(walletAddress: string): { isNewWallet: boolean; walletsOnDevice: string[] } {
  if (typeof window === "undefined") return { isNewWallet: false, walletsOnDevice: [] };

  const address = walletAddress.toLowerCase();

  // Get existing wallets on this device
  const existingData = localStorage.getItem(WALLETS_KEY);
  const wallets: string[] = existingData ? JSON.parse(existingData) : [];

  // Check if this wallet is new
  const isNewWallet = !wallets.includes(address);

  // Add wallet if new
  if (isNewWallet) {
    wallets.push(address);
    localStorage.setItem(WALLETS_KEY, JSON.stringify(wallets));
  }

  return {
    isNewWallet,
    walletsOnDevice: wallets,
  };
}

/**
 * Get all wallets that have been used on this device
 */
export function getWalletsOnDevice(): string[] {
  if (typeof window === "undefined") return [];

  const existingData = localStorage.getItem(WALLETS_KEY);
  return existingData ? JSON.parse(existingData) : [];
}

/**
 * Check if multiple wallets have been used on this device
 */
export function isMultiWalletDevice(): boolean {
  return getWalletsOnDevice().length > 1;
}
