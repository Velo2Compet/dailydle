const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * One-shot deploy + setup script.
 *
 * What it does, in order:
 *   1. Deploys QuizzdleReferal (skipped if --reuse-referal and an address
 *      is already set in .env.local).
 *   2. Deploys GmQuizzdle (skipped if --reuse-gm and an address is already
 *      set in .env.local). Optional — set --skip-gm to leave it out entirely.
 *   3. Deploys the main Quizzdle contract (always fresh unless --reuse-main).
 *   4. Wires it up: setServer (if SERVER_PRIVATE_KEY differs from deployer)
 *      and setReferralContract.
 *   5. Pulls the full Quizzdle catalogue (lang=en, paginated) and calls
 *      addCollection for every category. Skips those already registered.
 *   6. Patches `.env.local` in place with the three NEXT_PUBLIC_*_ADDRESS
 *      values. Old file is backed up next to it as
 *      `.env.local.backup-<timestamp>`.
 *   7. Prints a Vercel-paste-ready env block at the end.
 *
 * Usage:
 *   # Fresh deploy on Sepolia:
 *   npx hardhat run smart-contracts/scripts/deploy-and-setup.js --network base-sepolia
 *
 *   # Same on Base mainnet (after a successful Sepolia run):
 *   npx hardhat run smart-contracts/scripts/deploy-and-setup.js --network base
 *
 *   # Reuse existing addresses (no redeploy), only register missing collections:
 *   REUSE=1 npx hardhat run smart-contracts/scripts/deploy-and-setup.js --network base-sepolia
 *
 *   # Skip the GM contract:
 *   SKIP_GM=1 npx hardhat run smart-contracts/scripts/deploy-and-setup.js --network base-sepolia
 *
 * Flags via env (hardhat scripts don't get CLI args):
 *   REUSE=1       — keep existing addresses where present (don't redeploy)
 *   SKIP_GM=1     — don't deploy GmQuizzdle
 *   SKIP_REFERAL=1 — don't deploy QuizzdleReferal (Quizzdle won't be wired to it either)
 *   SKIP_COLLECTIONS=1 — don't fetch/register collections
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REUSE = process.env.REUSE === "1";
const SKIP_GM = process.env.SKIP_GM === "1";
const SKIP_REFERAL = process.env.SKIP_REFERAL === "1";
const SKIP_COLLECTIONS = process.env.SKIP_COLLECTIONS === "1";

const ENV_PATH = path.resolve(process.cwd(), ".env.local");
const LANG = "en";
const PAGE_LIMIT = 50; // server cap on the Quizzdle API
const QUIZZDLE_API_URL = process.env.NEXT_PUBLIC_QUIZZDLE_API_URL || "https://quizzdle.com";
const QUIZZDLE_API_KEY = process.env.QUIZZDLE_API_KEY;

function log(emoji, msg) {
  console.log(`${emoji} ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry a contract call N times with a delay. Works around public-RPC
 * read-after-write lag on Base/Base Sepolia: a freshly-deployed contract
 * can return `0x` for the first 1–2 blocks because the eth_getCode index
 * hasn't caught up. Errors that aren't transient bubble up immediately.
 */
async function retry(fn, { attempts = 5, delayMs = 2500, label = "call" } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient =
        err?.code === "BAD_DATA" ||
        err?.code === "CALL_EXCEPTION" ||
        /could not decode result|missing revert data|empty/i.test(err?.message || "");
      if (!transient) throw err;
      log("⏳", `${label} not ready (RPC lag), retry ${i + 1}/${attempts} in ${delayMs}ms…`);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

function header(label) {
  console.log("");
  console.log("=".repeat(72));
  console.log(label);
  console.log("=".repeat(72));
}

function step(n, label) {
  console.log("");
  console.log(`${n}. ${label}`);
  console.log("-".repeat(72));
}

async function fetchPage(page) {
  const url = `${QUIZZDLE_API_URL}/api/public/categories?lang=${LANG}&limit=${PAGE_LIMIT}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": QUIZZDLE_API_KEY,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Quizzdle /categories page ${page}: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const items = data?.data ?? (Array.isArray(data) ? data : []);
  const pagination = data?.pagination ?? null;
  return { items: Array.isArray(items) ? items : [], pagination };
}

async function fetchAllCategories() {
  const first = await fetchPage(1);
  const total = first.pagination?.total_pages ?? 1;
  if (total <= 1) return first.items;
  const rest = await Promise.all(
    Array.from({ length: total - 1 }, (_, i) => fetchPage(i + 2))
  );
  return first.items.concat(...rest.map((r) => r.items));
}

/**
 * In-place patch of .env.local. Replaces existing KEY=…, appends new ones,
 * preserves all other lines and comments. Backs up the previous file.
 */
function patchEnvLocal(updates) {
  if (!fs.existsSync(ENV_PATH)) {
    fs.writeFileSync(ENV_PATH, "");
  }
  const backup = `${ENV_PATH}.backup-${Date.now()}`;
  fs.copyFileSync(ENV_PATH, backup);

  const content = fs.readFileSync(ENV_PATH, "utf8");
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

  // Append any keys that weren't already in the file.
  for (const [key, value] of Object.entries(updates)) {
    if (!present.has(key)) newLines.push(`${key}=${value}`);
  }

  // Trim trailing empty blocks but keep at least one trailing newline.
  while (newLines.length && newLines[newLines.length - 1].trim() === "") {
    newLines.pop();
  }
  newLines.push("");

  fs.writeFileSync(ENV_PATH, newLines.join("\n"));
  return backup;
}

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

async function preflight() {
  header("PRE-FLIGHT CHECKS");

  log("🌐", `Network: ${network.name} (chainId resolved at runtime)`);

  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is not set in .env.local — the deployer needs ETH.");
  }
  if (!QUIZZDLE_API_KEY && !SKIP_COLLECTIONS) {
    throw new Error(
      "QUIZZDLE_API_KEY is not set — needed to fetch the collection list. " +
        "Set SKIP_COLLECTIONS=1 to deploy without registering collections."
    );
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  log("👤", `Deployer: ${deployer.address}`);
  log("💰", `Balance: ${ethers.formatEther(balance)} ETH`);

  // Rough order-of-magnitude check. Mainnet deploys are ~$0.50 in gas.
  if (balance < ethers.parseEther("0.003")) {
    throw new Error(
      "Balance below 0.003 ETH — likely insufficient to deploy all contracts + register 40 collections. " +
        "Top up the deployer wallet first."
    );
  }

  const serverKey = process.env.SERVER_PRIVATE_KEY;
  let serverAddress = deployer.address;
  if (serverKey) {
    serverAddress = new ethers.Wallet(serverKey).address;
    log("🖥️", `Server signer: ${serverAddress}`);
    if (serverAddress === deployer.address) {
      log("⚠️", "SERVER_PRIVATE_KEY matches PRIVATE_KEY — single point of failure, OK for testnet but rotate for prod.");
    }
  } else {
    log("⚠️", "No SERVER_PRIVATE_KEY — falling back to deployer as server. Set a separate key before prod.");
  }

  return { deployer, serverAddress };
}

// ---------------------------------------------------------------------------
// Deploys
// ---------------------------------------------------------------------------

async function deployReferal() {
  if (SKIP_REFERAL) {
    log("⏭️", "Skipping QuizzdleReferal deploy (SKIP_REFERAL=1)");
    return process.env.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS || null;
  }
  const existing = process.env.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS;
  if (REUSE && existing && existing !== "0x0000000000000000000000000000000000000000") {
    log("♻️", `Reusing existing QuizzdleReferal at ${existing}`);
    return existing;
  }

  const factory = await ethers.getContractFactory("QuizzdleReferal");
  log("📤", "Deploying QuizzdleReferal…");
  const c = await factory.deploy();
  await c.waitForDeployment();
  const address = await c.getAddress();
  log("✅", `QuizzdleReferal: ${address}`);
  return address;
}

async function deployGm() {
  if (SKIP_GM) {
    log("⏭️", "Skipping GmQuizzdle deploy (SKIP_GM=1)");
    return process.env.NEXT_PUBLIC_GM_CONTRACT_ADDRESS || null;
  }
  const existing = process.env.NEXT_PUBLIC_GM_CONTRACT_ADDRESS;
  if (REUSE && existing && existing !== "0x0000000000000000000000000000000000000000") {
    log("♻️", `Reusing existing GmQuizzdle at ${existing}`);
    return existing;
  }

  const factory = await ethers.getContractFactory("GmQuizzdle");
  log("📤", "Deploying GmQuizzdle…");
  const c = await factory.deploy();
  await c.waitForDeployment();
  const address = await c.getAddress();
  log("✅", `GmQuizzdle: ${address}`);
  return address;
}

async function deployMain() {
  const existing = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (REUSE && existing && existing !== "0x0000000000000000000000000000000000000000") {
    log("♻️", `Reusing existing Quizzdle at ${existing}`);
    return { address: existing, contract: await ethers.getContractAt("Quizzdle", existing) };
  }

  const factory = await ethers.getContractFactory("Quizzdle");
  log("📤", "Deploying Quizzdle (main)…");
  const c = await factory.deploy();
  await c.waitForDeployment();
  const address = await c.getAddress();
  log("✅", `Quizzdle: ${address}`);
  return { address, contract: c };
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function setServerIfNeeded(quizzdle, deployer, serverAddress) {
  if (serverAddress === deployer.address) {
    log("ℹ️", "Server address equals deployer — setServer skipped (default already correct).");
    return;
  }
  const current = await retry(() => quizzdle.server(), { label: "server()" });
  if (current.toLowerCase() === serverAddress.toLowerCase()) {
    log("ℹ️", `setServer skipped — already set to ${serverAddress}`);
    return;
  }
  log("📤", `setServer(${serverAddress})…`);
  const tx = await quizzdle.setServer(serverAddress);
  await tx.wait();
  log("✅", `Server set. TX: ${tx.hash}`);
}

async function setReferralIfNeeded(quizzdle, referalAddress) {
  if (!referalAddress) return;
  const current = await retry(() => quizzdle.referralContract(), { label: "referralContract()" });
  if (current.toLowerCase() === referalAddress.toLowerCase()) {
    log("ℹ️", `setReferralContract skipped — already set to ${referalAddress}`);
    return;
  }
  log("📤", `setReferralContract(${referalAddress})…`);
  const tx = await quizzdle.setReferralContract(referalAddress);
  await tx.wait();
  log("✅", `Referral wired. TX: ${tx.hash}`);
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

async function registerCollections(quizzdle) {
  if (SKIP_COLLECTIONS) {
    log("⏭️", "Skipping collection registration (SKIP_COLLECTIONS=1)");
    return;
  }
  log("📥", "Fetching catalogue from Quizzdle API…");
  const categories = await fetchAllCategories();
  log("📦", `Found ${categories.length} categories`);

  let added = 0;
  let already = 0;
  let failed = 0;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const tag = `[${i + 1}/${categories.length}] Collection ${cat.id} (${cat.name})`;

    try {
      const exists = await retry(
        () => quizzdle.collectionExists(cat.id),
        { label: `collectionExists(${cat.id})`, attempts: 3, delayMs: 1500 }
      );
      if (exists) {
        log("✅", `${tag} — already registered`);
        already++;
        continue;
      }
      const tx = await quizzdle.addCollection(cat.id);
      await tx.wait();
      log("✨", `${tag} — added (tx ${tx.hash})`);
      added++;
      // Light delay so we don't hammer the RPC on shared nodes.
      await sleep(800);
    } catch (err) {
      log("❌", `${tag} — failed: ${(err.message || err).toString().split("\n")[0]}`);
      failed++;
    }
  }

  console.log("");
  log("📊", `Collections — added: ${added} · existed: ${already} · failed: ${failed}`);
  if (failed > 0) {
    log("⚠️", "Some collections failed. Re-run the script with REUSE=1 to retry only the missing ones.");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  header(`🚀 DEPLOY + SETUP — ${network.name}`);

  const { deployer, serverAddress } = await preflight();

  step("1", "REFERRAL CONTRACT");
  const referalAddress = await deployReferal();

  step("2", "GM CONTRACT");
  const gmAddress = await deployGm();

  step("3", "MAIN QUIZZDLE CONTRACT");
  const { address: mainAddress, contract: quizzdle } = await deployMain();

  // Persist addresses to .env.local *now*, before any post-deploy step that
  // might fail. Earlier versions of this script wired the contract first and
  // patched env last — if wire-up hit RPC read-after-write lag and threw,
  // the user lost the freshly-deployed addresses and had to redeploy from
  // scratch (paying gas again). With the patch up front, a re-run with
  // REUSE=1 just resumes from the wiring step.
  step("4", "PATCH .env.local (early — survives any later failure)");
  const updates = {
    NEXT_PUBLIC_CONTRACT_ADDRESS: mainAddress,
  };
  if (referalAddress) updates.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS = referalAddress;
  if (gmAddress) updates.NEXT_PUBLIC_GM_CONTRACT_ADDRESS = gmAddress;
  const backup = patchEnvLocal(updates);
  log("💾", `.env.local updated. Backup: ${path.basename(backup)}`);

  // Small idle before reading post-deploy state, so the RPC index has time
  // to catch up. The retry helper handles longer delays, but a baseline
  // pause cuts the common-case retry log noise.
  await sleep(3000);

  step("5", "WIRE UP THE MAIN CONTRACT");
  try {
    await setServerIfNeeded(quizzdle, deployer, serverAddress);
    await setReferralIfNeeded(quizzdle, referalAddress);
  } catch (err) {
    log("❌", `Wire-up failed: ${(err.message || err).toString().split("\n")[0]}`);
    log("ℹ️", `Re-run \`REUSE=1 npm run setup:${network.name}\` to retry just the wire-up + collection step.`);
    throw err;
  }

  step("6", "REGISTER COLLECTIONS");
  await registerCollections(quizzdle);

  // -------------------------------------------------------------------------
  // Final summary — Vercel-friendly env block
  // -------------------------------------------------------------------------
  header("✅ DONE");
  console.log("");
  console.log("Vercel env block (copy/paste into Project Settings → Environment Variables → bulk import):");
  console.log("-".repeat(72));
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${mainAddress}`);
  if (referalAddress) console.log(`NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS=${referalAddress}`);
  if (gmAddress) console.log(`NEXT_PUBLIC_GM_CONTRACT_ADDRESS=${gmAddress}`);
  console.log("-".repeat(72));
  console.log("");
  console.log("Other env vars you still need to push to Vercel (not generated here):");
  console.log("  NEXT_PUBLIC_CHAIN_ID, NEXT_PUBLIC_URL, NEXT_PUBLIC_QUIZZDLE_API_URL,");
  console.log("  NEXT_PUBLIC_ONCHAINKIT_API_KEY, QUIZZDLE_API_KEY, SERVER_PRIVATE_KEY,");
  console.log("  SALT_DECRYPT, ADMIN_SECRET, DEVICE_COOKIE_SECRET,");
  console.log("  UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,");
  console.log("  HEADER, PAYLOAD, SIGNATURE (Farcaster account-association).");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("");
    console.error("❌ Script failed:");
    console.error(err);
    process.exit(1);
  });
