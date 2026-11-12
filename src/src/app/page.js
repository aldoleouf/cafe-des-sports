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

function normalizeData(value) {
  return {
    ...INITIAL,
    ...(value || {}),
    people: Array.isArray(value?.people) ? value.people : INITIAL.people,
    balances: value?.balances && typeof value.balances === "object" ? value.balances : INITIAL.balances,
    transactions: Array.isArray(value?.transactions) ? value.transactions : [],
    reserve: Array.isArray(value?.reserve) ? value.reserve : ["Café"],
    advances: value?.advances && typeof value.advances === "object" ? value.advances : {},
    advanceHistory: Array.isArray(value?.advanceHistory) ? value.advanceHistory : []
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
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");
  const [advanceFrom, setAdvanceFrom] = useState("");

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

  const addPurchase = async (event) => {
    event.preventDefault();
    const cents = Math.round(100 * Number(amount.replace(",", ".")));
    if (!Number.isFinite(cents) || cents <= 0 || !buyer) return;

    const participants = [...data.people];
    const baseShare = Math.floor(cents / participants.length);
    const remainder = cents - baseShare * participants.length;
    const changes = {};
    participants.forEach((person, index) => {
      changes[person] = -(baseShare + (index < remainder ? 1 : 0));
    });

    const available = advanceFrom ? Math.max(0, data.advances[advanceFrom] || 0) : 0;
    const advanceUsed = Math.min(cents, available);
    changes[buyer] = (changes[buyer] || 0) + cents - advanceUsed;
    if (advanceUsed && advanceFrom) changes[advanceFrom] = (changes[advanceFrom] || 0) + advanceUsed;

    const balances = { ...data.balances };
    participants.forEach((person) => {
      balances[person] = (balances[person] || 0) + (changes[person] || 0);
    });
    const advances = { ...data.advances };
    if (advanceUsed && advanceFrom) advances[advanceFrom] = available - advanceUsed;

    const transaction = {
      id: Date.now().toString(),
      buyer,
      amount: cents,
      item,
      note: note.trim(),
      date: new Date().toISOString(),
      participants,
      changes,
      advancePerson: advanceUsed ? advanceFrom : null,
      advanceUsed
    };
    const next = {
      ...data,
      balances,
      advances,
      transactions: [transaction, ...data.transactions]
    };
    if (await sync(next)) {
      setAmount("");
      setNote("");
      setAdvanceFrom("");
    }
  };

  const addAdvance = async (event) => {
    event.preventDefault();
    const cents = Math.round(100 * Number(advanceAmount.replace(",", ".")));
    if (!Number.isFinite(cents) || cents <= 0 || !advancePerson) return;
    const advances = { ...data.advances, [advancePerson]: (data.advances[advancePerson] || 0) + cents };
    const entry = {
      id: Date.now().toString(),
      person: advancePerson,
      amount: cents,
      note: advanceNote.trim(),
      date: new Date().toISOString()
    };
    const next = { ...data, advances, advanceHistory: [entry, ...data.advanceHistory] };
    if (await sync(next)) {
      setAdvanceAmount("");
      setAdvanceNote("");
    }
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
    const advances = { ...data.advances };
    if (transaction.advancePerson && transaction.advanceUsed) {
      advances[transaction.advancePerson] = (advances[transaction.advancePerson] || 0) + transaction.advanceUsed;
    }
    await sync({
      ...data,
      balances,
      advances,
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
        <button className={tab === "avances" ? "active" : ""} onClick={() => setTab("avances")}>Avances café</button>
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
                <p className="hint">Idéalement en {reserve.length ? reserve.join(" et ").toLowerCase() : "café"}</p>
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
              <p>Pour les prochains achats, privilégier :</p>
              <div className="choices">
                {["Café", "Chocolat"].map((value) => (
                  <button type="button" key={value} className={reserve.includes(value) ? "choice active" : "choice"} onClick={() => toggleReserve(value)}>
                    {value === "Café" ? "☕ " : "🍫 "}{value}
                  </button>
                ))}
              </div>
              <p className="tiny">Tu peux sélectionner le café, le chocolat ou les deux.</p>
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
            <label>Financé par une avance ?
              <select value={advanceFrom} onChange={(event) => setAdvanceFrom(event.target.value)}>
                <option value="">Aucune avance</option>
                {data.people.filter((person) => (data.advances[person] || 0) > 0).map((person) => (
                  <option key={person} value={person}>Avance de {person} — {euro(data.advances[person])} disponible</option>
                ))}
              </select>
            </label>
            {advanceFrom && <p className="hint">L'application utilisera automatiquement jusqu'à {euro(data.advances[advanceFrom] || 0)} de l'avance de {advanceFrom}. Le reste sera imputé à {buyer}.</p>}
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
                    {transaction.advanceUsed > 0 && <p className="advance-detail">Dont {euro(transaction.advanceUsed)} pris sur l'avance de {transaction.advancePerson}</p>}
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

      {tab === "avances" && (
        <>
          <section className="panel next">
            <p className="eyebrow">AVANCES DISPONIBLES POUR LES PROCHAINS ACHATS</p>
            <p className="amount">{euro(totalAdvance)}</p>
            <p className="hint">Somme encore disponible pour acheter du café ou du chocolat pour le groupe.</p>
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
              <label>Précision (facultatif)
                <input value={advanceNote} onChange={(event) => setAdvanceNote(event.target.value)} placeholder="Ex. virement pour le café" />
              </label>
              <p className="hint">Une avance ne modifie pas immédiatement les comptes du groupe. Elle devient une dépense commune payée par cette personne au fur et à mesure des achats financés avec cette avance.</p>
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
                {data.advanceHistory.map((entry) => (
                  <div className="transaction" key={entry.id}>
                    <div>
                      <strong>{entry.person}</strong>
                      <p>Virement reçu{entry.note ? " · " + entry.note : ""}</p>
                      <small>{dateLabel(entry.date)}</small>
                    </div>
                    <div className="transaction-end"><b className="positive">+{euro(entry.amount)}</b></div>
                  </div>
                ))}
              </div>
            ) : <p className="empty">Aucune avance enregistrée pour le moment.</p>}
            {data.transactions.some((entry) => entry.advanceUsed > 0) && (
              <div className="advance-history-spent">
                <p className="eyebrow">AVANCES UTILISÉES DANS LES ACHATS</p>
                {data.transactions.filter((entry) => entry.advanceUsed > 0).map((entry) => (
                  <div className="transaction" key={"spent-" + entry.id}>
                    <div><strong>{entry.advancePerson}</strong><p>Achat collectif effectué par {entry.buyer}</p><small>{dateLabel(entry.date)}</small></div>
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
