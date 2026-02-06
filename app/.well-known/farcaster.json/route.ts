import { NextResponse } from "next/server";

const FARCASTER_MANIFEST_URL =
  "https://api.farcaster.xyz/miniapps/hosted-manifest/019c329d-a760-5b80-51b3-def2cfa7a1ff";

export async function GET() {
  return NextResponse.redirect(FARCASTER_MANIFEST_URL, 307);
}
