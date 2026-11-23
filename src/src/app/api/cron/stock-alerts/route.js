import { NextResponse } from "next/server";
import { getJson } from "../../../../lib/redis";
import { checkStockAlerts } from "../../../../lib/push";
export const dynamic = "force-dynamic";

// Appelé chaque matin par Vercel Cron (voir vercel.json) : les stocks baissent
// avec les jours qui passent, même sans aucune saisie dans l'application.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const state = await getJson("cafe-des-sports:state");
    if (!state) return NextResponse.json({ skipped: "Aucune donnée" });
    return NextResponse.json(await checkStockAlerts(state));
  } catch (error) {
    console.error("Vérification des stocks impossible :", error && error.message);
    return NextResponse.json({ error: "Vérification impossible" }, { status: 500 });
  }
}
