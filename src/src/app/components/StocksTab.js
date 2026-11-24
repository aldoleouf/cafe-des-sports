"use client";

import { useEffect, useState } from "react";
import { STOCK_KINDS, dailyStockRate, localDateKey, referencePrices, restockSuggestion, upcomingHolidays } from "../../lib/stock";
import { CoffeeJar, ChocolateBar, DeliveryTruck } from "./Visuals";

const SEEN_KEY = "cafe-des-sports:livraisons-vues";
import { newId } from "../../lib/ledger";
import { parseNumber, euro, shortDate } from "../../lib/format";
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
  const [pauseForm, setPauseForm] = useState({ start: "", end: "", note: "" });
  const [pauseDone, setPauseDone] = useState(false);
  const [trucks, setTrucks] = useState({});

  // Camion de livraison : une fois par achat ayant ajouté du stock (le sien ou celui d'un autre),
  // la première fois qu'on voit l'onglet Stocks après, pendant une semaine au plus.
  useEffect(() => {
    const latest = {};
    data.transactions.forEach((transaction) => Object.keys(STOCK_KINDS).forEach((kind) => {
      if (!latest[kind] && Number(transaction.stockAdded?.[kind]) > 0) latest[kind] = transaction;
    }));
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch {}
    const weekAgo = Date.now() - 7 * 864e5;
    const fresh = {};
    Object.entries(latest).forEach(([kind, transaction]) => {
      if (seen[kind] !== transaction.id && new Date(transaction.date).getTime() > weekAgo) {
        fresh[kind] = { quantity: Number(transaction.stockAdded[kind]), key: transaction.id };
      }
      seen[kind] = transaction.id;
    });
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}
    if (!Object.keys(fresh).length) return;
    setTrucks(fresh);
    const timer = setTimeout(() => setTrucks({}), 2800);
    return () => clearTimeout(timer);
  }, [data.transactions]);
  const prices = referencePrices(data.transactions);
  const today = localDateKey();
  const pauses = [...(data.pauses || [])].sort((a, b) => a.start.localeCompare(b.start));
  const day = (key) => new Date(key + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  const addPause = async (event) => {
    event.preventDefault();
    const { start, end, note } = pauseForm;
    if (!start || !end || end < start) return mutate(() => "La date de fin doit être après la date de début.");
    const entry = { id: newId(), start, end, note: note.trim() };
    if (await mutate((state) => ({ ...state, pauses: [...(state.pauses || []), entry] }))) {
      setPauseForm({ start: "", end: "", note: "" });
      flashDone(setPauseDone);
    }
  };
  const removePause = (id) => mutate((state) => ({ ...state, pauses: (state.pauses || []).filter((entry) => entry.id !== id) }));
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
              {trucks[stock.kind] && <DeliveryTruck key={trucks[stock.kind].key} quantity={trucks[stock.kind].quantity} />}
              <div className="stock-card-title"><span>{stock.icon}</span><strong>{stock.label}</strong></div>
              <div className="stock-visual">
                {stock.kind === "coffee"
                  ? <CoffeeJar value={stock.value} capacity={STOCK_KINDS.coffee.restockDays * dailyStockRate("coffee", peopleCount)} />
                  : <ChocolateBar days={stock.value === null ? 0 : stock.depletion?.consumptionDays ?? 0} squares={STOCK_KINDS[stock.kind].restockDays} />}
              </div>
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
        <p className="eyebrow">PRIX DE RÉFÉRENCE</p>
        <h2>Combien acheter ?</h2>
        <p className="hint">Dernier prix payé, d'après les achats d'un seul produit avec les quantités renseignées.</p>
        <div className="sheet-stats">
          {[["coffee", "☕ le café"], ["lunch", "🍫 le chocolat"]].map(([kind, label]) => (
            <div key={kind}>
              <b>{prices[kind] ? (prices[kind].perUnit / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " €" : "—"}</b>
              <small>{label}{prices[kind] ? " · " + prices[kind].buyer + ", " + shortDate(new Date(prices[kind].date)) : " · pas encore connu"}</small>
            </div>
          ))}
        </div>
        {latest && (
          <ul className="suggestions light">
            {stocks.map((stock) => {
              const suggestion = restockSuggestion(stock, peopleCount, prices);
              return (
                <li key={stock.kind}>
                  {stock.icon} {stock.label} : {suggestion
                    ? <>≈ <strong>{suggestion.quantity.toLocaleString("fr-FR")}</strong> pour tenir {stock.kind === "friday" ? "4 vendredis" : "4 semaines"}{suggestion.cost !== null ? <> · ≈ <strong>{euro(suggestion.cost)}</strong></> : ""}</>
                    : "stock suffisant pour 4 semaines"}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <p className="eyebrow">VACANCES ET JOURS FÉRIÉS</p>
        <h2>Pauses de consommation</h2>
        <p className="hint">Les jours fériés sont automatiquement retirés des calculs. Ajoute ici les périodes où le groupe ne boit pas de café (vacances, fermeture…).</p>
        <p className="tiny">Prochains jours fériés : {upcomingHolidays(3, today).map((holiday) => holiday.name + " (" + day(holiday.date) + ")").join(" · ")}</p>
        {pauses.length > 0 && (
          <div className="history">
            {pauses.map((entry) => (
              <div className={"transaction" + (entry.end < today ? " past" : "")} key={entry.id}>
                <div>
                  <strong>{entry.start <= today && today <= entry.end ? "🏖️ En cours · " : ""}Du {day(entry.start)} au {day(entry.end)}</strong>
                  {entry.note && <p>{entry.note}</p>}
                </div>
                <div className="transaction-end"><button className="text-button" disabled={busy} onClick={() => removePause(entry.id)}>Supprimer</button></div>
              </div>
            ))}
          </div>
        )}
        <form className="purchase pause-form" onSubmit={addPause}>
          <div className="date-pair">
            <label>Du<input type="date" value={pauseForm.start} onChange={(event) => setPauseForm({ ...pauseForm, start: event.target.value, end: pauseForm.end || event.target.value })} required /></label>
            <label>Au<input type="date" value={pauseForm.end} min={pauseForm.start || undefined} onChange={(event) => setPauseForm({ ...pauseForm, end: event.target.value })} required /></label>
          </div>
          <label>Précision (facultatif)<input value={pauseForm.note} onChange={(event) => setPauseForm({ ...pauseForm, note: event.target.value })} placeholder="Ex. vacances de Noël" /></label>
          <SaveButton busy={busy} done={pauseDone} doneLabel="Pause ajoutée">Ajouter la pause</SaveButton>
        </form>
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
