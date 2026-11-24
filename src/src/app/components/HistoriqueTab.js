"use client";

import { useState } from "react";
import { euro, dateLabel } from "../../lib/format";
import { pause } from "./SaveButton";
import PurchaseCalendar from "./PurchaseCalendar";
import { localDateKey } from "../../lib/stock";
import { revertPurchase } from "../../lib/ledger";

const STOCK_LABELS = [["coffee", "☕"], ["lunch", "🍫 midi"], ["friday", "🍫 vendredi"]];

export default function HistoriqueTab({ data, busy, mutate, onEdit }) {
  const [leaving, setLeaving] = useState([]);
  const [view, setView] = useState("liste");
  const [day, setDay] = useState(null);
  const shown = view === "calendrier" && day
    ? data.transactions.filter((transaction) => localDateKey(new Date(transaction.date)) === day)
    : data.transactions;
  const cancel = async (transaction) => {
    if (!confirm("Annuler l'achat de " + transaction.buyer + " (" + euro(transaction.amount) + ", " + dateLabel(transaction.date) + ") ?")) return;
    setLeaving((ids) => [...ids, transaction.id]);
    await pause(320); // le temps que la ligne se replie
    if (!(await mutate((state) => revertPurchase(state, transaction.id)))) {
      setLeaving((ids) => ids.filter((id) => id !== transaction.id));
    }
  };

  return (
    <section className="panel">
      <p className="eyebrow">LES TOURNÉES PASSÉES</p>
      <div className="section-head">
        <h2>Historique des achats</h2>
        <div className="segmented" role="tablist">
          {["liste", "calendrier"].map((value) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} className={view === value ? "on" : ""} onClick={() => { setView(value); setDay(null); }}>
              {value === "liste" ? "Liste" : "Calendrier"}
            </button>
          ))}
        </div>
      </div>
      {view === "calendrier" && <PurchaseCalendar transactions={data.transactions} pauses={data.pauses} selected={day} onSelect={setDay} />}
      {view === "calendrier" && (
        <p className="hint">{day ? (shown.length ? "Achats du " : "Aucun achat le ") + new Date(day + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + "." : "Touche un jour pour voir ses achats."}</p>
      )}
      {view === "calendrier" && !day ? null : shown.length ? (
        <div className="history">
          {shown.map((transaction) => {
            const absent = transaction.participants ? data.people.filter((person) => !transaction.participants.includes(person)) : [];
            // Les anciens achats financés par une avance sans identifiant ne peuvent qu'être annulés.
            const editable = !(transaction.advanceUsed > 0 && !transaction.advanceId);
            return (
              <div className={"transaction" + (leaving.includes(transaction.id) ? " leaving" : "")} key={transaction.id}>
                <div>
                  <strong>{transaction.buyer}</strong>
                  <p>{transaction.item}{transaction.note ? " · " + transaction.note : ""}</p>
                  {absent.length > 0 && <p className="advance-detail muted">Sans {absent.join(", ")}</p>}
                  {(transaction.stockAdded && Object.values(transaction.stockAdded).some((quantity) => Number(quantity) > 0)) && (
                    <p className="advance-detail">Stock ajouté : {STOCK_LABELS.filter(([key]) => Number(transaction.stockAdded[key]) > 0).map(([key, label]) => label + " " + transaction.stockAdded[key]).join(" · ")}</p>
                  )}
                  {transaction.advanceUsed > 0 && <p className="advance-detail">Dont {euro(transaction.advanceUsed)} pris sur l'avance de {transaction.advancePerson}{transaction.advanceHolder ? " (détenue par " + transaction.advanceHolder + ")" : ""}</p>}
                  <small>{dateLabel(transaction.date)}{transaction.editedAt ? " · modifié le " + dateLabel(transaction.editedAt) : ""}</small>
                </div>
                <div className="transaction-end">
                  <b>{euro(transaction.amount)}</b>
                  {editable && <button className="text-button edit" disabled={busy} onClick={() => onEdit(transaction)}>Modifier</button>}
                  <button className="text-button" disabled={busy} onClick={() => cancel(transaction)}>Annuler</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "liste" && <p className="empty">Pas encore d'achat enregistré.</p>}
    </section>
  );
}
