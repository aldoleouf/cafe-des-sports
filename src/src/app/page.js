"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const INITIAL = {
  people: ["Antoine", "Gilles", "Julien", "Pascal", "Seb"],
  balances: { Antoine: -263, Gilles: -143, Julien: -1874, Pascal: -429, Seb: 2709 },
  transactions: [],
  reserve: ["Café"],
  advances: {},
  advanceHistory: [],
  updatedAt: null
};

const euro = (c) => (Math.abs(c || 0) / 100).toLocaleString("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}) + " €";
const signed = (c) => (c > 0 ? "+" : c < 0 ? "−" : "") + euro(c);
const target = (c) => Math.ceil(Math.abs(c) * 5 / 4);
const dateLabel = (value) => new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const localDateKey = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};
function countStockDaysAfter(start, end, kind) {
  if (!start || !end || start >= end) return 0;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd, 12);
  const last = new Date(ey, em - 1, ed, 12);
  let count = 0;
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= last) {
    const day = cursor.getDay();
    if (kind === "coffee" && day >= 1 && day <= 5) count++;
    if (kind === "lunch" && day >= 1 && day <= 4) count++;
    if (kind === "friday" && day === 5) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
function estimatedStock(snapshot, transactions, kind, peopleCount) {
  if (!snapshot) return null;
  const rate = kind === "coffee" ? 2 : 1;
  const days = countStockDaysAfter(snapshot.date, localDateKey(), kind);
  const cutoff = new Date(snapshot.recordedAt || (snapshot.date + "T23:59:59.999")).getTime();
  const added = (transactions || []).reduce((sum, transaction) => {
    const time = new Date(transaction.date || 0).getTime();
    return time > cutoff ? sum + Math.max(0, Number(transaction.stockAdded?.[kind]) || 0) : sum;
  }, 0);
  return Number(snapshot[kind] || 0) + added - days * rate * peopleCount;
}

function estimateStockDepletion(stock, kind, peopleCount) {
  if (stock === null || !Number.isFinite(Number(stock)) || peopleCount <= 0) return null;
  if (stock <= 0) return { date: null, consumptionDays: 0 };
  const dailyRate = peopleCount * (kind === "coffee" ? 2 : 1);
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  let remaining = Number(stock);
  let consumptionDays = 0;
  for (let i = 0; i < 3650; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    const consumes = kind === "coffee"
      ? day >= 1 && day <= 5
      : kind === "lunch"
        ? day >= 1 && day <= 4
        : day === 5;
    if (!consumes) continue;
    consumptionDays++;
    remaining -= dailyRate;
    if (remaining <= 0) {
      return { date: new Date(cursor), consumptionDays };
    }
  }
  return null;
}

function normalizeData(value) {
  const people = Array.isArray(value?.people) ? value.people : INITIAL.people;
  const advanceHistory = Array.isArray(value?.advanceHistory)
    ? value.advanceHistory.map((entry) => ({
        ...entry,
        holder: entry.holder || (people.includes("Antoine") ? "Antoine" : entry.person),
        remaining: Number.isFinite(Number(entry.remaining)) ? Math.max(0, Number(entry.remaining)) : Math.max(0, Number(entry.amount) || 0)
      }))
    : [];
  const tracked = {};
  advanceHistory.forEach((entry) => { tracked[entry.person] = (tracked[entry.person] || 0) + entry.remaining; });
  Object.entries(value?.advances || {}).forEach(([person, total]) => {
    const missing = Math.max(0, (Number(total) || 0) - (tracked[person] || 0));
    if (missing > 0) advanceHistory.push({
      id: "legacy-" + person, person, holder: person, amount: missing, remaining: missing,
      note: "Ancienne avance", date: value?.updatedAt || new Date().toISOString(), legacy: true
    });
  });
  const advances = {};
  advanceHistory.forEach((entry) => { advances[entry.person] = (advances[entry.person] || 0) + entry.remaining; });
  return {
    ...INITIAL, ...(value || {}), people,
    balances: value?.balances && typeof value.balances === "object" ? value.balances : INITIAL.balances,
    transactions: Array.isArray(value?.transactions) ? value.transactions : [],
    reserve: Array.isArray(value?.reserve) ? value.reserve : ["Café"],
    advances, advanceHistory
  };
}

export default function Home() {
  const [data, setData] = useState(INITIAL);
  const [loaded, setLoaded] = useState(false);
  const [buyer, setBuyer] = useState("Antoine");
  const [amount, setAmount] = useState("");
  const [item, setItem] = useState("Café");
  const [note, setNote] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [reserve, setReserve] = useState(["Café"]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("comptes");
  const [advancePerson, setAdvancePerson] = useState("Gilles");
  const [advanceHolder, setAdvanceHolder] = useState("Antoine");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");
  const [advanceFrom, setAdvanceFrom] = useState("");
  const [stockCoffee, setStockCoffee] = useState("");
  const [stockLunch, setStockLunch] = useState("");
  const [stockFriday, setStockFriday] = useState("");
  const [addedCoffee, setAddedCoffee] = useState("0");
  const [addedLunch, setAddedLunch] = useState("0");
  const [addedFriday, setAddedFriday] = useState("0");

  const sync = useCallback(async (state) => {
    setBusy(true);
    try {
      const payload = normalizeData(state);
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("save");
      const result = await response.json();
      setData({ ...payload, updatedAt: result.updatedAt });
      setMessage("Comptes enregistrés");
      return true;
    } catch {
      setMessage("Sauvegarde impossible. Vérifie la connexion.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state?refresh=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("load");
      const raw = normalizeData(await response.json());
      setData(raw);
      setReserve(raw.reserve);
      setBuyer((current) => raw.people.includes(current) ? current : (raw.people[0] || ""));
      setAdvancePerson((current) => raw.people.includes(current) ? current : (raw.people[0] || ""));
      setAdvanceHolder((current) => raw.people.includes(current) ? current : (raw.people[0] || ""));
      setLoaded(true);
    } catch {
      setMessage("Impossible de charger les comptes partagés.");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20000);
    return () => clearInterval(timer);
  }, [refresh]);

  const nextBuyer = useMemo(() => data.people
    .filter((person) => (data.balances[person] || 0) < 0)
    .sort((a, b) => (data.balances[a] || 0) - (data.balances[b] || 0))[0] || null, [data]);

  const totalAdvance = useMemo(() => Object.values(data.advances || {})
    .reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0), [data.advances]);

  const latestStock = data.stockHistory?.[0] || null;
  const liveStocks = {
    coffee: estimatedStock(latestStock, data.transactions, "coffee", data.people.length),
    lunch: estimatedStock(latestStock, data.transactions, "lunch", data.people.length),
    friday: estimatedStock(latestStock, data.transactions, "friday", data.people.length)
  };
  const stockPriorities = latestStock ? [
    ...(liveStocks.coffee !== null && liveStocks.coffee <= data.people.length * 10 ? ["Café"] : []),
    ...(liveStocks.lunch !== null && liveStocks.lunch <= data.people.length * 4 ? ["Chocolat du midi"] : []),
    ...(liveStocks.friday !== null && liveStocks.friday <= data.people.length ? ["Chocolat du vendredi"] : [])
  ] : [];

  const saveStockSnapshot = async (event) => {
    event.preventDefault();
    const values = [stockCoffee, stockLunch, stockFriday].map((value) => Number(String(value).replace(",", ".")));
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      setMessage("Renseigne trois quantités positives ou nulles.");
      return;
    }
    const snapshot = {
      id: Date.now().toString(),
      date: localDateKey(),
      coffee: values[0],
      lunch: values[1],
      friday: values[2],
      peopleCount: data.people.length,
      recordedAt: new Date().toISOString()
    };
    const stockHistory = [snapshot, ...(data.stockHistory || [])];
    if (await sync({ ...data, stockHistory })) {
      setStockCoffee("");
      setStockLunch("");
      setStockFriday("");
    }
  };

  const addPurchase = async (event) => {
    event.preventDefault();
    const cents = Math.round(100 * Number(amount.replace(",", ".")));
    if (!Number.isFinite(cents) || cents <= 0 || !buyer) return;

    const additions = [addedCoffee, addedLunch, addedFriday].map((value) => Number(String(value || "0").replace(",", ".")));
    if (additions.some((value) => !Number.isFinite(value) || value < 0)) {
      setMessage("Les quantités ajoutées doivent être positives ou nulles.");
      return;
    }
    const stockAdded = { coffee: additions[0], lunch: additions[1], friday: additions[2] };

    const participants = [...data.people];
    const baseShare = Math.floor(cents / participants.length);
    const remainder = cents - baseShare * participants.length;
    const changes = {};
    participants.forEach((person, index) => {
      changes[person] = -(baseShare + (index < remainder ? 1 : 0));
    });

    const selectedAdvance = advanceFrom ? data.advanceHistory.find((entry) => entry.id === advanceFrom) : null;
    const available = selectedAdvance ? Math.max(0, Number(selectedAdvance.remaining) || 0) : 0;
    const advanceUsed = Math.min(cents, available);
    changes[buyer] = (changes[buyer] || 0) + cents - advanceUsed;
    if (advanceUsed && selectedAdvance) changes[selectedAdvance.person] = (changes[selectedAdvance.person] || 0) + advanceUsed;

    const balances = { ...data.balances };
    participants.forEach((person) => {
      balances[person] = (balances[person] || 0) + (changes[person] || 0);
    });
    const advanceHistory = data.advanceHistory.map((entry) => entry.id === advanceFrom
      ? { ...entry, remaining: Math.max(0, entry.remaining - advanceUsed) }
      : entry);
    const advances = {};
    advanceHistory.forEach((entry) => { advances[entry.person] = (advances[entry.person] || 0) + entry.remaining; });

    const transaction = {
      id: Date.now().toString(), buyer, amount: cents, item, note: note.trim(),
      date: new Date().toISOString(), participants, changes,
      advancePerson: advanceUsed && selectedAdvance ? selectedAdvance.person : null,
      advanceHolder: advanceUsed && selectedAdvance ? selectedAdvance.holder : null,
      advanceId: advanceUsed && selectedAdvance ? selectedAdvance.id : null,
      advanceUsed,
      stockAdded
    };
    const next = { ...data, balances, advances, advanceHistory, transactions: [transaction, ...data.transactions] };
    if (await sync(next)) {
      setAmount("");
      setNote("");
      setAdvanceFrom("");
      setAddedCoffee("0");
      setAddedLunch("0");
      setAddedFriday("0");
    }
  };

  const addAdvance = async (event) => {
    event.preventDefault();
    const cents = Math.round(100 * Number(advanceAmount.replace(",", ".")));
    if (!Number.isFinite(cents) || cents <= 0 || !advancePerson || !advanceHolder) return;
    const entry = {
      id: Date.now().toString(), person: advancePerson, holder: advanceHolder,
      amount: cents, remaining: cents, note: advanceNote.trim(), date: new Date().toISOString()
    };
    const advanceHistory = [entry, ...data.advanceHistory];
    const advances = { ...data.advances, [advancePerson]: (data.advances[advancePerson] || 0) + cents };
    if (await sync({ ...data, advances, advanceHistory })) {
      setAdvanceAmount("");
      setAdvanceNote("");
    }
  };

  const deleteAdvance = async (entry) => {
    const used = Math.max(0, entry.amount - entry.remaining);
    if (used > 0) {
      alert("Cette avance a déjà servi à financer un achat. Annule d'abord les achats concernés avant de supprimer l'avance.");
      return;
    }
    if (!confirm("Supprimer cette avance de " + euro(entry.amount) + " de " + entry.person + " remise à " + entry.holder + " ?")) return;
    const advanceHistory = data.advanceHistory.filter((item) => item.id !== entry.id);
    const advances = {};
    advanceHistory.forEach((item) => { advances[item.person] = (advances[item.person] || 0) + item.remaining; });
    await sync({ ...data, advances, advanceHistory });
  };

  const addPerson = async (event) => {
    event.preventDefault();
    const name = newPerson.trim();
    if (!name || data.people.some((person) => person.toLowerCase() === name.toLowerCase())) return;
    const next = {
      ...data,
      people: [...data.people, name],
      balances: { ...data.balances, [name]: 0 },
      advances: { ...data.advances, [name]: 0 }
    };
    if (await sync(next)) {
      setNewPerson("");
      setShowAdd(false);
      setBuyer(name);
      setAdvancePerson(name);
    }
  };

  const toggleReserve = async (value) => {
    const nextReserve = reserve.includes(value)
      ? reserve.filter((entry) => entry !== value)
      : [...reserve, value];
    setReserve(nextReserve);
    await sync({ ...data, reserve: nextReserve });
  };

  const cancelPurchase = async (transaction) => {
    if (!confirm("Annuler cet achat ?")) return;
    const balances = { ...data.balances };
    Object.entries(transaction.changes || {}).forEach(([person, change]) => {
      balances[person] = (balances[person] || 0) - change;
    });
    let advanceHistory = data.advanceHistory;
    const advances = { ...data.advances };
    if (transaction.advancePerson && transaction.advanceUsed) {
      if (transaction.advanceId) {
        advanceHistory = data.advanceHistory.map((entry) => entry.id === transaction.advanceId
          ? { ...entry, remaining: entry.remaining + transaction.advanceUsed } : entry);
        Object.keys(advances).forEach((person) => { advances[person] = 0; });
        advanceHistory.forEach((entry) => { advances[entry.person] = (advances[entry.person] || 0) + entry.remaining; });
      } else {
        advances[transaction.advancePerson] = (advances[transaction.advancePerson] || 0) + transaction.advanceUsed;
      }
    }
    await sync({
      ...data, balances, advances, advanceHistory,
      transactions: data.transactions.filter((entry) => entry.id !== transaction.id)
    });
  };

  async function shareSummary() {
    const people = data.people || [];
    const balances = data.balances || {};
    const next = people.filter((person) => (balances[person] || 0) < 0)
      .sort((a, b) => (balances[a] || 0) - (balances[b] || 0))[0] || null;
    const reserveText = (data.reserve || ["Café"]).join(" et ").toLowerCase();
    const height = 430 + 72 * people.length;
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#eee4d4";
    context.fillRect(0, 0, 1000, height);
    context.fillStyle = "#3d281d";
    context.beginPath();
    context.roundRect(28, 28, 944, height - 56, 24);
    context.fill();
    context.strokeStyle = "#d6a34f";
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = "#d6a34f";
    context.font = "bold 18px Arial";
    context.fillText("CAFÉ DES SPORTS", 58, 82);
    context.fillStyle = "#fffaf0";
    context.font = "bold 40px Georgia";
    context.fillText("Le prochain au comptoir", 58, 135);
    context.fillStyle = "#e6bc71";
    context.font = "bold 30px Arial";
    context.fillText(next || "Tout le monde est à jour", 58, 188);
    context.fillStyle = "#fffaf0";
    context.font = "22px Arial";
    context.fillText(next ? euro(target(balances[next] || 0)) + " à dépenser" : "Les comptes sont équilibrés", 58, 228);
    context.fillStyle = "#e3d2bc";
    context.font = "17px Arial";
    context.fillText("Idéalement en " + (reserveText || "café"), 58, 261);
    context.strokeStyle = "#68452f";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(58, 292);
    context.lineTo(942, 292);
    context.stroke();
    context.fillStyle = "#d6a34f";
    context.font = "bold 24px Georgia";
    context.fillText("Les comptes du groupe", 58, 337);
    let y = 385;
    for (const person of people) {
      const balance = balances[person] || 0;
      context.fillStyle = "#fffaf0";
      context.font = "bold 22px Arial";
      context.fillText(person, 58, y);
      context.textAlign = "right";
      context.fillStyle = balance < 0 ? "#f2b4a8" : balance > 0 ? "#b6dfbd" : "#fffaf0";
      context.font = "bold 22px Arial";
      context.fillText(signed(balance), 942, y);
      context.textAlign = "left";
      context.fillStyle = "#e3d2bc";
      context.font = "16px Arial";
      context.fillText(balance < 0 ? "Pour compenser : " + euro(target(balance)) + " à dépenser" : balance > 0 ? "En avance" : "À jour", 58, y + 25);
      y += 72;
    }
    context.fillStyle = "#d6a34f";
    context.font = "14px Arial";
    context.fillText("Récapitulatif partagé • " + new Date().toLocaleDateString("fr-FR"), 58, height - 48);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("image")), "image/png"));
    const file = new File([blob], "cafe-des-sports.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ title: "Café des sports — les comptes", text: "Le prochain au comptoir et les comptes du groupe", files: [file] });
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cafe-des-sports.png";
      link.click();
      URL.revokeObjectURL(url);
      alert("Image créée. Tu peux maintenant la joindre à ta conversation.");
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div className="emblem">☕</div>
        <div>
          <p className="eyebrow">LE COMPTOIR DES COPAINS</p>
          <h1>Café <span>des sports</span></h1>
          <p className="subtitle">Les comptes du café et du chocolat, entre nous.</p>
        </div>
        <div className="ball">⚽</div>
      </header>

      <div className="tabs">
        <button className={tab === "comptes" ? "active" : ""} onClick={() => setTab("comptes")}>Les comptes</button>
        <button className={tab === "achat" ? "active" : ""} onClick={() => setTab("achat")}>Nouvel achat</button>
        <button className={tab === "historique" ? "active" : ""} onClick={() => setTab("historique")}>Historique</button>
        <button className={tab === "avances" ? "active" : ""} onClick={() => setTab("avances")}>Avances</button>
        <button className={tab === "stocks" ? "active" : ""} onClick={() => setTab("stocks")}>Stocks</button>
      </div>

      {!loaded && <p className="status">Chargement des comptes partagés…</p>}

      {tab === "comptes" && (
        <>
          <section className="panel next">
            <p className="eyebrow">PROCHAIN À PASSER AU COMPTOIR</p>
            {nextBuyer ? (
              <>
                <h2>{nextBuyer}</h2>
                <p className="amount">{euro(target(data.balances[nextBuyer]))} <small>à dépenser pour compenser</small></p>
                {latestStock ? (
                  <p className="hint">
                    {stockPriorities.length
                      ? "À acheter en priorité : " + stockPriorities.join(" et ").toLowerCase() + "."
                      : "Stocks suffisants : aucun achat urgent pour le moment."}
                  </p>
                ) : (
                  <p className="hint">Idéalement en {reserve.length ? reserve.join(" et ").toLowerCase() : "café"}</p>
                )}
              </>
            ) : <h2>Tout le monde est à jour !</h2>}
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">LE CARNET DU COMPTOIR</p>
                <h2>Les comptes du groupe</h2>
              </div>
              <button className="small-button" onClick={() => setShowAdd(!showAdd)}>＋ Personne</button>
            </div>
            {showAdd && (
              <form className="add-form" onSubmit={addPerson}>
                <input value={newPerson} onChange={(event) => setNewPerson(event.target.value)} placeholder="Nom du copain" required />
                <button className="primary" type="submit" disabled={busy}>Ajouter</button>
              </form>
            )}
            <div className="people">
              {data.people.map((person) => (
                <div className="person" key={person}>
                  <div>
                    <strong>{person}</strong>
                    <small>{(data.balances[person] || 0) < 0 ? "En retard" : (data.balances[person] || 0) > 0 ? "En avance" : "À jour"}</small>
                  </div>
                  <div className="balance">
                    <b className={(data.balances[person] || 0) < 0 ? "negative" : (data.balances[person] || 0) > 0 ? "positive" : ""}>{signed(data.balances[person] || 0)}</b>
                    {(data.balances[person] || 0) < 0 && <small className="target">À dépenser : {euro(target(data.balances[person]))}</small>}
                  </div>
                </div>
              ))}
            </div>
            <div className="reserve">
              <p className="eyebrow">APPROCHE FIN DE RÉSERVE</p>
              {latestStock ? (
                <>
                  <p>Priorité calculée automatiquement à partir des stocks et de la consommation hebdomadaire :</p>
                  <div className="choices">
                    {stockPriorities.length ? stockPriorities.map((value) => (
                      <span className="choice active" key={value}>{value === "Café" ? "☕ " : "🍫 "}{value}</span>
                    )) : <span className="choice">Stocks suffisants</span>}
                  </div>
                  <p className="tiny">Seuils : une semaine de consommation estimée pour chaque produit. Café : {liveStocks.coffee?.toLocaleString("fr-FR") ?? "—"} restant · Chocolat midi : {liveStocks.lunch?.toLocaleString("fr-FR") ?? "—"} · Chocolat vendredi : {liveStocks.friday?.toLocaleString("fr-FR") ?? "—"}.</p>
                </>
              ) : (
                <>
                  <p>Pour les prochains achats, privilégier :</p>
                  <div className="choices">
                    {["Café", "Chocolat"].map((value) => (
                      <button type="button" key={value} className={reserve.includes(value) ? "choice active" : "choice"} onClick={() => toggleReserve(value)}>
                        {value === "Café" ? "☕ " : "🍫 "}{value}
                      </button>
                    ))}
                  </div>
                  <p className="tiny">Le conseil sera automatique dès le premier relevé de stock.</p>
                </>
              )}
            </div>
          </section>
        </>
      )}

      {tab === "achat" && (
        <section className="panel">
          <p className="eyebrow">UNE PETITE TOURNÉE ?</p>
          <h2>Enregistrer un achat</h2>
          <form className="purchase" onSubmit={addPurchase}>
            <label>Qui a payé ?
              <select value={buyer} onChange={(event) => setBuyer(event.target.value)}>
                {data.people.map((person) => <option key={person} value={person}>{person}</option>)}
              </select>
            </label>
            <label>Montant (€)
              <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 3,50" required />
            </label>
            <label>Qu'est-ce qu'on a pris ?
              <select value={item} onChange={(event) => setItem(event.target.value)}>
                <option>Café</option>
                <option>Chocolat</option>
                <option>Café et chocolat</option>
                <option>Autre</option>
              </select>
            </label>
            <div className="stock-additions">
              <p className="eyebrow">QUANTITÉS AJOUTÉES AUX STOCKS</p>
              <p className="hint">Indique les quantités achetées pour mettre à jour les stocks. Laisse 0 si le produit n'est pas concerné.</p>
              <label>☕ Nombre de cafés ajoutés
                <input inputMode="decimal" value={addedCoffee} onChange={(event) => setAddedCoffee(event.target.value)} placeholder="0" />
              </label>
              <label>🍫 Chocolats du midi ajoutés
                <input inputMode="decimal" value={addedLunch} onChange={(event) => setAddedLunch(event.target.value)} placeholder="0" />
              </label>
              <label>🍫 Chocolats du vendredi ajoutés
                <input inputMode="decimal" value={addedFriday} onChange={(event) => setAddedFriday(event.target.value)} placeholder="0" />
              </label>
            </div>
            <label>Financé par une avance ?
              <select value={advanceFrom} onChange={(event) => setAdvanceFrom(event.target.value)}>
                <option value="">Aucune avance</option>
                {data.advanceHistory.filter((entry) => entry.remaining > 0).map((entry) => (
                  <option key={entry.id} value={entry.id}>Avance de {entry.person}, détenue par {entry.holder} — {euro(entry.remaining)} disponible</option>
                ))}
              </select>
            </label>
            {advanceFrom && (() => {
              const selected = data.advanceHistory.find((entry) => entry.id === advanceFrom);
              return selected ? <p className="hint">Jusqu'à {euro(selected.remaining)} seront pris sur l'argent de {selected.person}, actuellement détenu par {selected.holder}. La part financée sera comptabilisée au nom de {selected.person}.</p> : null;
            })()}
            <label>Précision (facultatif)
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex. deux cafés, un chocolat" />
            </label>
            <p className="hint">Le montant sera partagé équitablement entre les {data.people.length} participants. Si une avance est utilisée, la part financée sera comptabilisée au nom de la personne qui a avancé l'argent.</p>
            <button className="primary wide" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer l'achat"}</button>
          </form>
        </section>
      )}

      {tab === "historique" && (
        <section className="panel">
          <p className="eyebrow">LES TOURNÉES PASSÉES</p>
          <h2>Historique des achats</h2>
          {data.transactions.length ? (
            <div className="history">
              {data.transactions.map((transaction) => (
                <div className="transaction" key={transaction.id}>
                  <div>
                    <strong>{transaction.buyer}</strong>
                    <p>{transaction.item}{transaction.note ? " · " + transaction.note : ""}</p>
                    {(transaction.stockAdded && Object.values(transaction.stockAdded).some((quantity) => Number(quantity) > 0)) && (
                      <p className="advance-detail">Stock ajouté : {[["coffee", "☕"], ["lunch", "🍫 midi"], ["friday", "🍫 vendredi"]].filter(([key]) => Number(transaction.stockAdded[key]) > 0).map(([key, label]) => label + " " + transaction.stockAdded[key]).join(" · ")}</p>
                    )}
                    {transaction.advanceUsed > 0 && <p className="advance-detail">Dont {euro(transaction.advanceUsed)} pris sur l'avance de {transaction.advancePerson}{transaction.advanceHolder ? " (détenue par " + transaction.advanceHolder + ")" : ""}</p>}
                    <small>{dateLabel(transaction.date)}</small>
                  </div>
                  <div className="transaction-end">
                    <b>{euro(transaction.amount)}</b>
                    <button className="text-button" onClick={() => cancelPurchase(transaction)}>Annuler</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="empty">Pas encore d'achat enregistré.</p>}
        </section>
      )}

      {tab === "stocks" && (() => {
        const latest = data.stockHistory?.[0] || null;
        const peopleCount = data.people.length;
        const coffeeNow = estimatedStock(latest, data.transactions, "coffee", peopleCount);
        const lunchNow = estimatedStock(latest, data.transactions, "lunch", peopleCount);
        const fridayNow = estimatedStock(latest, data.transactions, "friday", peopleCount);
        const stockCards = [
          { key: "coffee", title: "Café", icon: "☕", rate: "2 par personne", days: "Du lundi au vendredi", value: coffeeNow },
          { key: "lunch", title: "Chocolat du midi", icon: "🍫", rate: "1 par personne", days: "Du lundi au jeudi", value: lunchNow },
          { key: "friday", title: "Chocolat du vendredi", icon: "🍫", rate: "1 par personne", days: "Chaque vendredi", value: fridayNow }
        ];
        return (
          <>
            <section className="panel next">
              <p className="eyebrow">SUIVI AUTOMATIQUE DES STOCKS</p>
              <h2>{peopleCount} participant{peopleCount > 1 ? "s" : ""} pris en compte</h2>
              <p className="hint">Les consommations sont calculées automatiquement selon les jours écoulés, sans saisie quotidienne.</p>
              {latest && <p className="hint">Dernier relevé : {new Date(latest.date + "T12:00:00").toLocaleDateString("fr-FR")}</p>}
            </section>
            <section className="panel">
              <p className="eyebrow">ESTIMATION ACTUELLE</p>
              <h2>Ce qu'il reste</h2>
              <div className="stock-grid">
                {stockCards.map((stock) => {
                  const depletion = estimateStockDepletion(stock.value, stock.key, peopleCount);
                  return (
                    <div className="stock-card" key={stock.key}>
                      <div className="stock-card-title"><span>{stock.icon}</span><strong>{stock.title}</strong></div>
                      {stock.value === null ? <b className="stock-number">—</b> : <b className={"stock-number " + (stock.value < 0 ? "negative" : stock.value <= peopleCount * 5 ? "low" : "positive")}>{stock.value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</b>}
                      <small>{stock.value === null ? "En attente du premier relevé" : "unités estimées restantes"}</small>
                      <p>{stock.rate} · {stock.days}</p>
                      {depletion && (
                        <p className="stock-estimate">
                          {depletion.date
                            ? <>Épuisement estimé : <strong>{depletion.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong><br />Dans {depletion.consumptionDays} jour{depletion.consumptionDays > 1 ? "s" : ""} de consommation</>
                            : <strong>Rupture théorique déjà atteinte</strong>}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {latest && <p className="hint">Estimation calculée depuis le dernier relevé, avec {peopleCount} participants enregistrés. Les stocks négatifs signalent une rupture théorique.</p>}
            </section>
            <section className="panel">
              <p className="eyebrow">RELEVÉ HEBDOMADAIRE</p>
              <h2>Mettre à jour les quantités</h2>
              <p className="hint">Saisis le nombre approximatif d'unités ou de portions réellement restantes aujourd'hui. Cette saisie devient le nouveau point de départ des calculs.</p>
              <form className="purchase" onSubmit={saveStockSnapshot}>
                <label>☕ Café restant (nombre de cafés)
                  <input inputMode="decimal" value={stockCoffee} onChange={(event) => setStockCoffee(event.target.value)} placeholder="Ex. 120" required />
                </label>
                <label>🍫 Chocolat du midi restant (portions)
                  <input inputMode="decimal" value={stockLunch} onChange={(event) => setStockLunch(event.target.value)} placeholder="Ex. 35" required />
                </label>
                <label>🍫 Chocolat du vendredi restant (portions)
                  <input inputMode="decimal" value={stockFriday} onChange={(event) => setStockFriday(event.target.value)} placeholder="Ex. 20" required />
                </label>
                <button className="primary wide" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le relevé"}</button>
              </form>
            </section>
            <section className="panel">
              <p className="eyebrow">ANCIENS RELEVÉS</p>
              <h2>Historique des stocks</h2>
              {data.stockHistory?.length ? <div className="history">
                {data.stockHistory.map((entry) => (
                  <div className="transaction" key={entry.id}>
                    <div><strong>{new Date(entry.date + "T12:00:00").toLocaleDateString("fr-FR")}</strong><p>☕ {entry.coffee} cafés · 🍫 {entry.lunch} chocolats du midi · 🍫 {entry.friday} chocolats du vendredi</p><small>{entry.peopleCount} participants au moment du relevé</small></div>
                  </div>
                ))}
              </div> : <p className="empty">Aucun relevé enregistré pour le moment.</p>}
            </section>
          </>
        );
      })()}

      {tab === "avances" && (
        <>
          <section className="panel next">
            <p className="eyebrow">AVANCES DISPONIBLES POUR LES PROCHAINS ACHATS</p>
            <p className="amount">{euro(totalAdvance)}</p>
            <p className="hint">Somme encore disponible pour acheter du café ou du chocolat pour le groupe.</p>
          </section>

          <section className="panel">
            <p className="eyebrow">QUI DÉTIENT L'ARGENT ?</p>
            <h2>Argent confié</h2>
            {data.advanceHistory.filter((entry) => entry.remaining > 0).length ? (
              <div className="people">
                {data.advanceHistory.filter((entry) => entry.remaining > 0).map((entry) => (
                  <div className="person" key={"holder-" + entry.id}>
                    <div><strong>{entry.holder} détient l'argent de {entry.person}</strong><small>Somme confiée encore disponible</small></div>
                    <div className="balance"><b className="positive">{euro(entry.remaining)}</b></div>
                  </div>
                ))}
              </div>
            ) : <p className="empty">Aucune somme confiée en attente d'achat.</p>}
          </section>

          <section className="panel">
            <p className="eyebrow">NOUVELLE AVANCE</p>
            <h2>Enregistrer un virement</h2>
            <form className="purchase" onSubmit={addAdvance}>
              <label>Qui a fait l'avance ?
                <select value={advancePerson} onChange={(event) => setAdvancePerson(event.target.value)}>
                  {data.people.map((person) => <option key={person} value={person}>{person}</option>)}
                </select>
              </label>
              <label>Montant reçu (€)
                <input inputMode="decimal" value={advanceAmount} onChange={(event) => setAdvanceAmount(event.target.value)} placeholder="Ex. 100" required />
              </label>
              <label>À qui l'argent a-t-il été remis ?
                <select value={advanceHolder} onChange={(event) => setAdvanceHolder(event.target.value)}>
                  {data.people.map((person) => <option key={person} value={person}>{person}</option>)}
                </select>
              </label>
              <label>Précision (facultatif)
                <input value={advanceNote} onChange={(event) => setAdvanceNote(event.target.value)} placeholder="Ex. virement pour le café" />
              </label>
              <p className="hint">L'argent reste la propriété de la personne qui fait l'avance. Le détenteur est simplement celui qui garde la somme pour les prochains achats. Lorsqu'elle est utilisée, la dépense commune est comptabilisée au nom de la personne qui a avancé l'argent.</p>
              <button className="primary wide" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer l'avance"}</button>
            </form>
          </section>

          <section className="panel">
            <p className="eyebrow">SOLDE PAR PERSONNE</p>
            <h2>Avances restantes</h2>
            <div className="people">
              {data.people.map((person) => (
                <div className="person" key={person}>
                  <div><strong>{person}</strong><small>{(data.advances[person] || 0) > 0 ? "Avance disponible" : "Aucune avance disponible"}</small></div>
                  <div className="balance"><b className={(data.advances[person] || 0) > 0 ? "positive" : ""}>{euro(data.advances[person] || 0)}</b></div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <p className="eyebrow">MOUVEMENTS</p>
            <h2>Historique des avances</h2>
            {data.advanceHistory.length ? (
              <div className="history">
                {data.advanceHistory.map((entry) => {
                  const used = Math.max(0, entry.amount - entry.remaining);
                  return (
                    <div className="transaction" key={entry.id}>
                      <div>
                        <strong>{entry.person} a remis {euro(entry.amount)}</strong>
                        <p>Argent détenu par {entry.holder}{entry.note ? " · " + entry.note : ""}</p>
                        <small>{dateLabel(entry.date)} · {used > 0 ? euro(used) + " utilisés" : "Pas encore utilisé"}</small>
                        <p className="advance-detail">Reste disponible : {euro(entry.remaining)}</p>
                      </div>
                      <div className="transaction-end">
                        <b className="positive">+{euro(entry.amount)}</b>
                        <button className="text-button" disabled={used > 0} onClick={() => deleteAdvance(entry)}>{used > 0 ? "Déjà utilisée" : "Supprimer"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="empty">Aucune avance enregistrée pour le moment.</p>}
            {data.transactions.some((entry) => entry.advanceUsed > 0) && (
              <div className="advance-history-spent">
                <p className="eyebrow">AVANCES UTILISÉES DANS LES ACHATS</p>
                {data.transactions.filter((entry) => entry.advanceUsed > 0).map((entry) => (
                  <div className="transaction" key={"spent-" + entry.id}>
                    <div><strong>{entry.advancePerson}</strong><p>{euro(entry.advanceUsed)} utilisés pour un achat collectif effectué par {entry.buyer}{entry.advanceHolder ? " · argent détenu par " + entry.advanceHolder : ""}</p><small>{dateLabel(entry.date)}</small></div>
                    <div className="transaction-end"><b>−{euro(entry.advanceUsed)}</b></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <footer>
        <span className="sync">{busy ? "● Enregistrement…" : message || "● Suivi partagé"}</span>
        <button className="share-button" onClick={shareSummary}>📸 Partager le récapitulatif</button>
        <button className="text-button" onClick={refresh}>Actualiser</button>
      </footer>
    </main>
  );
}
