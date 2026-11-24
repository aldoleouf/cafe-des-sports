"use client";

import { euro } from "../../lib/format";

// Ticket de caisse qui descend du haut de l'écran après un achat, puis repart.
export function Ticket({ ticket }) {
  if (!ticket) return null;
  const { buyer, cents, item, participants, advanceId } = ticket;
  const share = Math.round(cents / participants.length);
  const even = cents % participants.length === 0;
  return (
    <div className="ticket" key={ticket.key} role="status" aria-live="polite">
      <div className="ticket-paper">
        <p className="ticket-title">🧾 {item}</p>
        <p className="ticket-line"><span>Payé par {buyer}</span><b>{euro(cents)}</b></p>
        <p className="ticket-line"><span>Part de chacun × {participants.length}</span><b>{even ? "" : "≈ "}{euro(share)}</b></p>
        {advanceId && <p className="ticket-note">Pris en partie sur une avance</p>}
        <p className="ticket-thanks">Merci et à la prochaine tournée !</p>
      </div>
    </div>
  );
}

// Pièces qui tombent dans une tirelire quand on enregistre une avance.
export function Coins({ burst }) {
  if (!burst) return null;
  return (
    <div className="coins" key={burst.key} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => <span className="coin" key={i} style={{ "--i": i }}>🪙</span>)}
      <span className="piggy">🐷</span>
    </div>
  );
}

// Morceau de sucre qui tombe dans la tasse de l'en-tête, avec une éclaboussure.
export function Sugar({ drop }) {
  if (!drop) return null;
  return (
    <span className="sugar" key={drop.key} aria-hidden="true">
      <i className="cube" />
      <i className="splash" />
    </span>
  );
}
