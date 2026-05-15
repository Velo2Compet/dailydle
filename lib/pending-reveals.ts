/**
 * Server-side stash for guess data that must NOT be exposed before the
 * player has paid on-chain. Keyed by the opaque saltedGuess.
 *
 * `/api/guess` writes the entry (after computing correctness/comparisons
 * server-side). `/api/reveal` reads it back AFTER validating the on-chain
 * commit receipt — that's what gates the correctness bit and the win
 * signature behind a real payment.
 *
 * Backed by Upstash Redis when configured; falls back to a per-instance
 * in-memory Map when not. Redis is the one that actually works in
 * production: serverless cold-starts break the in-memory path (a
 * /api/reveal call hitting a different lambda than /api/guess sees no
 * pending entry).
 */

import type { AttributeComparison } from "@/types/game";
import { getRedis } from "@/lib/redis";

export interface PendingReveal {
  comparisons: AttributeComparison[];
  guessedCharacter: { id: number; name: string; imageUrl?: string };
  dailyCharacter: { id: number; name: string; imageUrl?: string };
  isCorrect: boolean;
  shouldFlag: boolean;
  playerAddress: string; // lowercased
  collectionId: number;
  day: number;
}

const PENDING_TTL_S = 10 * 60; // 10 min — covers wallet popup + tx inclusion

function pendingKey(saltedGuess: string): string {
  return `pending:${saltedGuess.toLowerCase()}`;
}
function revealedKey(saltedGuess: string): string {
  return `revealed:${saltedGuess.toLowerCase()}`;
}

// =============================================================================
// In-memory fallback — only used when Upstash env vars are missing.
// =============================================================================

interface MemEntry {
  data: PendingReveal;
  expiresAt: number;
}
const memStore = new Map<string, MemEntry>();
const memRevealed = new Map<string, number>(); // saltedGuess -> expiresAt
const MAX_MEM_ENTRIES = 10_000;

function memPurgeExpired(now: number): void {
  for (const [k, v] of memStore) if (v.expiresAt < now) memStore.delete(k);
  for (const [k, exp] of memRevealed) if (exp < now) memRevealed.delete(k);
}

// =============================================================================
// Public async API
// =============================================================================

export async function setPendingReveal(
  saltedGuess: string,
  data: PendingReveal
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(pendingKey(saltedGuess), JSON.stringify(data), {
      ex: PENDING_TTL_S,
    });
    return;
  }

  const now = Date.now();
  memPurgeExpired(now);
  if (memStore.size >= MAX_MEM_ENTRIES) {
    const oldestKey = memStore.keys().next().value;
    if (oldestKey) memStore.delete(oldestKey);
  }
  memStore.set(pendingKey(saltedGuess), {
    data,
    expiresAt: now + PENDING_TTL_S * 1000,
  });
}

export async function getPendingReveal(saltedGuess: string): Promise<PendingReveal | null> {
  const redis = getRedis();
  if (redis) {
    // Upstash auto-deserialises JSON; fall back to string-parsing if not.
    const raw = await redis.get<PendingReveal | string>(pendingKey(saltedGuess));
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as PendingReveal;
      } catch {
        return null;
      }
    }
    return raw;
  }

  const now = Date.now();
  const entry = memStore.get(pendingKey(saltedGuess));
  if (!entry) return null;
  if (entry.expiresAt < now) {
    memStore.delete(pendingKey(saltedGuess));
    return null;
  }
  return entry.data;
}

/**
 * Atomically mark a saltedGuess as revealed. Returns true on the first
 * call, false on subsequent calls — keeps /api/reveal idempotent so
 * client retries (e.g. page refresh after a tx) don't trigger duplicate
 * server-side side-effects.
 */
export async function markRevealedFirstTime(saltedGuess: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    // SET ... NX EX — atomic "set if not exists with TTL". Returns "OK"
    // when the key was actually set, null when it already existed.
    const res = await redis.set(revealedKey(saltedGuess), "1", {
      nx: true,
      ex: PENDING_TTL_S,
    });
    return res === "OK";
  }

  const now = Date.now();
  const existing = memRevealed.get(revealedKey(saltedGuess));
  if (existing && existing > now) return false;
  memRevealed.set(revealedKey(saltedGuess), now + PENDING_TTL_S * 1000);
  return true;
}
