"use client";

import { useState } from "react";
import { euro, signed, target } from "../../lib/format";
import { addPerson, removePerson, restorePerson } from "../../lib/ledger";
import { purchaseAdvice } from "../../lib/recap";

export default function ComptesTab({ data, stocks, nextBuyer, reserve, toggleReserve, busy, mutate }) {
  const [newPerson, setNewPerson] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [managing, setManaging] = useState(false);
  const count = data.people.length;
  const latestStock = data.stockHistory?.[0] || null;
  const lowStocks = stocks.filter((stock) => stock.low);
  const maxAbs = Math.max(100, ...data.people.map((person) => Math.abs(data.balances[person] || 0)));

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
    await mutate((state) => removePerson(state, person));
  };

  return (
    <>
      <section className="panel next">
        <p className="eyebrow">PROCHAIN À PASSER AU COMPTOIR</p>
        {nextBuyer ? (
          <>
            <h2>{nextBuyer}</h2>
            <p className="amount">{euro(target(data.balances[nextBuyer], count))} <small>à dépenser pour compenser</small></p>
            <p className="hint">{purchaseAdvice({ ...data, reserve }, stocks)}</p>
          </>
        ) : <h2>Tout le monde est à jour !</h2>}
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
              <div className="person" key={person}>
                <div className={"avatar " + (bal < 0 ? "late" : bal > 0 ? "ahead" : "")} aria-hidden="true">{person.charAt(0).toUpperCase()}</div>
                <div className="person-main">
                  <strong>{person}</strong>
                  <small>{bal < 0 ? "En retard" : bal > 0 ? "En avance" : "À jour"}</small>
                  <span className="meter"><i className={bal < 0 ? "late" : "ahead"} style={{ width: Math.round(Math.abs(bal) / maxAbs * 100) + "%" }} /></span>
                </div>
                <div className="balance">
                  <b className={bal < 0 ? "negative" : bal > 0 ? "positive" : ""}>{signed(bal)}</b>
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
    </>
  );
}
