"use client";

import { useState } from "react";
import { euro } from "../../lib/format";
import { localDateKey, holidayName, pauseOn } from "../../lib/stock";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

// Vue mois : un point par achat, jours fériés et pauses en couleur. Toucher un jour le sélectionne.
export default function PurchaseCalendar({ transactions, pauses, selected, onSelect }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = {};
  transactions.forEach((transaction) => {
    const key = localDateKey(new Date(transaction.date));
    (byDay[key] = byDay[key] || []).push(transaction);
  });
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // lundi en premier
  const days = new Date(year, month + 1, 0).getDate();
  const today = localDateKey();
  const monthTotal = Object.entries(byDay).filter(([key]) => key.startsWith(localDateKey(cursor).slice(0, 7)))
    .reduce((sum, [, list]) => sum + list.reduce((s, transaction) => s + transaction.amount, 0), 0);
  const move = (step) => { setCursor(new Date(year, month + step, 1)); onSelect(null); };

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" className="small-button" onClick={() => move(-1)} aria-label="Mois précédent">‹</button>
        <div><strong>{cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</strong><small>{euro(monthTotal)} dépensés</small></div>
        <button type="button" className="small-button" onClick={() => move(1)} aria-label="Mois suivant">›</button>
      </div>
      <div className="calendar-grid" key={year + "-" + month}>
        {WEEKDAYS.map((day, i) => <span className="calendar-weekday" key={"w" + i}>{day}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={"e" + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const key = localDateKey(new Date(year, month, i + 1, 12));
          const list = byDay[key] || [];
          const holiday = holidayName(key);
          const paused = pauseOn(key, pauses);
          return (
            <button type="button" key={key} style={{ "--i": i }}
              className={"calendar-day" + (key === today ? " today" : "") + (key === selected ? " selected" : "") + (holiday ? " holiday" : "") + (paused ? " paused" : "") + (list.length ? " has" : "")}
              onClick={() => onSelect(key === selected ? null : key)}
              title={[holiday, paused && "Pause" + (paused.note ? " : " + paused.note : ""), list.length && list.length + " achat(s)"].filter(Boolean).join(" · ") || undefined}>
              <span>{i + 1}</span>
              <span className="dots">{list.slice(0, 3).map((transaction) => <i key={transaction.id} />)}</span>
            </button>
          );
        })}
      </div>
      <p className="calendar-legend"><span><i className="dot" /> achat</span><span><i className="swatch holiday" /> férié</span><span><i className="swatch paused" /> pause</span></p>
    </div>
  );
}
