/**
 * Server-side store for guess data that must NOT be exposed before the
 * player has paid on-chain.
 *
 * Why this exists: `/api/guess` used to return `comparisons` and (when
 * correct) the full `dailyCharacter` directly in its JSON response, with
 * no proof of payment. An attacker could call the endpoint up to
 * MAX_INFLIGHT_GUESSES times for free and use the per-attribute
 * higher/lower hints to converge on the daily character in 3-5 tries,
 * then pay exactly one winning tx.
 *
 * Mitigation: `/api/guess` stashes those fields here (keyed by the
 * opaque saltedGuess) and returns only what is needed for the
 * on-chain transaction. After the tx is mined, `/api/reveal` proves
 * payment via RPC and pulls the stored data out.
 *
 * Backed by Upstash Redis when configured; falls back to a per-instance
 * in-memory Map when not. The Redis path is the one that actually
 * works in production: serverless cold-starts and autoscaling break
 * the in-memory path (a /api/reveal call hitting a different lambda
 * than /api/guess sees no pending entry; an attacker can multiply
 * their inflight quota by the number of instances).
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
  rateLimitKey: string;
}

const PENDING_TTL_S = 10 * 60; // 10 min — covers wallet popup + tx inclusion
const RATE_TTL_S = 24 * 60 * 60; // 24 h — matches the daily game cycle

function pendingKey(saltedGuess: string): string {
  return `pending:${saltedGuess.toLowerCase()}`;
}
function revealedKey(saltedGuess: string): string {
  return `revealed:${saltedGuess.toLowerCase()}`;
}
function inflightKey(rateKey: string): string {
  return `rate:${rateKey}:inflight`;
}
function totalKey(rateKey: string): string {
  return `rate:${rateKey}:total`;
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

interface MemRate {
  inflight: number;
  total: number;
  expiresAt: number;
}
const memRate = new Map<string, MemRate>();
const MAX_MEM_ENTRIES = 10_000;

function memPurgeExpired(now: number): void {
  for (const [k, v] of memStore) if (v.expiresAt < now) memStore.delete(k);
  for (const [k, exp] of memRevealed) if (exp < now) memRevealed.delete(k);
  for (const [k, v] of memRate) if (v.expiresAt < now) memRate.delete(k);
}

function memGetRate(rateKey: string, now: number): MemRate {
  const existing = memRate.get(rateKey);
  if (existing && existing.expiresAt > now) return existing;
  const fresh: MemRate = { inflight: 0, total: 0, expiresAt: now + RATE_TTL_S * 1000 };
  memRate.set(rateKey, fresh);
  return fresh;
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
 * call, false on subsequent calls — used by /api/reveal to decrement
 * the rate-limit counter exactly once even if the client retries.
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

/**
 * Atomically increment the inflight counter and return the new value.
 * Caller checks against the cap; if exceeded, must call
 * decrementInflight() to roll back.
 */
export async function incrementInflight(rateKey: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const newCount = await redis.incr(inflightKey(rateKey));
    // Refresh TTL on every write so abandoned rate keys age out.
    await redis.expire(inflightKey(rateKey), RATE_TTL_S);
    return newCount;
  }

  const now = Date.now();
  const rate = memGetRate(rateKey, now);
  rate.inflight += 1;
  rate.expiresAt = now + RATE_TTL_S * 1000;
  return rate.inflight;
}

export async function decrementInflight(rateKey: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const newCount = await redis.decr(inflightKey(rateKey));
    if (newCount < 0) {
      // Guard against drift from missed pairings.
      await redis.set(inflightKey(rateKey), 0, { ex: RATE_TTL_S });
    }
    return;
  }

  const rate = memRate.get(rateKey);
  if (!rate) return;
  rate.inflight = Math.max(0, rate.inflight - 1);
}

/**
 * Atomically increment the daily total counter and return the new value.
 */
export async function incrementTotal(rateKey: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const newCount = await redis.incr(totalKey(rateKey));
    await redis.expire(totalKey(rateKey), RATE_TTL_S);
    return newCount;
  }

  const now = Date.now();
  const rate = memGetRate(rateKey, now);
  rate.total += 1;
  rate.expiresAt = now + RATE_TTL_S * 1000;
  return rate.total;
}

export async function decrementTotal(rateKey: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const newCount = await redis.decr(totalKey(rateKey));
    if (newCount < 0) {
      await redis.set(totalKey(rateKey), 0, { ex: RATE_TTL_S });
    }
    return;
  }

  const rate = memRate.get(rateKey);
  if (!rate) return;
  rate.total = Math.max(0, rate.total - 1);
}

export async function peekTotal(rateKey: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const v = await redis.get<number | string | null>(totalKey(rateKey));
    if (v === null || v === undefined) return 0;
    return typeof v === "number" ? v : Number(v) || 0;
  }
  const rate = memRate.get(rateKey);
  if (!rate || rate.expiresAt < Date.now()) return 0;
  return rate.total;
}

export async function peekInflight(rateKey: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const v = await redis.get<number | string | null>(inflightKey(rateKey));
    if (v === null || v === undefined) return 0;
    return typeof v === "number" ? v : Number(v) || 0;
  }
  const rate = memRate.get(rateKey);
  if (!rate || rate.expiresAt < Date.now()) return 0;
  return rate.inflight;
}
