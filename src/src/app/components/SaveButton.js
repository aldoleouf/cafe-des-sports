"use client";

// Bouton d'enregistrement : une tasse se remplit pendant l'envoi, puis une coche apparaît.
export default function SaveButton({ busy, done, children, doneLabel = "Enregistré" }) {
  return (
    <button className={"primary wide save-button" + (busy ? " is-busy" : "") + (done ? " is-done" : "")} type="submit" disabled={busy}>
      {busy ? (
        <><span className="cup" aria-hidden="true"><i /></span> Enregistrement…</>
      ) : done ? (
        <><span className="check" aria-hidden="true">✓</span> {doneLabel}</>
      ) : children}
    </button>
  );
}

// Garde la coche affichée un court instant après un enregistrement réussi.
export function flashDone(setDone) {
  setDone(true);
  setTimeout(() => setDone(false), 1600);
}

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
