// Logique des comptes : fonctions pures qui prennent l'état partagé et renvoient le nouvel état.
// Chaque fonction peut être rejouée sur un état plus récent si quelqu'un d'autre a enregistré
// entre-temps (voir `mutate` dans page.js). Elle renvoie une chaîne en cas d'erreur.

export const INITIAL = {
  people: ["Antoine", "Gilles", "Julien", "Pascal", "Seb"],
  archived: [],
  balances: { Antoine: -263, Gilles: -143, Julien: -1874, Pascal: -429, Seb: 2709 },
  transactions: [],
  reserve: ["Café"],
  advances: {},
  advanceHistory: [],
  stockHistory: [],
  pauses: [],
  updatedAt: null
};

export const newId = () => Date.now().toString();

const advancesFrom = (advanceHistory) => {
  const advances = {};
  advanceHistory.forEach((entry) => { advances[entry.person] = (advances[entry.person] || 0) + entry.remaining; });
  return advances;
};

export function normalizeData(value) {
  const people = Array.isArray(value?.people) ? value.people : INITIAL.people;
  const advanceHistory = Array.isArray(value?.advanceHistory)
    ? value.advanceHistory.map((entry) => ({
        ...entry,
        holder: entry.holder || (people.includes("Antoine") ? "Antoine" : entry.person),
        remaining: Number.isFinite(Number(entry.remaining)) ? Math.max(0, Number(entry.remaining)) : Math.max(0, Number(entry.amount) || 0)
      }))
    : [];
  const tracked = advancesFrom(advanceHistory);
  Object.entries(value?.advances || {}).forEach(([person, total]) => {
    const missing = Math.max(0, (Number(total) || 0) - (tracked[person] || 0));
    if (missing > 0) advanceHistory.push({
      id: "legacy-" + person, person, holder: person, amount: missing, remaining: missing,
      note: "Ancienne avance", date: value?.updatedAt || new Date().toISOString(), legacy: true
    });
  });
  return {
    ...INITIAL, ...(value || {}), people,
    archived: Array.isArray(value?.archived) ? value.archived.filter((name) => !people.includes(name)) : [],
    balances: value?.balances && typeof value.balances === "object" ? value.balances : INITIAL.balances,
    transactions: Array.isArray(value?.transactions) ? value.transactions : [],
    reserve: Array.isArray(value?.reserve) ? value.reserve : ["Café"],
    stockHistory: Array.isArray(value?.stockHistory) ? value.stockHistory : [],
    pauses: Array.isArray(value?.pauses) ? value.pauses : [],
    advances: advancesFrom(advanceHistory), advanceHistory
  };
}

// Le prochain au comptoir : la personne la plus en retard parmi les participants actuels.
export const nextBuyerOf = (data) => data.people
  .filter((person) => (data.balances[person] || 0) < 0)
  .sort((a, b) => (data.balances[a] || 0) - (data.balances[b] || 0))[0] || null;

// Enregistre un achat. `input` : { id, date, buyer, cents, item, note, participants, advanceId, stockAdded }.
// `index` : position dans l'historique (0 = en tête ; un achat modifié garde sa place).
export function applyPurchase(state, input, index = 0) {
  const { buyer, cents } = input;
  const participants = input.participants.filter((person) => state.people.includes(person));
  if (!participants.length) return "Choisis au moins un participant.";
  if (!Number.isFinite(cents) || cents <= 0 || !buyer) return "Montant invalide.";

  const baseShare = Math.floor(cents / participants.length);
  const remainder = cents - baseShare * participants.length;
  const changes = {};
  participants.forEach((person, i) => { changes[person] = -(baseShare + (i < remainder ? 1 : 0)); });

  const advance = input.advanceId ? state.advanceHistory.find((entry) => entry.id === input.advanceId) : null;
  if (input.advanceId && !advance) return "L'avance choisie n'existe plus.";
  const advanceUsed = advance ? Math.min(cents, Math.max(0, Number(advance.remaining) || 0)) : 0;
  changes[buyer] = (changes[buyer] || 0) + cents - advanceUsed;
  if (advanceUsed) changes[advance.person] = (changes[advance.person] || 0) + advanceUsed;

  const balances = { ...state.balances };
  Object.entries(changes).forEach(([person, change]) => { balances[person] = (balances[person] || 0) + change; });
  const advanceHistory = state.advanceHistory.map((entry) => entry.id === input.advanceId
    ? { ...entry, remaining: Math.max(0, entry.remaining - advanceUsed) } : entry);

  const transaction = {
    id: input.id, buyer, amount: cents, item: input.item, note: input.note,
    date: input.date, participants, changes,
    advancePerson: advanceUsed ? advance.person : null,
    advanceHolder: advanceUsed ? advance.holder : null,
    advanceId: advanceUsed ? advance.id : null,
    advanceUsed,
    stockAdded: input.stockAdded,
    ...(input.editedAt ? { editedAt: input.editedAt } : {})
  };
  const transactions = [...state.transactions];
  transactions.splice(index, 0, transaction);
  return { ...state, balances, advanceHistory, advances: advancesFrom(advanceHistory), transactions };
}

// Annule un achat : remet les soldes et l'avance utilisée comme avant, et le retire de l'historique.
export function revertPurchase(state, transactionId) {
  const transaction = state.transactions.find((entry) => entry.id === transactionId);
  if (!transaction) return "Cet achat a déjà été annulé ou modifié par quelqu'un d'autre.";
  const balances = { ...state.balances };
  Object.entries(transaction.changes || {}).forEach(([person, change]) => {
    balances[person] = (balances[person] || 0) - change;
  });
  let advanceHistory = state.advanceHistory;
  let advances = { ...state.advances };
  if (transaction.advancePerson && transaction.advanceUsed) {
    if (transaction.advanceId) {
      advanceHistory = advanceHistory.map((entry) => entry.id === transaction.advanceId
        ? { ...entry, remaining: entry.remaining + transaction.advanceUsed } : entry);
      advances = advancesFrom(advanceHistory);
    } else {
      // Ancien achat sans identifiant d'avance : normalizeData recrée l'avance à partir de ce total.
      advances[transaction.advancePerson] = (advances[transaction.advancePerson] || 0) + transaction.advanceUsed;
    }
  }
  return {
    ...state, balances, advances, advanceHistory,
    transactions: state.transactions.filter((entry) => entry.id !== transactionId)
  };
}

// Modifie un achat : on l'annule puis on l'enregistre à nouveau, à la même place dans l'historique.
export function editPurchase(state, transactionId, input) {
  const index = state.transactions.findIndex((entry) => entry.id === transactionId);
  const reverted = revertPurchase(state, transactionId);
  if (typeof reverted === "string") return reverted;
  const original = state.transactions[index];
  return applyPurchase(reverted, { ...input, id: original.id, date: original.date, editedAt: new Date().toISOString() }, index);
}

export function addPerson(state, rawName) {
  const name = rawName.trim();
  if (!name) return "Indique un nom.";
  const taken = [...state.people, ...state.archived].find((person) => person.toLowerCase() === name.toLowerCase());
  if (taken) return state.archived.includes(taken) ? taken + " est dans les anciens membres : réactive-le plutôt." : name + " fait déjà partie du groupe.";
  return {
    ...state,
    people: [...state.people, name],
    balances: { ...state.balances, [name]: 0 },
    advances: { ...state.advances, [name]: 0 }
  };
}

const appearsInHistory = (state, name) =>
  state.transactions.some((entry) => entry.buyer === name || (entry.participants || []).includes(name) || name in (entry.changes || {}))
  || state.advanceHistory.some((entry) => entry.person === name || entry.holder === name);

// Retire quelqu'un du groupe. Sans aucun historique et à 0 €, la personne est supprimée ;
// sinon elle est archivée : son solde est gelé et elle ne participe plus aux achats ni aux stocks.
export function removePerson(state, name) {
  if (!state.people.includes(name)) return name + " ne fait plus partie du groupe.";
  if (state.people.length <= 1) return "Le groupe doit garder au moins une personne.";
  const money = state.advanceHistory.find((entry) => entry.remaining > 0 && (entry.person === name || entry.holder === name));
  if (money) return "Impossible : " + (money.holder === name ? name + " détient encore l'argent de " + money.person : name + " a encore une avance disponible") + ". Utilise ou supprime d'abord cette avance.";
  const people = state.people.filter((person) => person !== name);
  if (!(state.balances[name] || 0) && !appearsInHistory(state, name)) {
    const balances = { ...state.balances };
    delete balances[name];
    return { ...state, people, balances };
  }
  return { ...state, people, archived: [...state.archived.filter((person) => person !== name), name] };
}

export function restorePerson(state, name) {
  if (!state.archived.includes(name)) return name + " fait déjà partie du groupe.";
  return { ...state, people: [...state.people, name], archived: state.archived.filter((person) => person !== name) };
}
