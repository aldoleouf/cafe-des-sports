"use client";

import { useState } from "react";
import { euro } from "../../lib/format";
import { consumptionCheck } from "../../lib/stock";
import { RaceTrack } from "./Visuals";
import { buyerTotals, monthKey, monthLabel, monthPodium, monthlySpending } from "../../lib/stats";

// Prix moyen d'une unité, sur les achats d'un seul type de produit.
function averageUnitPrice(transactions, kinds, others) {
  let cents = 0, units = 0;
  transactions.forEach((transaction) => {
    const added = transaction.stockAdded || {};
    const mine = kinds.reduce((sum, kind) => sum + (Number(added[kind]) || 0), 0);
    const rest = others.reduce((sum, kind) => sum + (Number(added[kind]) || 0), 0);
    if (mine > 0 && !rest) { cents += transaction.amount; units += mine; }
  });
  return units ? { perUnit: cents / units, units } : null;
}

const unitPrice = (value) => (value / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " €";

export default function StatsTab({ data }) {
  const months = monthlySpending(data.transactions, 6);
  const [activeMonth, setActiveMonth] = useState(months.length - 1);
  const maxMonth = Math.max(1, ...months.map((month) => month.total));
  const since = new Date(); since.setMonth(since.getMonth() - 3);
  const buyers = buyerTotals(data.transactions, (transaction) => new Date(transaction.date) >= since);
  const maxBuyer = Math.max(1, ...buyers.map((buyer) => buyer.total));
  const podium = monthPodium(data.transactions);
  const coffee = averageUnitPrice(data.transactions, ["coffee"], ["lunch", "friday"]);
  const chocolate = averageUnitPrice(data.transactions, ["lunch", "friday"], ["coffee"]);
  const check = consumptionCheck(data);
  const month = months[activeMonth];

  if (!data.transactions.length) {
    return <section className="panel"><p className="eyebrow">STATISTIQUES</p><h2>Les chiffres du comptoir</h2><p className="empty">Les statistiques apparaîtront après les premiers achats.</p></section>;
  }

  return (
    <>
      <section className="panel">
        <p className="eyebrow">LA COURSE AU COMPTOIR</p>
        <h2>Qui mène ?</h2>
        <RaceTrack data={data} />
        <p className="tiny">Chacun est placé selon son solde : plus on a payé pour le groupe, plus on est devant.</p>
      </section>

      <section className="panel">
        <p className="eyebrow">PODIUM DE {monthLabel(monthKey(new Date()), "long").toUpperCase()}</p>
        <h2>Les plus gros acheteurs</h2>
        {podium.length ? (
          <div className="podium" role="list">
            {[1, 0, 2].map((rank) => podium[rank] && (
              <div className={"step step-" + (rank + 1)} role="listitem" key={podium[rank].person}>
                <span className="step-medal">{["🥇", "🥈", "🥉"][rank]}</span>
                <strong>{podium[rank].person}</strong>
                <small>{euro(podium[rank].total)}</small>
                <div className="step-block">{rank + 1}</div>
              </div>
            ))}
          </div>
        ) : <p className="empty">Personne n'a encore acheté ce mois-ci.</p>}
      </section>

      <section className="panel">
        <p className="eyebrow">DÉPENSES PAR MOIS</p>
        <h2>{euro(month.total)} <small className="h2-sub">en {monthLabel(month.key)}</small></h2>
        <div className="month-chart" role="list" aria-label="Dépenses des six derniers mois">
          {months.map((entry, index) => (
            <button type="button" role="listitem" key={entry.key} className={"month-bar" + (index === activeMonth ? " active" : "")}
              onClick={() => setActiveMonth(index)} onPointerEnter={() => setActiveMonth(index)}
              aria-label={monthLabel(entry.key) + " : " + euro(entry.total)}>
              <span className="bar-area"><i style={{ "--h": Math.max(entry.total ? 3 : 0, Math.round(entry.total / maxMonth * 100)) + "%", "--delay": index * 60 + "ms" }} /></span>
              <small>{monthLabel(entry.key, "short").replace(".", "")}</small>
            </button>
          ))}
        </div>
        <p className="tiny">Touche un mois pour voir son total.</p>
      </section>

      <section className="panel">
        <p className="eyebrow">LES 3 DERNIERS MOIS</p>
        <h2>Qui achète le plus</h2>
        <div className="rank-list">
          {buyers.length ? buyers.map((buyer, index) => (
            <div className="rank-row" key={buyer.person}>
              <span className="rank-name">{buyer.person}</span>
              <span className="rank-bar"><i style={{ "--w": Math.round(buyer.total / maxBuyer * 100) + "%", "--delay": index * 70 + "ms" }} /></span>
              <b>{euro(buyer.total)}</b>
            </div>
          )) : <p className="empty">Aucun achat ces trois derniers mois.</p>}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">PRIX MOYENS</p>
        <h2>Ce que coûte une pause</h2>
        <div className="sheet-stats">
          <div><b>{coffee ? unitPrice(coffee.perUnit) : "—"}</b><small>☕ le café{coffee ? " · sur " + coffee.units.toLocaleString("fr-FR") : ""}</small></div>
          <div><b>{chocolate ? unitPrice(chocolate.perUnit) : "—"}</b><small>🍫 le chocolat{chocolate ? " · sur " + chocolate.units.toLocaleString("fr-FR") : ""}</small></div>
          <div><b>{coffee ? euro(Math.round(coffee.perUnit * 2 * 21)) : "—"}</b><small>☕ par personne et par mois</small></div>
        </div>
        <p className="tiny">Calculé sur les achats d'un seul produit où les quantités ont été renseignées.</p>
      </section>

      <section className="panel">
        <p className="eyebrow">ESTIMATION OU RÉALITÉ ?</p>
        <h2>Consommation réelle</h2>
        {check ? (
          <>
            <p className="hint">Entre les relevés du {new Date(check.from + "T12:00").toLocaleDateString("fr-FR")} et du {new Date(check.to + "T12:00").toLocaleDateString("fr-FR")} :</p>
            <div className="rank-list">
              {check.kinds.map((kind) => {
                const gap = kind.estimated ? Math.round((kind.real - kind.estimated) / kind.estimated * 100) : null;
                return (
                  <div className="rank-row" key={kind.kind}>
                    <span className="rank-name">{kind.icon} {kind.label}</span>
                    <span>{kind.real.toLocaleString("fr-FR")} réels / {kind.estimated.toLocaleString("fr-FR")} estimés</span>
                    <b className={gap === null || Math.abs(gap) < 10 ? "" : gap > 0 ? "negative" : "positive"}>{gap === null ? "—" : (gap > 0 ? "+" : "") + gap + " %"}</b>
                  </div>
                );
              })}
            </div>
            <p className="tiny">Un écart positif veut dire qu'on consomme plus que prévu : les alertes risquent d'arriver trop tard.</p>
          </>
        ) : <p className="empty">Il faut au moins deux relevés de stock pour comparer.</p>}
      </section>
    </>
  );
}
