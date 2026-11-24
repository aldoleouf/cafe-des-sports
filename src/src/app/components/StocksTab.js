"use client";

import { useState } from "react";
import { STOCK_KINDS, localDateKey } from "../../lib/stock";
import { newId } from "../../lib/ledger";
import { parseNumber } from "../../lib/format";
import SaveButton, { flashDone } from "./SaveButton";

const RATES = {
  coffee: ["2 par personne", "Du lundi au vendredi"],
  lunch: ["1 par personne", "Du lundi au jeudi"],
  friday: ["1 par personne", "Chaque vendredi"]
};
const alertRule = (kind) => kind === "friday"
  ? "moins de " + STOCK_KINDS.friday.alertDays + " vendredis"
  : "moins de " + STOCK_KINDS[kind].alertDays + " jours";

export default function StocksTab({ data, stocks, busy, mutate, push }) {
  const [values, setValues] = useState({ coffee: "", lunch: "", friday: "" });
  const [done, setDone] = useState(false);
  const latest = data.stockHistory?.[0] || null;
  const peopleCount = data.people.length;

  const saveSnapshot = async (event) => {
    event.preventDefault();
    const numbers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, parseNumber(value)]));
    if (Object.values(numbers).some((value) => !Number.isFinite(value) || value < 0)) {
      return mutate(() => "Renseigne trois quantités positives ou nulles.");
    }
    const snapshot = { id: newId(), date: localDateKey(), ...numbers, peopleCount, recordedAt: new Date().toISOString() };
    const ok = await mutate((state) => ({ ...state, stockHistory: [snapshot, ...(state.stockHistory || [])] }));
    if (ok) { setValues({ coffee: "", lunch: "", friday: "" }); flashDone(setDone); }
  };

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
          {stocks.map((stock) => (
            <div className={"stock-card" + (stock.value !== null && stock.value <= 0 ? " out" : stock.low ? " alert" : "")} key={stock.kind}>
              <div className="stock-card-title"><span>{stock.icon}</span><strong>{stock.label}</strong></div>
              {stock.value === null ? <b className="stock-number">—</b> : <b className={"stock-number " + (stock.value <= 0 ? "negative" : stock.low ? "low" : "positive")}>{stock.value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</b>}
              <small>{stock.value === null ? "En attente du premier relevé" : stock.low ? "unités restantes · à racheter" : "unités estimées restantes"}</small>
              <p>{RATES[stock.kind][0]} · {RATES[stock.kind][1]}</p>
              {stock.value === null ? (
                <p className="stock-estimate">Date de fin estimée après le premier relevé de stock</p>
              ) : stock.depletion && (
                <p className="stock-estimate">
                  {stock.depletion.date
                    ? <>Fin estimée du stock : <strong>{stock.depletion.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong><br />Dans {stock.depletion.consumptionDays} jour{stock.depletion.consumptionDays > 1 ? "s" : ""} de consommation</>
                    : <strong>Rupture théorique déjà atteinte</strong>}
                </p>
              )}
            </div>
          ))}
        </div>
        {latest && <p className="hint">Estimation calculée depuis le dernier relevé, avec {peopleCount} participants enregistrés. Un produit passe en orange quand il en reste pour {alertRule("coffee")} (café, chocolat du midi) ou {alertRule("friday")} (chocolat du vendredi).</p>}
      </section>
      <section className="panel">
        <p className="eyebrow">NOTIFICATIONS</p>
        <h2>Alerte avant la rupture</h2>
        <p className="hint">Une notification est envoyée sur ce téléphone quand il reste {alertRule("coffee")} de café ou de chocolat du midi, ou {alertRule("friday")} de chocolat du vendredi.</p>
        {push.pushState === "on" && <>
          <p className="push-status">🔔 Alertes activées sur cet appareil</p>
          <button type="button" className="text-button" onClick={push.disable}>Désactiver les alertes</button>
        </>}
        {(push.pushState === "off" || push.pushState === "busy") && (
          <button type="button" className="share-button" onClick={push.enable} disabled={push.pushState === "busy"}>
            {push.pushState === "busy" ? "Activation…" : "🔔 Activer les alertes de stock"}
          </button>
        )}
        {push.pushState === "denied" && <p className="tiny">Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur, puis recharge la page.</p>}
        {push.pushState === "ios" && <p className="tiny">Sur iPhone : touche Partager puis « Sur l'écran d'accueil », ouvre l'app depuis l'icône et reviens ici pour activer les alertes.</p>}
        {push.pushState === "unsupported" && <p className="tiny">Ce navigateur ne permet pas les notifications.</p>}
      </section>
      <section className="panel">
        <p className="eyebrow">RELEVÉ HEBDOMADAIRE</p>
        <h2>Mettre à jour les quantités</h2>
        <p className="hint">Saisis le nombre approximatif d'unités ou de portions réellement restantes aujourd'hui. Cette saisie devient le nouveau point de départ des calculs.</p>
        <form className="purchase" onSubmit={saveSnapshot}>
          {[["coffee", "☕ Café restant (nombre de cafés)", "Ex. 120"], ["lunch", "🍫 Chocolat du midi restant (portions)", "Ex. 35"], ["friday", "🍫 Chocolat du vendredi restant (portions)", "Ex. 20"]].map(([key, label, placeholder]) => (
            <label key={key}>{label}
              <input inputMode="decimal" value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} placeholder={placeholder} required />
            </label>
          ))}
          <SaveButton busy={busy} done={done} doneLabel="Relevé enregistré">Enregistrer le relevé</SaveButton>
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
}
