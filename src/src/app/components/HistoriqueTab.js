"use client";

import { euro, dateLabel } from "../../lib/format";
import { revertPurchase } from "../../lib/ledger";

const STOCK_LABELS = [["coffee", "☕"], ["lunch", "🍫 midi"], ["friday", "🍫 vendredi"]];

export default function HistoriqueTab({ data, busy, mutate, onEdit }) {
  const cancel = async (transaction) => {
    if (!confirm("Annuler l'achat de " + transaction.buyer + " (" + euro(transaction.amount) + ", " + dateLabel(transaction.date) + ") ?")) return;
    await mutate((state) => revertPurchase(state, transaction.id));
  };

  return (
    <section className="panel">
      <p className="eyebrow">LES TOURNÉES PASSÉES</p>
      <h2>Historique des achats</h2>
      {data.transactions.length ? (
        <div className="history">
          {data.transactions.map((transaction) => {
            const absent = transaction.participants ? data.people.filter((person) => !transaction.participants.includes(person)) : [];
            // Les anciens achats financés par une avance sans identifiant ne peuvent qu'être annulés.
            const editable = !(transaction.advanceUsed > 0 && !transaction.advanceId);
            return (
              <div className="transaction" key={transaction.id}>
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
      ) : <p className="empty">Pas encore d'achat enregistré.</p>}
    </section>
  );
}
