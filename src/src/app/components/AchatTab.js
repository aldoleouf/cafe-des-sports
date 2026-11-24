"use client";

import { useEffect, useState } from "react";
import { euro, centsToInput, parseNumber, dateLabel } from "../../lib/format";
import { applyPurchase, editPurchase, newId } from "../../lib/ledger";
import SaveButton, { flashDone } from "./SaveButton";

const QUANTITY_FIELDS = [
  ["coffee", "☕ Nombre de cafés ajoutés"],
  ["lunch", "🍫 Chocolats du midi ajoutés"],
  ["friday", "🍫 Chocolats du vendredi ajoutés"]
];
// Quantités proposées selon ce qui a été acheté.
const FIELDS_BY_ITEM = {
  "Café": ["coffee"],
  "Chocolat": ["lunch", "friday"],
  "Café et chocolat": ["coffee", "lunch", "friday"],
  "Autre": []
};
const NO_STOCK = { coffee: "0", lunch: "0", friday: "0" };

export default function AchatTab({ data, busy, mutate, editing, onDoneEditing, defaultBuyer, defaultItem }) {
  const blank = () => ({
    buyer: defaultBuyer, amount: "", item: defaultItem, note: "", excluded: [], advanceFrom: "", added: NO_STOCK
  });
  const fromTransaction = (transaction) => ({
    buyer: transaction.buyer,
    amount: centsToInput(transaction.amount),
    item: transaction.item,
    note: transaction.note || "",
    excluded: data.people.filter((person) => !(transaction.participants || data.people).includes(person)),
    advanceFrom: transaction.advanceId || "",
    added: Object.fromEntries(QUANTITY_FIELDS.map(([key]) => [key, String(transaction.stockAdded?.[key] || 0)]))
  });
  const [form, setForm] = useState(() => editing ? fromTransaction(editing) : blank());
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const set = (changes) => setForm((current) => ({ ...current, ...changes }));

  useEffect(() => {
    setForm(editing ? fromTransaction(editing) : blank());
    setTouched(false);
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tant que rien n'est saisi, on propose le prochain au comptoir et le produit prioritaire.
  useEffect(() => {
    if (!editing && !touched) set({ buyer: defaultBuyer, item: defaultItem });
  }, [defaultBuyer, defaultItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const participants = data.people.filter((person) => !form.excluded.includes(person));
  const visibleFields = QUANTITY_FIELDS.filter(([key]) => (FIELDS_BY_ITEM[form.item] || []).includes(key) || Number(parseNumber(form.added[key])) > 0);
  const buyers = editing && !data.people.includes(editing.buyer) ? [...data.people, editing.buyer] : data.people;
  const advanceAvailable = (entry) => entry.remaining + (editing && editing.advanceId === entry.id ? editing.advanceUsed : 0);
  const advances = data.advanceHistory.filter((entry) => advanceAvailable(entry) > 0);
  const selectedAdvance = advances.find((entry) => entry.id === form.advanceFrom);
  const cents = Math.round(100 * parseNumber(form.amount));

  const toggleParticipant = (person) => set({
    excluded: form.excluded.includes(person) ? form.excluded.filter((name) => name !== person) : [...form.excluded, person]
  });

  const submit = async (event) => {
    event.preventDefault();
    if (!Number.isFinite(cents) || cents <= 0 || !form.buyer) return mutate(() => "Indique un montant valide.");
    if (!participants.length) return mutate(() => "Choisis au moins un participant.");
    const shown = visibleFields.map(([key]) => key);
    const stockAdded = Object.fromEntries(QUANTITY_FIELDS.map(([key]) => [key, shown.includes(key) ? parseNumber(form.added[key] || "0") : 0]));
    if (Object.values(stockAdded).some((value) => !Number.isFinite(value) || value < 0)) {
      return mutate(() => "Les quantités ajoutées doivent être positives ou nulles.");
    }
    const input = {
      id: newId(), date: new Date().toISOString(), buyer: form.buyer, cents, item: form.item, note: form.note.trim(),
      participants, advanceId: form.advanceFrom || null, stockAdded
    };
    const ok = await mutate((state) => editing ? editPurchase(state, editing.id, input) : applyPurchase(state, input));
    if (!ok) return;
    if (editing) onDoneEditing();
    else { setForm(blank()); setTouched(false); flashDone(setDone); }
  };

  return (
    <section className="panel">
      <p className="eyebrow">{editing ? "CORRECTION" : "UNE PETITE TOURNÉE ?"}</p>
      <h2>{editing ? "Modifier l'achat" : "Enregistrer un achat"}</h2>
      {editing && <p className="hint editing-banner">Achat de {editing.buyer} du {dateLabel(editing.date)}. Les comptes seront recalculés comme si l'achat avait été saisi ainsi dès le départ.</p>}
      <form className="purchase" onSubmit={submit}>
        <label>Qui a payé ?
          <select value={form.buyer} onChange={(event) => { set({ buyer: event.target.value }); setTouched(true); }}>
            {buyers.map((person) => <option key={person} value={person}>{person}</option>)}
          </select>
        </label>
        <label>Montant (€)
          <input inputMode="decimal" value={form.amount} onChange={(event) => set({ amount: event.target.value })} placeholder="Ex. 3,50" required />
        </label>
        <label>Qu'est-ce qu'on a pris ?
          <select value={form.item} onChange={(event) => { set({ item: event.target.value }); setTouched(true); }}>
            {Object.keys(FIELDS_BY_ITEM).map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        {visibleFields.length > 0 && (
          <div className="stock-additions">
            <p className="eyebrow">QUANTITÉS AJOUTÉES AUX STOCKS</p>
            <p className="hint">Indique les quantités achetées pour mettre à jour les stocks.</p>
            {visibleFields.map(([key, label]) => (
              <label key={key}>{label}
                <input inputMode="decimal" value={form.added[key]} onChange={(event) => set({ added: { ...form.added, [key]: event.target.value } })} onFocus={(event) => event.target.select()} placeholder="0" />
              </label>
            ))}
          </div>
        )}
        <div className="participants">
          <p className="field-title">Pour qui ?</p>
          <div className="choices">
            {data.people.map((person) => (
              <button type="button" key={person} className={form.excluded.includes(person) ? "choice" : "choice active"} aria-pressed={!form.excluded.includes(person)} onClick={() => toggleParticipant(person)}>
                {form.excluded.includes(person) ? "" : "✓ "}{person}
              </button>
            ))}
          </div>
          <p className="hint">
            {participants.length
              ? "Partagé entre " + participants.length + " participant" + (participants.length > 1 ? "s" : "") + (cents > 0 ? " : environ " + euro(Math.round(cents / participants.length)) + " chacun." : ".")
              : "Choisis au moins un participant."}
            {form.excluded.length > 0 && " Absent" + (form.excluded.length > 1 ? "s" : "") + " : " + form.excluded.join(", ") + "."}
          </p>
        </div>
        <label>Financé par une avance ?
          <select value={form.advanceFrom} onChange={(event) => set({ advanceFrom: event.target.value })}>
            <option value="">Aucune avance</option>
            {advances.map((entry) => (
              <option key={entry.id} value={entry.id}>Avance de {entry.person}, détenue par {entry.holder} — {euro(advanceAvailable(entry))} disponible</option>
            ))}
          </select>
        </label>
        {selectedAdvance && <p className="hint">Jusqu'à {euro(advanceAvailable(selectedAdvance))} seront pris sur l'argent de {selectedAdvance.person}, actuellement détenu par {selectedAdvance.holder}. La part financée sera comptabilisée au nom de {selectedAdvance.person}.</p>}
        <label>Précision (facultatif)
          <input value={form.note} onChange={(event) => set({ note: event.target.value })} placeholder="Ex. deux cafés, un chocolat" />
        </label>
        <SaveButton busy={busy} done={done} doneLabel="Achat enregistré">{editing ? "Enregistrer la modification" : "Enregistrer l'achat"}</SaveButton>
        {editing && <button type="button" className="text-button" onClick={onDoneEditing}>Abandonner la modification</button>}
      </form>
    </section>
  );
}
