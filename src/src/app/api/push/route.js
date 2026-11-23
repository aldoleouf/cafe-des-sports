import { NextResponse } from "next/server";
import { vapidPublicKey, saveSubscription, removeSubscription } from "../../../lib/push";
export const dynamic = "force-dynamic";

// Clé publique VAPID dont le navigateur a besoin pour s'abonner (null si non configurée).
export async function GET() {
  return NextResponse.json({ publicKey: vapidPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  try {
    const subscription = await request.json();
    if (!subscription || typeof subscription.endpoint !== "string" || !subscription.endpoint.startsWith("https://")
      || !subscription.keys || typeof subscription.keys.p256dh !== "string" || typeof subscription.keys.auth !== "string") {
      return NextResponse.json({ error: "Abonnement invalide" }, { status: 400 });
    }
    await saveSubscription({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Impossible d'enregistrer l'abonnement" }, { status: error?.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    const { endpoint } = await request.json();
    if (typeof endpoint !== "string") return NextResponse.json({ error: "Abonnement invalide" }, { status: 400 });
    await removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Impossible de supprimer l'abonnement" }, { status: error?.status || 500 });
  }
}
