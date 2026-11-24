"use client";

import { useState } from "react";
import { euro, signed, target } from "../../lib/format";
import { addPerson, removePerson, restorePerson } from "../../lib/ledger";
import { purchaseAdvice } from "../../lib/recap";
import { referencePrices, restockSuggestion } from "../../lib/stock";
import { averagePurchase, wentAheadThisMonth } from "../../lib/stats";
import { pause } from "./SaveButton";
import PersonSheet from "./PersonSheet";
import { BalanceScale } from "./Visuals";

export default function ComptesTab({ data, stocks, nextBuyer, reserve, toggleReserve, busy, mutate, flash }) {
  const [newPerson, setNewPerson] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [managing, setManaging] = useState(false);
  const [leaving, setLeaving] = useState(null);
  const [hopping, setHopping] = useState(null); // avatar qui sautille
  const [sheet, setSheet] = useState(null); // fiche ouverte
  const count = data.people.length;
  const latestStock = data.stockHistory?.[0] || null;
  const lowStocks = stocks.filter((stock) => stock.low);
  const maxAbs = Math.max(100, ...data.people.map((person) => Math.abs(data.balances[person] || 0)));
  const prices = referencePrices(data.transactions);
  const suggestions = lowStocks.map((stock) => ({ stock, suggestion: restockSuggestion(stock, count, prices) })).filter((entry) => entry.suggestion);
  // Jauge de retard : la dette du prochain, comparée à un achat moyen du groupe.
  const average = averagePurchase(data.transactions);
  const nextDebt = nextBuyer ? Math.abs(data.balances[nextBuyer] || 0) : 0;
  const gauge = Math.min(1, nextDebt / Math.max(1, average));

  const openPerson = async (person) => {
    setHopping({ person, key: Date.now() });
    await pause(260);
    setSheet(person);
  };

  const submitPerson = async (event) => {
    event.preventDefault();
    if (await mutate((state) => addPerson(state, newPerson))) {
      setNewPerson("");
      setShowAdd(false);
    }
  };

  const remove = async (person) => {
    const balance = data.balances[person] || 0;
    const warning = balance
      ? "\n\nSon solde de " + signed(balance) + " sera gelé : réglez-le entre vous en direct. Il ne participera plus aux achats ni aux stocks, mais reste dans l'historique et pourra être réactivé."
      : "\n\nIl ne participera plus aux achats ni aux stocks.";
    if (!confirm("Retirer " + person + " du groupe ?" + warning)) return;
    setLeaving(person);
    await pause(320);
    await mutate((state) => removePerson(state, person));
    setLeaving(null);
  };

  return (
    <>
      <section className="panel next">
        <p className="eyebrow">PROCHAIN À PASSER AU COMPTOIR</p>
        {nextBuyer ? (
          <>
            <h2>{nextBuyer}</h2>
            <p className="amount">{euro(target(data.balances[nextBuyer], count))} <small>à dépenser pour compenser</small></p>
            <div className="gauge" role="img" aria-label={"Retard de " + euro(nextDebt) + ", pour un achat moyen de " + euro(average)}>
              <span className="gauge-track"><i style={{ "--fill": Math.max(4, Math.round(gauge * 100)) + "%" }} /></span>
              <small>Retard {euro(nextDebt)} · un achat moyen ≈ {euro(average)}</small>
            </div>
            <p className="hint">{purchaseAdvice({ ...data, reserve }, stocks)}</p>
            {suggestions.length > 0 && (
              <ul className="suggestions">
                {suggestions.map(({ stock, suggestion }) => (
                  <li key={stock.kind}>{stock.icon} ≈ {suggestion.quantity.toLocaleString("fr-FR")} {stock.unit}s pour tenir 4 semaines{suggestion.cost !== null ? " (≈ " + euro(suggestion.cost) + ")" : ""}</li>
                ))}
              </ul>
            )}
          </>
        ) : <h2>Tout le monde est à jour !</h2>}
      </section>

      <section className="panel">
        <p className="eyebrow">LA BALANCE DU COMPTOIR</p>
        <BalanceScale data={data} average={average} />
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">LE CARNET DU COMPTOIR</p>
            <h2>Les comptes du groupe</h2>
          </div>
          <div className="head-actions">
            <button className={"small-button" + (managing ? " on" : "")} onClick={() => { setManaging(!managing); setShowAdd(false); }}>{managing ? "Terminé" : "Gérer"}</button>
            <button className="small-button" onClick={() => { setShowAdd(!showAdd); setManaging(false); }}>＋ Personne</button>
          </div>
        </div>
        {showAdd && (
          <form className="add-form" onSubmit={submitPerson}>
            <input value={newPerson} onChange={(event) => setNewPerson(event.target.value)} placeholder="Nom du copain" required />
            <button className="primary" type="submit" disabled={busy}>Ajouter</button>
          </form>
        )}
        <div className="people">
          {data.people.map((person) => {
            const bal = data.balances[person] || 0;
            return (
              <div className={"person tappable" + (leaving === person ? " leaving" : "")} key={person}
                role="button" tabIndex={0} aria-label={"Fiche de " + person}
                onClick={(event) => { if (!event.target.closest("button")) openPerson(person); }}
                onKeyDown={(event) => { if (event.key === "Enter") openPerson(person); }}>
                <div key={hopping?.person === person ? hopping.key : "still"} className={"avatar " + (bal < 0 ? "late" : bal > 0 ? "ahead" : "") + (hopping?.person === person ? " hop" : "")} aria-hidden="true">{person.charAt(0).toUpperCase()}</div>
                <div className="person-main">
                  <strong>{person}{wentAheadThisMonth(data, person) && <span className="medal" title="Passé en avance ce mois-ci">🏅</span>}</strong>
                  <small>{bal < 0 ? "En retard" : bal > 0 ? "En avance" : "À jour"}</small>
                  <span className="meter"><i className={bal < 0 ? "late" : "ahead"} style={{ width: Math.round(Math.abs(bal) / maxAbs * 100) + "%" }} /></span>
                </div>
                <div className="balance">
                  <b key={flash.names.includes(person) ? "flash-" + flash.key : "still"} className={(bal < 0 ? "negative" : bal > 0 ? "positive" : "") + (flash.names.includes(person) ? " flash" : "")}>{signed(bal)}</b>
                  {bal < 0 && <small className="target">À dépenser : {euro(target(bal, count))}</small>}
                  {managing && <button className="text-button" disabled={busy || count <= 1} onClick={() => remove(person)}>Retirer</button>}
                </div>
              </div>
            );
          })}
        </div>
        {data.archived.length > 0 && (
          <div className="archived">
            <p className="eyebrow">ANCIENS MEMBRES</p>
            {data.archived.map((person) => (
              <div className="archived-row" key={person}>
                <span>{person} <small>· solde gelé {signed(data.balances[person] || 0)}</small></span>
                {managing && <button className="text-button" disabled={busy} onClick={() => mutate((state) => restorePerson(state, person))}>Réactiver</button>}
              </div>
            ))}
          </div>
        )}
        <div className="reserve">
          <p className="eyebrow">APPROCHE FIN DE RÉSERVE</p>
          {latestStock ? (
            <>
              <p>Priorité calculée automatiquement à partir des stocks :</p>
              <div className="choices">
                {lowStocks.length ? lowStocks.map((stock) => (
                  <span className="choice active" key={stock.kind}>{stock.icon} {stock.label}</span>
                )) : <span className="choice">Stocks suffisants</span>}
              </div>
              <p className="tiny">Même seuil que les notifications. Café : {stocks[0].value?.toLocaleString("fr-FR") ?? "—"} restant · Chocolat midi : {stocks[1].value?.toLocaleString("fr-FR") ?? "—"} · Chocolat vendredi : {stocks[2].value?.toLocaleString("fr-FR") ?? "—"}.</p>
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
      <PersonSheet data={data} person={sheet} onClose={() => setSheet(null)} />
    </>
  );
}
