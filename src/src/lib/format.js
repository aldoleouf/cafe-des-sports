// Mise en forme des montants (en centimes) et des dates.

export const euro = (cents) => (Math.abs(cents || 0) / 100).toLocaleString("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}) + " €";

export const signed = (cents) => (cents > 0 ? "+" : cents < 0 ? "−" : "") + euro(cents);

// Montant à dépenser pour effacer une dette quand l'achat est partagé entre `count` personnes :
// l'acheteur paie aussi sa propre part, il ne récupère donc que (count − 1) / count de la dépense.
export const target = (cents, count) => {
  const debt = Math.abs(cents || 0);
  return count > 1 ? Math.ceil(debt * count / (count - 1)) : debt;
};

export const dateLabel = (value) => new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export const shortDate = (date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

// « 3,50 » ← 350 centimes, pour pré-remplir un champ.
export const centsToInput = (cents) => (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

export const parseNumber = (value) => Number(String(value ?? "").trim().replace(",", "."));
