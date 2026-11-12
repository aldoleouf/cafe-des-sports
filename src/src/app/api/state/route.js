import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
const KEY = "cafe-des-sports/state.json";
const INITIAL = {
  people: ["Antoine", "Gilles", "Julien", "Pascal", "Seb"],
  balances: { Antoine: -263, Gilles: -143, Julien: -1874, Pascal: -429, Seb: 2709 },
  transactions: [], reserve: ["Café"], advances: {}, advanceHistory: [], updatedAt: null
};
export async function GET() {
  try {
    const { blobs } = await list({ prefix: KEY, limit: 10 });
    const blob = blobs.find((entry) => entry.pathname === KEY);
    if (!blob) return NextResponse.json(INITIAL, { headers: { "Cache-Control": "no-store" } });
    const response = await fetch(blob.url, { cache: "no-store" });
    if (!response.ok) throw new Error("read");
    const value = await response.json();
    return NextResponse.json({
      ...INITIAL, ...value,
      advances: value.advances || {}, advanceHistory: value.advanceHistory || []
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Impossible de lire les comptes partagés" }, { status: 500 });
  }
}
export async function POST(request) {
  try {
    const state = await request.json();
    if (!state || !Array.isArray(state.people) || typeof state.balances !== "object" || !Array.isArray(state.transactions)) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    const updatedAt = new Date().toISOString();
    await put(KEY, JSON.stringify({
      ...INITIAL, ...state, advances: state.advances || {}, advanceHistory: state.advanceHistory || [], updatedAt
    }), {
      access: "public", addRandomSuffix: false, allowOverwrite: true,
      contentType: "application/json", cacheControlMaxAge: 0
    });
    return NextResponse.json({ ok: true, updatedAt });
  } catch {
    return NextResponse.json({ error: "Impossible d'enregistrer les comptes partagés" }, { status: 500 });
  }
}
