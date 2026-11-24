"use client";

import { useState } from "react";
import { euro, dateLabel, parseNumber } from "../../lib/format";
import { newId } from "../../lib/ledger";
import SaveButton, { flashDone, pause } from "./SaveButton";

const totalsFrom = (advanceHistory) => {
  const advances = {};
  advanceHistory.forEach((entry) => { advances[entry.person] = (advances[entry.person] || 0) + entry.remaining; });
  return advances;
};

export default function AvancesTab({ data, busy, mutate, onSaved }) {
  const [person, setPerson] = useState(data.people.includes("Gilles") ? "Gilles" : data.people[0] || "");
  const [holder, setHolder] = useState(data.people.includes("Antoine") ? "Antoine" : data.people[0] || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState([]);
  const totalAdvance = Object.values(data.advances || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const available = data.advanceHistory.filter((entry) => entry.remaining > 0);

  const addAdvance = async (event) => {
    event.preventDefault();
    const cents = Math.round(100 * parseNumber(amount));
    if (!Number.isFinite(cents) || cents <= 0 || !person || !holder) return mutate(() => "Indique un montant valide.");
    const entry = { id: newId(), person, holder, amount: cents, remaining: cents, note: note.trim(), date: new Date().toISOString() };
    const ok = await mutate((state) => {
      const advanceHistory = [entry, ...state.advanceHistory];
      return { ...state, advanceHistory, advances: totalsFrom(advanceHistory) };
    });
    if (ok) { setAmount(""); setNote(""); flashDone(setDone); onSaved?.(entry); }
  };

  const deleteAdvance = async (entry) => {
    if (entry.amount - entry.remaining > 0) {
      alert("Cette avance a déjà servi à financer un achat. Annule d'abord les achats concernés avant de supprimer l'avance.");
      return;
    }
    if (!confirm("Supprimer cette avance de " + euro(entry.amount) + " de " + entry.person + " remise à " + entry.holder + " ?")) return;
    setLeaving((ids) => [...ids, entry.id]);
    await pause(320);
    const ok = await mutate((state) => {
      const current = state.advanceHistory.find((item) => item.id === entry.id);
      if (!current) return "Cette avance a déjà été supprimée.";
      if (current.amount - current.remaining > 0) return "Cette avance vient d'être utilisée pour un achat.";
      const advanceHistory = state.advanceHistory.filter((item) => item.id !== entry.id);
      return { ...state, advanceHistory, advances: totalsFrom(advanceHistory) };
    });
    if (!ok) setLeaving((ids) => ids.filter((id) => id !== entry.id));
  };

  return (
    <>
      <section className="panel next">
        <p className="eyebrow">AVANCES DISPONIBLES POUR LES PROCHAINS ACHATS</p>
        <p className="amount">{euro(totalAdvance)}</p>
        <p className="hint">Somme encore disponible pour acheter du café ou du chocolat pour le groupe.</p>
      </section>

      <section className="panel">
        <p className="eyebrow">QUI DÉTIENT L'ARGENT ?</p>
        <h2>Argent confié</h2>
        {available.length ? (
          <div className="people">
            {available.map((entry) => (
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
            <select value={person} onChange={(event) => setPerson(event.target.value)}>
              {data.people.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>Montant reçu (€)
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 100" required />
          </label>
          <label>À qui l'argent a-t-il été remis ?
            <select value={holder} onChange={(event) => setHolder(event.target.value)}>
              {data.people.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>Précision (facultatif)
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex. virement pour le café" />
          </label>
          <p className="hint">L'argent reste la propriété de la personne qui fait l'avance. Le détenteur est simplement celui qui garde la somme pour les prochains achats. Lorsqu'elle est utilisée, la dépense commune est comptabilisée au nom de la personne qui a avancé l'argent.</p>
          <SaveButton busy={busy} done={done} doneLabel="Avance enregistrée">Enregistrer l'avance</SaveButton>
        </form>
      </section>

      <section className="panel">
        <p className="eyebrow">SOLDE PAR PERSONNE</p>
        <h2>Avances restantes</h2>
        <div className="people">
          {data.people.map((name) => (
            <div className="person" key={name}>
              <div><strong>{name}</strong><small>{(data.advances[name] || 0) > 0 ? "Avance disponible" : "Aucune avance disponible"}</small></div>
              <div className="balance"><b className={(data.advances[name] || 0) > 0 ? "positive" : ""}>{euro(data.advances[name] || 0)}</b></div>
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
                <div className={"transaction" + (leaving.includes(entry.id) ? " leaving" : "")} key={entry.id}>
                  <div>
                    <strong>{entry.person} a remis {euro(entry.amount)}</strong>
                    <p>Argent détenu par {entry.holder}{entry.note ? " · " + entry.note : ""}</p>
                    <small>{dateLabel(entry.date)} · {used > 0 ? euro(used) + " utilisés" : "Pas encore utilisé"}</small>
                    <p className="advance-detail">Reste disponible : {euro(entry.remaining)}</p>
                  </div>
                  <div className="transaction-end">
                    <b className="positive">+{euro(entry.amount)}</b>
                    <button className="text-button" disabled={used > 0 || busy} onClick={() => deleteAdvance(entry)}>{used > 0 ? "Déjà utilisée" : "Supprimer"}</button>
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
  );
}
