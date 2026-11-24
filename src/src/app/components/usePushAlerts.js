"use client";

import { useEffect, useState } from "react";

const base64ToBytes = (value) => {
  const padded = (value + "=".repeat((4 - value.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

// Alertes push de stock sur cet appareil.
// État : "unsupported" | "ios" | "denied" | "off" | "on" | "busy"
export function usePushAlerts(onError) {
  const [pushState, setPushState] = useState("unsupported");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // Sur iPhone, les notifications n'existent que pour l'app ajoutée à l'écran d'accueil.
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) setPushState("ios");
        return;
      }
      if (Notification.permission === "denied") return setPushState("denied");
      try {
        const registration = await navigator.serviceWorker.ready;
        setPushState((await registration.pushManager.getSubscription()) ? "on" : "off");
      } catch { setPushState("off"); }
    })();
  }, []);

  const enable = async () => {
    setPushState("busy");
    try {
      const { publicKey } = await (await fetch("/api/push", { cache: "no-store" })).json();
      if (!publicKey) throw new Error("key");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setPushState(permission === "denied" ? "denied" : "off");
      const registration = await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription())
        || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) });
      const response = await fetch("/api/push", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription)
      });
      if (!response.ok) throw new Error("subscribe");
      setPushState("on");
      registration.showNotification("🔔 Alertes de stock activées", {
        body: "Tu seras prévenu avant que le café ou le chocolat ne vienne à manquer.", icon: "/icon.svg", tag: "stock-welcome"
      });
    } catch {
      setPushState("off");
      onError?.("Impossible d'activer les notifications.");
    }
  };

  const disable = async () => {
    setPushState("busy");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint })
        }).catch(() => {});
        await subscription.unsubscribe();
      }
    } catch {}
    setPushState("off");
  };

  return { pushState, enable, disable };
}
