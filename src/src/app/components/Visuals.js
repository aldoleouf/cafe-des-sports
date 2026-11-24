"use client";

import { useEffect, useState } from "react";
import { euro, signed } from "../../lib/format";

// Valeur qui part de `from` au premier affichage puis rejoint `value` (pour animer l'arrivée).
function useSettled(value, from) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

/* ---------- 46. Balance de comptoir ---------- */
// Penche du côté des personnes en retard, proportionnellement à l'écart à rattraper.
export function BalanceScale({ data, average }) {
  const late = data.people.filter((person) => (data.balances[person] || 0) < 0);
  const ahead = data.people.filter((person) => (data.balances[person] || 0) > 0);
  const debt = late.reduce((sum, person) => sum - data.balances[person], 0);
  const credit = ahead.reduce((sum, person) => sum + data.balances[person], 0);
  const target = Math.min(16, debt / Math.max(1, 2 * average) * 16);
  const angle = useSettled(target, 0);
  const drop = 105 * Math.sin(angle * Math.PI / 180);

  const pan = (x, dy, people, tone) => (
    <g className="scale-pan" style={{ transform: `translateY(${dy}px)` }}>
      <line x1={x} y1="40" x2={x - 40} y2="84" /><line x1={x} y1="40" x2={x + 40} y2="84" />
      <path d={`M${x - 44} 84 Q${x} 108 ${x + 44} 84 Z`} className="scale-dish" />
      {people.slice(0, 4).map((person, i) => (
        <g key={person} transform={`translate(${x - (Math.min(people.length, 4) - 1) * 10 + i * 20} 74)`}>
          <circle r="9.5" className={"scale-token " + tone} />
          <text y="4" textAnchor="middle" className="scale-initial">{person.charAt(0).toUpperCase()}</text>
        </g>
      ))}
    </g>
  );

  return (
    <div className="scale">
      <svg viewBox="0 0 300 150" role="img" aria-label={debt ? "La balance penche du côté des retards : " + euro(debt) + " à rattraper" : "Comptes en parfait équilibre"}>
        <path d="M118 140 h64 l-10 -12 h-44 Z" className="scale-base" />
        <line x1="150" y1="128" x2="150" y2="40" className="scale-post" />
        <g className="scale-beam" style={{ transform: `rotate(${-angle}deg)` }}>
          <line x1="45" y1="40" x2="255" y2="40" />
        </g>
        <circle cx="150" cy="40" r="6" className="scale-pivot" />
        {pan(45, drop, late, "late")}
        {pan(255, -drop, ahead, "ahead")}
      </svg>
      <div className="scale-legend">
        <span><b className="negative">{euro(debt)}</b> en retard</span>
        <strong>{debt ? "⚖️ Écart à rattraper" : "⚖️ Parfait équilibre"}</strong>
        <span><b className="positive">{euro(credit)}</b> en avance</span>
      </div>
    </div>
  );
}

/* ---------- 47. La course ---------- */
// Chaque personne court sur sa ligne, placée selon son solde ; le plus en avance est devant.
export function RaceTrack({ data }) {
  const values = data.people.map((person) => data.balances[person] || 0);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const position = (balance) => 4 + (balance - min) / Math.max(1, max - min) * 80; // en %
  const [started, setStarted] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setStarted(true)); return () => cancelAnimationFrame(frame); }, []);
  const order = [...data.people].sort((a, b) => (data.balances[b] || 0) - (data.balances[a] || 0));
  return (
    <div className="race" role="list" aria-label="Classement de la course">
      <div className="race-zero" style={{ left: position(0) + 6 + "%" }}><span>0 €</span></div>
      {order.map((person, rank) => {
        const balance = data.balances[person] || 0;
        return (
          <div className="lane" role="listitem" key={person}>
            <span className="lane-name">{rank === 0 && balance > 0 ? "👑 " : ""}{person}</span>
            <span className="lane-track">
              <span className={"runner" + (started ? " running" : "")} style={{ left: (started ? position(balance) : 0) + "%", "--rank": rank }}>
                <span className="runner-body">🏃</span>
              </span>
              <span className="finish">🏁</span>
            </span>
            <b className={balance < 0 ? "negative" : balance > 0 ? "positive" : ""}>{signed(balance)}</b>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 51. Bocal de café ---------- */
export function CoffeeJar({ value, capacity }) {
  const level = value === null ? 0 : Math.max(0, Math.min(1, value / Math.max(1, capacity)));
  const shown = useSettled(level, 0);
  const top = 30 + (1 - shown) * 62; // haut du café dans le bocal
  return (
    <svg className="jar" viewBox="0 0 70 100" role="img" aria-label={"Bocal rempli à " + Math.round(level * 100) + " %"}>
      <defs><clipPath id="jar-inside"><path d="M14 30 h42 v58 q0 8 -8 8 h-26 q-8 0 -8 -8 Z" /></clipPath></defs>
      <rect x="18" y="10" width="34" height="12" rx="3" className="jar-lid" />
      <g clipPath="url(#jar-inside)">
        {/* Le café monte jusqu'à son niveau (translation animée en CSS) */}
        <g className="jar-fill" style={{ transform: `translateY(${top}px)` }}>
          <rect x="-20" y="0" width="120" height="100" className="jar-coffee" />
          <path d="M-35 0 q8.75 -5 17.5 0 t17.5 0 t17.5 0 t17.5 0 t17.5 0 t17.5 0 t17.5 0 v6 h-122.5 Z" className="jar-wave" />
        </g>
        {[[24, 70], [40, 80], [32, 88], [46, 62], [22, 84]].map(([x, y], i) => y > 30 + (1 - level) * 62 + 4 && <ellipse key={i} cx={x} cy={y} rx="3.2" ry="2.2" className="jar-bean" />)}
      </g>
      <path d="M14 22 h42 v66 q0 8 -8 8 h-26 q-8 0 -8 -8 Z" className="jar-glass" />
      <path d="M20 34 v44" className="jar-shine" />
    </svg>
  );
}

/* ---------- 52. Tablette de chocolat ---------- */
// Un carré par jour de consommation couvert ; le dernier carré entamé se détache.
export function ChocolateBar({ days, squares }) {
  const remaining = Math.max(0, Math.min(squares, days ?? 0));
  const columns = squares > 8 ? 4 : squares;
  return (
    <div className="chocolate" style={{ "--cols": columns }} role="img" aria-label={remaining + " carré" + (remaining > 1 ? "s" : "") + " restant" + (remaining > 1 ? "s" : "") + " sur " + squares}>
      {Array.from({ length: squares }, (_, i) => (
        <i key={i} className={i < remaining ? "square" : i === remaining ? "square breaking" : "square gone"} style={{ "--i": i }} />
      ))}
    </div>
  );
}

/* ---------- 53. Camion de livraison ---------- */
export function DeliveryTruck({ quantity }) {
  return (
    <span className="truck" aria-hidden="true">
      <span className="truck-body">🚚</span>
      <span className="truck-tag">+{quantity.toLocaleString("fr-FR")}</span>
    </span>
  );
}
