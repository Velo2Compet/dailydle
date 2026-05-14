import { Errors, createClient } from "@farcaster/quick-auth";
import { NextRequest, NextResponse } from "next/server";

const client = createClient();

// Resolve the host the JWT must have been issued for.
//
// We do NOT consult the request's Origin/Host headers: both are
// attacker-controlled (Origin trivially via fetch options, Host via
// non-browser clients). If we accepted whatever the caller advertised,
// an attacker could mint a Farcaster JWT for evil.com and pass it
// alongside `Origin: evil.com` — verifyJwt would happily accept it
// even though the JWT was never intended for our app.
//
// Production: pin to NEXT_PUBLIC_URL.
// Vercel preview: the per-deploy URL is set server-side in VERCEL_URL.
// Local dev: localhost.
function getExpectedHost(): string {
  const explicit = process.env.NEXT_PUBLIC_URL;
  if (process.env.VERCEL_ENV === "production" && explicit) {
    try {
      return new URL(explicit).host;
    } catch {
      // fall through to next branches
    }
  }
  if (process.env.VERCEL_URL) return process.env.VERCEL_URL;
  if (explicit) {
    try {
      return new URL(explicit).host;
    } catch {
      // fall through
    }
  }
  return "localhost:3000";
}

export async function GET(request: NextRequest) {
  // Because we're fetching this endpoint via `sdk.quickAuth.fetch`,
  // if we're in a mini app, the request will include the necessary `Authorization` header.
  const authorization = request.headers.get("Authorization");

  // Here we ensure that we have a valid token.
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return NextResponse.json({ message: "Missing token" }, { status: 401 });
  }

  try {
    // Pin the verification domain to OUR app (see getExpectedHost). The
    // JWT carries an `aud` claim — verifyJwt rejects any token issued
    // for a different domain. This is the load-bearing check.
    const payload = await client.verifyJwt({
      token: authorization.split(" ")[1] as string,
      domain: getExpectedHost(),
    });

    console.log("payload", payload);

    // If the token was valid, `payload.sub` will be the user's Farcaster ID.
    const userFid = payload.sub;

    // Return user information for your waitlist application
    return NextResponse.json({
      success: true,
      user: {
        fid: userFid,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      },
    });

  } catch (e) {
    if (e instanceof Errors.InvalidTokenError) {
      return NextResponse.json({ message: "Invalid token" }, { status: 401 });
    }
    if (e instanceof Error) {
      return NextResponse.json({ message: e.message }, { status: 500 });
    }
    throw e;
  }
}