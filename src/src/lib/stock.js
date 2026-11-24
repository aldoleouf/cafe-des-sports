// Calculs de stock partagés entre l'application et le serveur (alertes).
// Café : 2 par personne du lundi au vendredi ; chocolat du midi : 1 par personne
// du lundi au jeudi ; chocolat du vendredi : 1 par personne le vendredi.

export const STOCK_KINDS = {
  // alertDays : alerte quand il reste moins de ce nombre de jours de consommation.
  coffee: { label: "Café", icon: "☕", perPerson: 2, alertDays: 6 },
  lunch: { label: "Chocolat du midi", icon: "🍫", perPerson: 1, alertDays: 6 },
  friday: { label: "Chocolat du vendredi", icon: "🍫", perPerson: 1, alertDays: 2 } // 2 vendredis
};

export const localDateKey = (d = new Date()) =>
  [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

// Date du jour à Paris (le serveur tourne en UTC).
export const parisDateKey = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const noonOf = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

export function consumesOn(kind, day) {
  if (kind === "coffee") return day >= 1 && day <= 5;
  if (kind === "lunch") return day >= 1 && day <= 4;
  return day === 5;
}

export const dailyStockRate = (kind, peopleCount) => peopleCount * (STOCK_KINDS[kind]?.perPerson || 1);

export function countStockDaysAfter(start, end, kind) {
  if (!start || !end || start >= end) return 0;
  const cursor = noonOf(start);
  const last = noonOf(end);
  let count = 0;
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= last) {
    if (consumesOn(kind, cursor.getDay())) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// Stock restant estimé à la fin de la journée `today` (AAAA-MM-JJ).
export function estimatedStock(snapshot, transactions, kind, peopleCount, today = localDateKey()) {
  if (!snapshot) return null;
  const days = countStockDaysAfter(snapshot.date, today, kind);
  const cutoff = new Date(snapshot.recordedAt || (snapshot.date + "T23:59:59.999")).getTime();
  const added = (transactions || []).reduce((sum, transaction) => {
    const time = new Date(transaction.date || 0).getTime();
    return time > cutoff ? sum + Math.max(0, Number(transaction.stockAdded?.[kind]) || 0) : sum;
  }, 0);
  return Number(snapshot[kind] || 0) + added - days * dailyStockRate(kind, peopleCount);
}

export function estimateStockDepletion(stock, kind, peopleCount, today = localDateKey()) {
  if (stock === null || !Number.isFinite(Number(stock)) || peopleCount <= 0) return null;
  if (stock <= 0) return { date: null, consumptionDays: 0 };
  const dailyRate = dailyStockRate(kind, peopleCount);
  const cursor = noonOf(today);
  let remaining = Number(stock);
  let consumptionDays = 0;
  for (let i = 0; i < 3650; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (!consumesOn(kind, cursor.getDay())) continue;
    consumptionDays++;
    remaining -= dailyRate;
    if (remaining <= 0) return { date: new Date(cursor), consumptionDays };
  }
  return null;
}

// Seuil d'alerte unique pour toute l'application (onglets Comptes et Stocks,
// récapitulatif partagé, notifications) : alertDays jours de consommation.
export const stockThreshold = (kind, peopleCount) => STOCK_KINDS[kind].alertDays * dailyStockRate(kind, peopleCount);
export const isLowStock = (value, kind, peopleCount) => value !== null && value < stockThreshold(kind, peopleCount);

// État de chaque produit à partir du dernier relevé : quantité estimée, alerte, date de fin.
export function stockOverview(state, today = localDateKey()) {
  const snapshot = state?.stockHistory?.[0] || null;
  const peopleCount = Array.isArray(state?.people) ? state.people.length : 0;
  return Object.keys(STOCK_KINDS).map((kind) => {
    const value = estimatedStock(snapshot, state?.transactions, kind, peopleCount, today);
    return {
      kind, ...STOCK_KINDS[kind], value,
      low: peopleCount > 0 && isLowStock(value, kind, peopleCount),
      depletion: estimateStockDepletion(value, kind, peopleCount, today)
    };
  });
}

// Produits dont le stock couvre moins de alertDays jours de consommation (ou en rupture).
export function lowStocks(state, today = localDateKey()) {
  if (!state?.stockHistory?.[0]) return [];
  return stockOverview(state, today)
    .filter((stock) => stock.low && stock.depletion)
    .map(({ depletion, low, ...stock }) => ({ ...stock, days: depletion.consumptionDays, lastDay: depletion.date }));
}
