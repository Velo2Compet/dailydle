/**
 * Server-issued, HMAC-signed device id used for multi-wallet detection.
 *
 * Replaces the previous client-supplied `deviceId` field in /api/guess. The
 * old design was bypassable in three ways:
 *   - just omit the field — the route skipped the check;
 *   - send a fresh random id with each new wallet — every wallet looked like
 *     the "first wallet" on its (fake) device, never flagged;
 *   - clear localStorage.
 *
 * The cookie-based id closes the easy bypasses. It is:
 *   - issued server-side (the client can't pick its value),
 *   - HMAC-signed (the client can't forge another one without the secret),
 *   - HttpOnly + SameSite=Lax (not readable from JS, sent on same-origin POSTs),
 *   - long-lived (1 year) so a casual user keeps their "first wallet"
 *     protection through a season.
 *
 * A determined attacker can still clear cookies (incognito, separate
 * browser profile). That is fundamental to anything client-side — it raises
 * the bar from "1 line of JS" to "manual per-wallet browser segregation",
 * which is the level of friction the device flag is designed for.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "qz-did";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365; // 1 year

let warnedMissingSecret = false;

/**
 * HMAC key. Prefer a dedicated env var; fall back to the server signing key
 * if not configured. Both are server-only secrets and never leave the host.
 *
 * We hash the source secret into a 32-byte HMAC key so a hex/leading-0x
 * private key string is normalised. The HMAC value itself is never reversed
 * back to the source secret.
 */
function getHmacKey(): Buffer {
  const source =
    process.env.DEVICE_COOKIE_SECRET ||
    process.env.SERVER_PRIVATE_KEY ||
    "";
  if (!source) {
    // We never want to silently issue unsigned cookies. If neither secret
    // is configured, the multi-wallet flag is effectively off — log loudly.
    if (process.env.NODE_ENV === "production" && !warnedMissingSecret) {
      warnedMissingSecret = true;
      console.error(
        "[server-device-id] No DEVICE_COOKIE_SECRET or SERVER_PRIVATE_KEY set. " +
          "Device-cookie signing key falls back to an empty string — the cookie " +
          "is effectively unauthenticated. Set DEVICE_COOKIE_SECRET in env."
      );
    }
  }
  // Normalise to a 32-byte key via HMAC against a fixed label.
  return createHmac("sha256", "qz-did-key-derivation").update(source).digest();
}

function sign(value: string): string {
  return createHmac("sha256", getHmacKey()).update(value).digest("hex");
}

function verify(value: string, signature: string): boolean {
  const expected = sign(value);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

function generateId(): string {
  return randomBytes(16).toString("hex");
}

export interface ServerDeviceId {
  /** The server-trusted device id to feed into multi-wallet tracking. */
  deviceId: string;
  /**
   * When non-null, the response MUST set this cookie. Either the cookie was
   * missing/invalid (we issued a fresh one) or it needs to be refreshed.
   */
  cookieToSet: {
    name: string;
    value: string;
    maxAge: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
  } | null;
}

/**
 * Read the device-id cookie from the request, verifying its HMAC. If the
 * cookie is missing, malformed, or the signature doesn't check out, mint a
 * fresh one and ask the caller to attach it via Set-Cookie.
 */
export function readOrIssueDeviceId(request: NextRequest): ServerDeviceId {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (raw) {
    const dot = raw.lastIndexOf(".");
    if (dot > 0) {
      const value = raw.slice(0, dot);
      const sig = raw.slice(dot + 1);
      // Reject anything but the expected shape (32 hex chars + hex hmac) so
      // a tampered cookie can't accidentally match if the secret rotates.
      if (/^[a-f0-9]{32}$/i.test(value) && /^[a-f0-9]{64}$/i.test(sig) && verify(value, sig)) {
        return { deviceId: value, cookieToSet: null };
      }
    }
  }

  // Either missing or untrusted — issue a fresh one.
  const value = generateId();
  const signed = `${value}.${sign(value)}`;
  return {
    deviceId: value,
    cookieToSet: {
      name: COOKIE_NAME,
      value: signed,
      maxAge: COOKIE_MAX_AGE_S,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

/** Convenience: apply the pending Set-Cookie (if any) to a NextResponse. */
export function applyDeviceIdCookie(
  response: NextResponse,
  pending: ServerDeviceId["cookieToSet"]
): NextResponse {
  if (!pending) return response;
  response.cookies.set(pending);
  return response;
}
