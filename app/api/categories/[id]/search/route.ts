import { NextRequest, NextResponse } from "next/server";

const QUIZZDLE_API_URL = process.env.QUIZZDLE_API_URL || "https://quizzdle.fr";
// Nettoyer la clé API de tout caractère invisible
const API_KEY = (process.env.QUIZZDLE_API_KEY ?? "").trim().replace(/[^\x20-\x7E]/g, "");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";

  if (!q || q.length < 1) {
    return NextResponse.json({ personnages: [] });
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (API_KEY) {
      headers["X-API-Key"] = API_KEY;
    }

    const res = await fetch(
      `${QUIZZDLE_API_URL}/api/public/categories/${id}?q=${encodeURIComponent(q)}`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json({ personnages: [] }, { status: res.status });
    }

    const data = await res.json();
    const raw = data?.data ?? data;
    const personnages = raw?.personnages ?? raw?.characters ?? [];

    return NextResponse.json({ personnages });
  } catch {
    return NextResponse.json({ personnages: [] }, { status: 500 });
  }
}
