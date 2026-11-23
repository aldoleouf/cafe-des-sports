import { NextResponse } from "next/server";
import { loadOrImport, setJson } from "../../../lib/redis";
import { checkStockAlerts } from "../../../lib/push";
export const dynamic = "force-dynamic";
// Comptes partagés : clé cafe-des-sports:state dans Upstash Redis.
// Repris une fois depuis l'ancien store Vercel Blob s'il n'existe pas encore ;
// tant que ce store est inaccessible, lecture et écriture renvoient 503 pour ne rien écraser.
const KEY = "cafe-des-sports:state";
const BLOB_KEY = "cafe-des-sports/state.json";
async function fromBlob() {
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: BLOB_KEY, limit: 10 });
  const blob = blobs.find((entry) => entry.pathname === BLOB_KEY);
  if (!blob) return null;
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) throw new Error("read");
  return response.json();
}
const fail = (error, fallback) => NextResponse.json(
  { error: error && error.status ? error.message : fallback },
  { status: (error && error.status) || 500 }
);
const INITIAL = {
  people: ["Antoine", "Gilles", "Julien", "Pascal", "Seb"],
  balances: { Antoine: -263, Gilles: -143, Julien: -1874, Pascal: -429, Seb: 2709 },
  transactions: [], reserve: ["Café"], advances: {}, advanceHistory: [], stockHistory: [], updatedAt: null
};
export async function GET() {
  try {
    const value = await loadOrImport(KEY, fromBlob);
    if (!value) return NextResponse.json(INITIAL, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({
      ...INITIAL, ...value,
      advances: value.advances || {}, advanceHistory: value.advanceHistory || [], stockHistory: value.stockHistory || []
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error, "Impossible de lire les comptes partagés");
  }
}
export async function POST(request) {
  try {
    const state = await request.json();
    if (!state || !Array.isArray(state.people) || typeof state.balances !== "object" || !Array.isArray(state.transactions)) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    await loadOrImport(KEY, fromBlob); // la reprise depuis Blob doit avoir eu lieu avant d'écrire
    const updatedAt = new Date().toISOString();
    const saved = {
      ...INITIAL, ...state, advances: state.advances || {}, advanceHistory: state.advanceHistory || [], stockHistory: state.stockHistory || [], updatedAt
    };
    await setJson(KEY, saved);
    // Un relevé de stock peut faire passer un produit sous un jour de consommation.
    await checkStockAlerts(saved).catch((error) => console.error("Alerte de stock impossible :", error && error.message));
    return NextResponse.json({ ok: true, updatedAt });
  } catch (error) {
    return fail(error, "Impossible d'enregistrer les comptes partagés");
  }
}
