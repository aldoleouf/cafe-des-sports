// Notifications push (Web Push) quand un stock ne couvre plus qu'un jour.
// Variables Vercel nécessaires : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// (générées avec `npx web-push generate-vapid-keys`), VAPID_SUBJECT facultatif.
import { redis, getJson, setJson } from "./redis";
import { lowStocks, parisDateKey } from "./stock";

const SUBSCRIPTIONS = "cafe-des-sports:push:subscriptions"; // hash endpoint → abonnement
const ALERTED = "cafe-des-sports:push:alerted"; // produits déjà signalés { coffee: "2026-11-23" }

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;
const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export async function saveSubscription(subscription) {
  await redis("HSET", SUBSCRIPTIONS, subscription.endpoint, JSON.stringify(subscription));
}

export async function removeSubscription(endpoint) {
  await redis("HDEL", SUBSCRIPTIONS, endpoint);
}

async function listSubscriptions() {
  const flat = (await redis("HGETALL", SUBSCRIPTIONS)) || [];
  const subscriptions = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try { subscriptions.push(JSON.parse(flat[i + 1])); } catch {}
  }
  return subscriptions;
}

async function sendToAll(subscriptions, payload) {
  const webpush = (await import("web-push")).default;
  const subject = process.env.VAPID_SUBJECT
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "mailto:cafe-des-sports@example.com");
  webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  let sent = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 12 * 3600 });
      sent++;
    } catch (error) {
      // Abonnement expiré ou révoqué : on le retire.
      if (error && (error.statusCode === 404 || error.statusCode === 410)) await removeSubscription(subscription.endpoint).catch(() => {});
      else console.error("Notification push impossible :", error && (error.statusCode || error.message));
    }
  }));
  return sent;
}

const weekday = (date) => date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

function messageFor(stock) {
  const quantity = Math.max(0, stock.value).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  if (!stock.lastDay) {
    return {
      title: stock.icon + " " + stock.label + " : rupture de stock",
      body: "Le stock estimé est épuisé. Pensez à en racheter rapidement."
    };
  }
  return {
    title: stock.icon + " " + stock.label + " : plus qu'un jour de stock",
    body: "Il reste environ " + quantity + " unité" + (stock.value > 1 ? "s" : "") + ", de quoi tenir jusqu'au " + weekday(stock.lastDay) + ". Pensez à en racheter."
  };
}

// Envoie une notification pour chaque produit qui passe sous un jour de stock.
// Un produit n'est signalé qu'une fois, jusqu'à ce que son stock remonte (achat ou relevé).
export async function checkStockAlerts(state, now = new Date()) {
  if (!configured()) return { skipped: "Clés VAPID absentes" };
  const today = parisDateKey(now);
  const low = lowStocks(state, today);
  const previous = (await getJson(ALERTED)) || {};
  const next = {};
  low.forEach((stock) => { next[stock.kind] = previous[stock.kind] || today; });
  const fresh = low.filter((stock) => !previous[stock.kind]);
  if (!fresh.length) {
    if (JSON.stringify(next) !== JSON.stringify(previous)) await setJson(ALERTED, next);
    return { low: low.map((s) => s.kind), sent: 0 };
  }
  const subscriptions = await listSubscriptions();
  if (!subscriptions.length) return { low: low.map((s) => s.kind), sent: 0, subscribers: 0 };
  // Marqué avant l'envoi pour éviter un doublon si deux vérifications se croisent.
  await setJson(ALERTED, next);
  let sent = 0;
  for (const stock of fresh) {
    sent += await sendToAll(subscriptions, { ...messageFor(stock), tag: "stock-" + stock.kind, url: "/?tab=stocks" });
  }
  return { low: low.map((s) => s.kind), sent, subscribers: subscriptions.length };
}
