"use client";

import { useEffect, useRef, useState } from "react";
import { euro, signed, target, dateLabel, shortDate } from "../../lib/format";
import { balanceHistory } from "../../lib/stats";

const W = 320, H = 96, PAD = 8;

// Courbe de l'évolution du solde ; toucher la courbe affiche le solde à cette date.
function BalanceChart({ points }) {
  const [active, setActive] = useState(null);
  if (points.length < 2) return <p className="empty">Pas encore assez de mouvements pour tracer l'évolution.</p>;
  const values = points.map((point) => point.balance);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const x = (i) => PAD + i * (W - 2 * PAD) / (points.length - 1);
  const y = (value) => PAD + (max - value) * (H - 2 * PAD) / Math.max(1, max - min);
  const path = points.map((point, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(point.balance).toFixed(1)).join(" ");
  const shown = active ?? points.length - 1;
  const pick = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  };
  return (
    <div className="balance-chart">
      <p className="chart-readout">
        <b className={points[shown].balance < 0 ? "negative" : points[shown].balance > 0 ? "positive" : ""}>{signed(points[shown].balance)}</b>
        <small>{shown === points.length - 1 ? "aujourd'hui" : "le " + shortDate(new Date(points[shown].date))}</small>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={"Évolution du solde, de " + signed(values[0]) + " à " + signed(values.at(-1))}
        onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)}>
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="chart-zero" />
        <path d={path} className="chart-line" pathLength="1" />
        <line x1={x(shown)} x2={x(shown)} y1={PAD} y2={H - PAD} className="chart-cursor" />
        <circle cx={x(shown)} cy={y(points[shown].balance)} r="4.5" className="chart-dot" />
      </svg>
    </div>
  );
}

// Fiche d'une personne : solde, évolution, achats et avances.
export default function PersonSheet({ data, person, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (person && !element.open) element.showModal();
    if (!person && element.open) element.close();
  }, [person]);

  const balance = person ? data.balances[person] || 0 : 0;
  const bought = person ? data.transactions.filter((transaction) => transaction.buyer === person) : [];
  const involved = person ? data.transactions.filter((transaction) => transaction.changes?.[person]).slice(0, 8) : [];
  const advances = person ? data.advanceHistory.filter((entry) => entry.person === person) : [];
  const holding = person ? data.advanceHistory.filter((entry) => entry.holder === person && entry.remaining > 0) : [];

  return (
    <dialog ref={dialog} className="sheet" onClose={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
      {person && (
        <div className="sheet-body">
          <div className="sheet-head">
            <div className={"avatar big " + (balance < 0 ? "late" : balance > 0 ? "ahead" : "")}>{person.charAt(0).toUpperCase()}</div>
            <div>
              <p className="eyebrow">FICHE</p>
              <h2>{person}</h2>
              <p className={"sheet-balance " + (balance < 0 ? "negative" : balance > 0 ? "positive" : "")}>
                {signed(balance)} <small>{balance < 0 ? "· à dépenser : " + euro(target(balance, data.people.length)) : balance > 0 ? "· en avance" : "· à jour"}</small>
              </p>
            </div>
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Fermer">✕</button>
          </div>

          <BalanceChart points={balanceHistory(data, person)} />

          <div className="sheet-stats">
            <div><b>{bought.length}</b><small>achat{bought.length > 1 ? "s" : ""} payé{bought.length > 1 ? "s" : ""}</small></div>
            <div><b>{euro(bought.reduce((sum, transaction) => sum + transaction.amount, 0))}</b><small>au total</small></div>
            <div><b>{bought[0] ? shortDate(new Date(bought[0].date)) : "—"}</b><small>dernier achat</small></div>
          </div>

          {(advances.length > 0 || holding.length > 0) && (
            <div className="sheet-section">
              <p className="eyebrow">AVANCES</p>
              {advances.map((entry) => <p key={entry.id}>A remis {euro(entry.amount)} à {entry.holder} · reste {euro(entry.remaining)}</p>)}
              {holding.map((entry) => <p key={"h" + entry.id}>Détient {euro(entry.remaining)} de {entry.person}</p>)}
            </div>
          )}

          <div className="sheet-section">
            <p className="eyebrow">DERNIERS MOUVEMENTS</p>
            {involved.length ? involved.map((transaction) => (
              <div className="sheet-row" key={transaction.id}>
                <span>{transaction.buyer === person ? "A payé " + transaction.item.toLowerCase() : transaction.item + " payé par " + transaction.buyer}<small>{dateLabel(transaction.date)}</small></span>
                <b className={transaction.changes[person] < 0 ? "negative" : "positive"}>{signed(transaction.changes[person])}</b>
              </div>
            )) : <p className="empty">Aucun mouvement pour le moment.</p>}
          </div>
        </div>
      )}
    </dialog>
  );
}
