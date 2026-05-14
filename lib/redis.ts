import { Redis } from "@upstash/redis";

/**
 * Singleton Upstash Redis client.
 *
 * Returns null if `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 * aren't both set. Callers are expected to fall back to an in-memory
 * store in that case (only OK for local dev — in production the
 * fallback breaks across serverless instances).
 *
 * We log loudly in production so a missing-env misconfiguration can't
 * silently land in prod.
 */

let cached: Redis | null | undefined;
let warned = false;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!warned) {
      warned = true;
      if (process.env.NODE_ENV === "production") {
        console.error(
          "[redis] UPSTASH_REDIS_REST_URL / _TOKEN missing in production. " +
            "Falling back to per-instance in-memory store — this DEFEATS the " +
            "rate-limit and reveal protections under autoscaling/cold-starts."
        );
      } else {
        console.warn(
          "[redis] No Upstash env vars set — using in-memory fallback (fine for local dev)."
        );
      }
    }
    cached = null;
    return cached;
  }

  cached = new Redis({ url, token });
  return cached;
}

export function hasRedis(): boolean {
  return getRedis() !== null;
}
