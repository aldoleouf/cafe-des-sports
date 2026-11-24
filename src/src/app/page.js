"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INITIAL, normalizeData, nextBuyerOf } from "../lib/ledger";
import { stockOverview, localDateKey, pauseOn } from "../lib/stock";
import { shareRecap } from "../lib/recap";
import { usePushAlerts } from "./components/usePushAlerts";
import ComptesTab from "./components/ComptesTab";
import AchatTab from "./components/AchatTab";
import HistoriqueTab from "./components/HistoriqueTab";
import AvancesTab from "./components/AvancesTab";
import StocksTab from "./components/StocksTab";
import ExportDialog from "./components/ExportDialog";
import StatsTab from "./components/StatsTab";
import { Ticket, Coins, Sugar } from "./components/Effects";

const TABS = [
  ["comptes", "🧾", "Comptes"],
  ["achat", "☕", "Achat"],
  ["historique", "📜", "Historique"],
  ["stats", "📊", "Stats"],
  ["avances", "💶", "Avances"],
  ["stocks", "📦", "Stocks"]
];

// Produit à proposer par défaut dans le formulaire d'achat.
function suggestedItem(data, stocks) {
  const source = data.stockHistory?.[0]
    ? stocks.filter((stock) => stock.low).map((stock) => stock.kind === "coffee" ? "Café" : "Chocolat")
    : data.reserve;
  const coffee = source.includes("Café");
  const chocolate = source.includes("Chocolat");
  return coffee && chocolate ? "Café et chocolat" : chocolate ? "Chocolat" : "Café";
}

// Personnes dont le solde a changé entre deux versions des comptes.
const changedBalances = (before, after) => after.people.filter((person) => (before.balances[person] || 0) !== (after.balances[person] || 0));

export default function Home() {
  const [data, setDataState] = useState(INITIAL);
  const dataRef = useRef(INITIAL);
  const [loaded, setLoaded] = useState(false);
  const [reserve, setReserve] = useState(["Café"]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("comptes");
  const [editing, setEditing] = useState(null);
  const [direction, setDirection] = useState("right"); // sens du glissement entre onglets
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState({ names: [], key: 0 }); // montants modifiés par quelqu'un d'autre
  const [ticket, setTicket] = useState(null);
  const [sugar, setSugar] = useState(null);
  const [coins, setCoins] = useState(null);
  const [night, setNight] = useState(false);
  const [friday, setFriday] = useState(false);
  const [today, setToday] = useState("");

  // Après 18 h (et avant 6 h), l'en-tête passe en mode nuit ; le vendredi, chocolat dans l'en-tête.
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hour = now.getHours();
      setNight(hour >= 18 || hour < 6);
      setFriday(now.getDay() === 5);
      setToday(localDateKey(now));
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);

  // Effets éphémères : on les retire une fois l'animation terminée.
  const show = (setter, value, duration) => {
    const key = Date.now();
    setter({ ...value, key });
    setTimeout(() => setter((current) => current?.key === key ? null : current), duration);
  };
  const purchaseSaved = (input) => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    show(setTicket, input, 3400);
    if (/café/i.test(input.item)) setTimeout(() => show(setSugar, {}, 1400), 350);
  };
  const advanceSaved = () => show(setCoins, {}, 2000);
  const push = usePushAlerts(setMessage);

  const setData = useCallback((value) => {
    dataRef.current = value;
    setDataState(value);
  }, []);

  // Données venues du serveur (et non de sa propre saisie) : on fait clignoter ce qui a changé.
  const receive = useCallback((value) => {
    const before = dataRef.current;
    const names = before.updatedAt && value.updatedAt !== before.updatedAt ? changedBalances(before, value) : [];
    setData(value);
    if (names.length) {
      setFlash({ names, key: Date.now() });
      setTimeout(() => setFlash((current) => current.names === names ? { names: [], key: current.key } : current), 1600);
    }
  }, [setData]);

  // Applique une modification aux comptes partagés. `change(state)` renvoie le nouvel état,
  // ou un message d'erreur. Si quelqu'un a enregistré entre-temps (409), la modification est
  // rejouée sur les comptes à jour au lieu d'écraser la saisie de l'autre.
  const mutate = useCallback(async (change) => {
    let base = dataRef.current;
    const first = change(base);
    if (!first || typeof first === "string") {
      if (first) setMessage(first);
      return false;
    }
    setBusy(true);
    try {
      let next = first;
      for (let attempt = 0; attempt < 3; attempt++) {
        const payload = normalizeData(next);
        const response = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, baseUpdatedAt: base.updatedAt })
        });
        if (response.status === 409) {
          base = normalizeData((await response.json()).state);
          receive(base);
          next = change(base);
          if (!next || typeof next === "string") {
            setMessage(next || "Les comptes ont changé entre-temps, vérifie ta saisie.");
            return false;
          }
          continue;
        }
        if (!response.ok) throw new Error("save");
        const result = await response.json();
        setData({ ...payload, updatedAt: result.updatedAt });
        setMessage(attempt ? "Comptes enregistrés (avec les saisies faites entre-temps)" : "Comptes enregistrés");
        return true;
      }
      setMessage("Les comptes changent beaucoup en ce moment, réessaie.");
      return false;
    } catch {
      setMessage("Sauvegarde impossible. Vérifie la connexion.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [setData, receive]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state?refresh=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("load");
      const raw = normalizeData(await response.json());
      receive(raw);
      setReserve(raw.reserve);
      setLoaded(true);
    } catch {
      setMessage("Impossible de charger les comptes partagés.");
      setLoaded(true);
    }
  }, [receive]);

  const manualRefresh = async () => {
    setRefreshing(true);
    // Au moins un tour de flèche, même si la réponse est instantanée.
    await Promise.all([refresh(), new Promise((resolve) => setTimeout(resolve, 700))]);
    setRefreshing(false);
  };

  const goTo = (key) => {
    const from = TABS.findIndex(([name]) => name === tab);
    const to = TABS.findIndex(([name]) => name === key);
    if (to !== from) setDirection(to > from ? "right" : "left");
    setTab(key);
  };

  useEffect(() => {
    refresh();
    // Rafraîchit toutes les 20 s seulement si l'onglet est visible, et dès qu'on revient sur la page.
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 20000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some(([key]) => key === wanted)) setTab(wanted);
  }, []);

  const nextBuyer = useMemo(() => nextBuyerOf(data), [data]);
  const stocks = useMemo(() => stockOverview(data), [data]);
  const holiday = today ? pauseOn(today, data.pauses) : null; // pause du groupe en cours
  const tabIndex = TABS.findIndex(([key]) => key === tab);
  const defaultItem = useMemo(() => suggestedItem({ ...data, reserve }, stocks), [data, reserve, stocks]);

  const toggleReserve = async (value) => {
    const nextReserve = reserve.includes(value) ? reserve.filter((entry) => entry !== value) : [...reserve, value];
    setReserve(nextReserve);
    await mutate((state) => ({ ...state, reserve: nextReserve }));
  };

  const startEditing = (transaction) => {
    setEditing(transaction);
    goTo("achat");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const doneEditing = () => {
    setEditing(null);
    goTo("historique");
  };

  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    setSharing(true);
    try { await shareRecap(data); } finally { setSharing(false); }
  };

  return (
    <main className="shell">
      <header className={"hero" + (night ? " night" : "") + (holiday ? " on-holiday" : "")}>
        {friday && !holiday && (
          <span className="friday-treats" aria-hidden="true">
            {[[34, 14], [52, 62], [68, 22], [80, 70], [92, 38]].map(([x, y], i) => <i key={i} style={{ "--i": i, "--x": x + "%", "--y": y + "%" }}>🍫</i>)}
          </span>
        )}
        <div className="emblem" title={holiday ? "Pause" + (holiday.note ? " : " + holiday.note : "") : undefined}>
          {holiday ? (
            <><span className="parasol" aria-hidden="true">⛱️</span><span className="deckchair">🏖️</span></>
          ) : (
            <>
              {night
                ? <span className="moon" aria-hidden="true">🌙</span>
                : <span className="steam" aria-hidden="true"><i /><i /><i /></span>}
              <Sugar drop={sugar} />
              ☕
            </>
          )}
        </div>
        <div>
          <p className="eyebrow">LE COMPTOIR DES COPAINS</p>
          <h1>Café <span>des sports</span></h1>
          <p className="subtitle">{holiday ? "Le comptoir est en vacances" + (holiday.note ? " (" + holiday.note + ")" : "") + ". Bon repos !" : night ? "Le comptoir ferme pour ce soir. À demain !" : friday ? "C'est vendredi : place au chocolat !" : "Les comptes du café et du chocolat, entre nous."}</p>
        </div>
        <div className="ball" key={tab} aria-hidden="true">⚽</div>
      </header>

      <div className="tabs" style={{ "--count": TABS.length, "--index": tabIndex }}>
        <span className="tab-indicator" aria-hidden="true"><i key={tab} /></span>
        {TABS.map(([key, icon, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => { goTo(key); if (key !== "achat") setEditing(null); }}>
            <span className="tab-icon" aria-hidden="true">{icon}</span>
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </div>

      {!loaded && (
        <div className="skeleton" role="status" aria-label="Chargement des comptes partagés">
          <i /><i /><i />
        </div>
      )}

      <div className={"tab-view from-" + direction} key={tab}>
      {tab === "comptes" && <ComptesTab flash={flash} data={data} stocks={stocks} nextBuyer={nextBuyer} reserve={reserve} toggleReserve={toggleReserve} busy={busy} mutate={mutate} />}
      {tab === "achat" && (
        <AchatTab
          data={data} busy={busy} mutate={mutate}
          editing={editing} onDoneEditing={doneEditing}
          defaultBuyer={nextBuyer || data.people[0] || ""} defaultItem={defaultItem}
          onSaved={purchaseSaved}
        />
      )}
      {tab === "historique" && <HistoriqueTab data={data} busy={busy} mutate={mutate} onEdit={startEditing} />}
      {tab === "stats" && <StatsTab data={data} />}
      {tab === "avances" && <AvancesTab data={data} busy={busy} mutate={mutate} onSaved={advanceSaved} />}
      {tab === "stocks" && <StocksTab data={data} stocks={stocks} busy={busy} mutate={mutate} push={push} />}
      </div>

      <footer>
        <span className="sync">{busy ? "● Enregistrement…" : message || "● Suivi partagé"}</span>
        <button className="share-button" onClick={share} disabled={sharing}>{sharing ? "Préparation…" : "📸 Partager le récapitulatif"}</button>
        <button className="share-button secondary" onClick={() => setExporting(true)}>📋 Tableau texte</button>
        <button className={"text-button refresh" + (refreshing ? " spinning" : "")} onClick={manualRefresh} disabled={refreshing}>
          <span className="refresh-icon" aria-hidden="true">⟳</span> {refreshing ? "Actualisation…" : "Actualiser"}
        </button>
      </footer>
      <ExportDialog data={data} open={exporting} onClose={() => setExporting(false)} />
      <Ticket ticket={ticket} />
      <Coins burst={coins} />
    </main>
  );
}
