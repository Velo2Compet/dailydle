/*
 * Rotate the secrets that can be regenerated locally and patch .env.local.
 *
 *   node ./smart-contracts/scripts/rotate-secrets.js
 *
 * Generates fresh values for:
 *   - SALT_DECRYPT          (32-byte hex, the daily-character salt — keystone of the game)
 *   - ADMIN_SECRET          (32-byte hex, /api/flag-wallet auth)
 *   - DEVICE_COOKIE_SECRET  (32-byte hex, HMAC for the qz-did device cookie)
 *   - SERVER_PRIVATE_KEY    (fresh ECDSA wallet, signs guess/win attestations)
 *
 * Does NOT rotate:
 *   - PRIVATE_KEY (the owner of the contracts — replacing it means losing
 *     admin control, requires a separate owner-transfer flow we don't support).
 *   - QUIZZDLE_API_KEY (server-side, regenerate from quizzdle.com).
 *   - UPSTASH_REDIS_REST_TOKEN (Upstash dashboard).
 *
 * If used after the main contract is already deployed, you MUST follow up
 * with `npx hardhat run smart-contracts/scripts/set-server.js --network <net>`
 * so the on-chain server address matches the new key.
 *
 * Exports `rotateSecrets({ envPath?, dryRun?, only? })` so deploy-and-setup.js
 * can call it as part of a fresh setup without spawning a child process.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_ENV_PATH = path.resolve(process.cwd(), ".env.local");

const ROTATABLE = ["SALT_DECRYPT", "ADMIN_SECRET", "DEVICE_COOKIE_SECRET", "SERVER_PRIVATE_KEY"];

function randomHex32() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generates a new ECDSA private key and returns { privateKey, address }.
 * We use crypto.generateKeyPairSync to avoid pulling ethers as a hard dep —
 * but for the address derivation we still need secp256k1 math. Since the
 * project already has ethers transitively via hardhat, lazy-require it.
 */
function newWallet() {
  const { ethers } = require("ethers");
  const wallet = ethers.Wallet.createRandom();
  return { privateKey: wallet.privateKey, address: wallet.address };
}

/**
 * In-place patch of an env file. Replaces existing KEY=…, appends new ones,
 * preserves all other lines and comments. Backs up the previous file.
 *
 * This is intentionally the same shape as the patcher in deploy-and-setup.js
 * — duplicating ~20 lines is cheaper than dragging a shared module across
 * a hardhat-runtime / plain-node boundary.
 */
function patchEnv(envPath, updates) {
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, "");
  }
  const backup = `${envPath}.backup-${Date.now()}`;
  fs.copyFileSync(envPath, backup);

  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);
  const present = new Set();

  const newLines = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!m) return line;
    const key = m[1];
    if (!(key in updates)) return line;
    present.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!present.has(key)) newLines.push(`${key}=${value}`);
  }

  while (newLines.length && newLines[newLines.length - 1].trim() === "") {
    newLines.pop();
  }
  newLines.push("");

  fs.writeFileSync(envPath, newLines.join("\n"));
  return backup;
}

/**
 * Generates new values for the requested keys (default: all rotatables).
 * Returns the updates object + new server address (when applicable) so the
 * caller can decide what to do next (e.g. setServer on-chain).
 */
function generateRotations(only = ROTATABLE) {
  const updates = {};
  let newServerAddress = null;

  if (only.includes("SALT_DECRYPT")) {
    updates.SALT_DECRYPT = "0x" + randomHex32();
  }
  if (only.includes("ADMIN_SECRET")) {
    updates.ADMIN_SECRET = randomHex32();
  }
  if (only.includes("DEVICE_COOKIE_SECRET")) {
    updates.DEVICE_COOKIE_SECRET = randomHex32();
  }
  if (only.includes("SERVER_PRIVATE_KEY")) {
    const w = newWallet();
    updates.SERVER_PRIVATE_KEY = w.privateKey;
    newServerAddress = w.address;
  }

  return { updates, newServerAddress };
}

/**
 * High-level entry point. Generates + persists. Returns metadata so the
 * caller can print or chain follow-up actions.
 */
function rotateSecrets({ envPath = DEFAULT_ENV_PATH, dryRun = false, only } = {}) {
  const { updates, newServerAddress } = generateRotations(only);

  let backup = null;
  if (!dryRun) {
    backup = patchEnv(envPath, updates);
  }

  return {
    rotated: Object.keys(updates),
    newServerAddress,
    backup,
    envPath,
  };
}

module.exports = { rotateSecrets, generateRotations, patchEnv, ROTATABLE };

// Standalone-CLI mode: run only when invoked directly.
if (require.main === module) {
  const result = rotateSecrets();
  console.log("");
  console.log("=".repeat(72));
  console.log("🔁 SECRETS ROTATED");
  console.log("=".repeat(72));
  console.log(`Rotated:  ${result.rotated.join(", ")}`);
  if (result.newServerAddress) {
    console.log(`New server address: ${result.newServerAddress}`);
  }
  console.log(`Env file: ${result.envPath}`);
  console.log(`Backup:   ${path.basename(result.backup)}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. If the main contract is already deployed, sync the on-chain");
  console.log("     server address to your new SERVER_PRIVATE_KEY:");
  console.log("       npx hardhat run smart-contracts/scripts/set-server.js --network base");
  console.log("     (use --network base-sepolia for testnet)");
  console.log("");
  console.log("  2. Manually rotate the secrets that can't be regenerated locally:");
  console.log("     - QUIZZDLE_API_KEY        (regenerate in the Quizzdle backend)");
  console.log("     - UPSTASH_REDIS_REST_TOKEN (create a new Upstash DB, copy token)");
  console.log("");
  console.log("  3. Push the new env to Vercel via Settings → Environment Variables → Import.");
  console.log("");
}
