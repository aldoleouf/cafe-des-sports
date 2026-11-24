import { NextResponse } from "next/server";
import { loadOrImport, setJson, withLock } from "../../../lib/redis";
import { checkStockAlerts } from "../../../lib/push";
export const dynamic = "force-dynamic";
// Comptes partagés : clé cafe-des-sports:state dans Upstash Redis.
// Repris une fois depuis l'ancien store Vercel Blob s'il n'existe pas encore ;
// tant que ce store est inaccessible, lecture et écriture renvoient 503 pour ne rien écraser.
const KEY = "cafe-des-sports:state";
const LOCK = "cafe-des-sports:state:lock";
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
  archived: [], transactions: [], reserve: ["Café"], advances: {}, advanceHistory: [], stockHistory: [], pauses: [], updatedAt: null
};
const withDefaults = (value) => ({
  ...INITIAL, ...value,
  archived: value.archived || [], advances: value.advances || {}, advanceHistory: value.advanceHistory || [], stockHistory: value.stockHistory || [], pauses: value.pauses || []
});
export async function GET() {
  try {
    const value = await loadOrImport(KEY, fromBlob);
    if (!value) return NextResponse.json(INITIAL, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(withDefaults(value), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error, "Impossible de lire les comptes partagés");
  }
}
export async function POST(request) {
  try {
    const body = await request.json();
    // baseUpdatedAt : version des comptes sur laquelle l'appareil a fait sa saisie.
    const { baseUpdatedAt, ...state } = body || {};
    if (!Array.isArray(state.people) || !state.balances || typeof state.balances !== "object" || !Array.isArray(state.transactions)) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    const result = await withLock(LOCK, async () => {
      const current = await loadOrImport(KEY, fromBlob); // la reprise depuis Blob doit avoir eu lieu avant d'écrire
      // Quelqu'un a enregistré depuis le chargement : on refuse, l'appareil rejoue sa saisie sur l'état à jour.
      if (current && current.updatedAt && baseUpdatedAt !== current.updatedAt) return { conflict: withDefaults(current) };
      const saved = { ...withDefaults(state), updatedAt: new Date().toISOString() };
      await setJson(KEY, saved);
      return { saved };
    });
    if (result.conflict) {
      return NextResponse.json({ error: "Les comptes ont été modifiés entre-temps", state: result.conflict }, { status: 409 });
    }
    const { saved } = result;
    const { updatedAt } = saved;
    // Un relevé de stock peut faire passer un produit sous un jour de consommation.
    await checkStockAlerts(saved).catch((error) => console.error("Alerte de stock impossible :", error && error.message));
    return NextResponse.json({ ok: true, updatedAt });
  } catch (error) {
    return fail(error, "Impossible d'enregistrer les comptes partagés");
  }
}
