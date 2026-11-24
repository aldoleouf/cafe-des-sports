// Calculs de stock partagés entre l'application et le serveur (alertes).
// Café : 2 par personne du lundi au vendredi ; chocolat du midi : 1 par personne
// du lundi au jeudi ; chocolat du vendredi : 1 par personne le vendredi.
// Rien n'est consommé les jours fériés ni pendant les pauses (vacances du groupe).

export const STOCK_KINDS = {
  // alertDays : alerte quand il reste moins de ce nombre de jours de consommation.
  // restockDays : jours de consommation qu'un achat conseillé doit couvrir (environ 4 semaines).
  coffee: { label: "Café", icon: "☕", perPerson: 2, alertDays: 6, restockDays: 20, unit: "café" },
  lunch: { label: "Chocolat du midi", icon: "🍫", perPerson: 1, alertDays: 6, restockDays: 16, unit: "chocolat" },
  friday: { label: "Chocolat du vendredi", icon: "🍫", perPerson: 1, alertDays: 2, restockDays: 4, unit: "chocolat" } // 2 vendredis
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

// Dimanche de Pâques (algorithme de Meeus), pour les fériés mobiles.
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

const holidayCache = {};
// Jours fériés en France métropolitaine : { "2026-12-25": "Noël", … }
export function frenchHolidays(year) {
  if (holidayCache[year]) return holidayCache[year];
  const shift = (date, days) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return localDateKey(copy); };
  const sunday = easter(year);
  const fixed = (month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  holidayCache[year] = {
    [fixed(1, 1)]: "Jour de l'an",
    [shift(sunday, 1)]: "Lundi de Pâques",
    [fixed(5, 1)]: "Fête du travail",
    [fixed(5, 8)]: "Victoire 1945",
    [shift(sunday, 39)]: "Ascension",
    [shift(sunday, 50)]: "Lundi de Pentecôte",
    [fixed(7, 14)]: "Fête nationale",
    [fixed(8, 15)]: "Assomption",
    [fixed(11, 1)]: "Toussaint",
    [fixed(11, 11)]: "Armistice",
    [fixed(12, 25)]: "Noël"
  };
  return holidayCache[year];
}

export const holidayName = (key) => frenchHolidays(Number(key.slice(0, 4)))[key] || null;

// Pause du groupe couvrant ce jour ({ start, end } inclus, au format AAAA-MM-JJ).
export const pauseOn = (key, pauses) => (pauses || []).find((pause) => pause.start <= key && key <= pause.end) || null;

// Jour où l'on consomme réellement ce produit.
export function isConsumptionDay(kind, date, pauses) {
  if (!consumesOn(kind, date.getDay())) return false;
  const key = localDateKey(date);
  return !holidayName(key) && !pauseOn(key, pauses);
}

// Prochains jours fériés, pour les afficher dans l'onglet Stocks.
export function upcomingHolidays(count = 3, today = localDateKey()) {
  const year = Number(today.slice(0, 4));
  return [...Object.entries(frenchHolidays(year)), ...Object.entries(frenchHolidays(year + 1))]
    .filter(([key]) => key >= today).sort(([a], [b]) => a.localeCompare(b)).slice(0, count)
    .map(([key, name]) => ({ date: key, name }));
}

export const dailyStockRate = (kind, peopleCount) => peopleCount * (STOCK_KINDS[kind]?.perPerson || 1);

export function countStockDaysAfter(start, end, kind, pauses) {
  if (!start || !end || start >= end) return 0;
  const cursor = noonOf(start);
  const last = noonOf(end);
  let count = 0;
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= last) {
    if (isConsumptionDay(kind, cursor, pauses)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// Stock restant estimé à la fin de la journée `today` (AAAA-MM-JJ).
export function estimatedStock(snapshot, transactions, kind, peopleCount, today = localDateKey(), pauses = []) {
  if (!snapshot) return null;
  const days = countStockDaysAfter(snapshot.date, today, kind, pauses);
  const cutoff = new Date(snapshot.recordedAt || (snapshot.date + "T23:59:59.999")).getTime();
  const added = (transactions || []).reduce((sum, transaction) => {
    const time = new Date(transaction.date || 0).getTime();
    return time > cutoff ? sum + Math.max(0, Number(transaction.stockAdded?.[kind]) || 0) : sum;
  }, 0);
  return Number(snapshot[kind] || 0) + added - days * dailyStockRate(kind, peopleCount);
}

export function estimateStockDepletion(stock, kind, peopleCount, today = localDateKey(), pauses = []) {
  if (stock === null || !Number.isFinite(Number(stock)) || peopleCount <= 0) return null;
  if (stock <= 0) return { date: null, consumptionDays: 0 };
  const dailyRate = dailyStockRate(kind, peopleCount);
  const cursor = noonOf(today);
  let remaining = Number(stock);
  let consumptionDays = 0;
  for (let i = 0; i < 3650; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (!isConsumptionDay(kind, cursor, pauses)) continue;
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
    const value = estimatedStock(snapshot, state?.transactions, kind, peopleCount, today, state?.pauses);
    return {
      kind, ...STOCK_KINDS[kind], value,
      low: peopleCount > 0 && isLowStock(value, kind, peopleCount),
      depletion: estimateStockDepletion(value, kind, peopleCount, today, state?.pauses)
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

// Prix de référence : dernier prix unitaire payé, d'après les achats qui ne contiennent
// qu'un seul type de produit (café seul, ou chocolat seul).
export function referencePrices(transactions) {
  const prices = {};
  for (const transaction of transactions || []) { // du plus récent au plus ancien
    const added = transaction.stockAdded || {};
    const coffee = Number(added.coffee) || 0;
    const chocolate = (Number(added.lunch) || 0) + (Number(added.friday) || 0);
    if (!prices.coffee && coffee > 0 && !chocolate) prices.coffee = { perUnit: transaction.amount / coffee, date: transaction.date, buyer: transaction.buyer };
    if (!prices.chocolate && chocolate > 0 && !coffee) prices.chocolate = { perUnit: transaction.amount / chocolate, date: transaction.date, buyer: transaction.buyer };
    if (prices.coffee && prices.chocolate) break;
  }
  return { coffee: prices.coffee || null, lunch: prices.chocolate || null, friday: prices.chocolate || null };
}

// Quantité conseillée pour tenir environ quatre semaines, et son coût estimé (en centimes).
export function restockSuggestion(stock, peopleCount, prices) {
  if (stock.value === null || peopleCount <= 0) return null;
  const quantity = Math.max(0, Math.ceil(STOCK_KINDS[stock.kind].restockDays * dailyStockRate(stock.kind, peopleCount) - Math.max(0, stock.value)));
  if (!quantity) return null;
  const price = prices[stock.kind];
  return { quantity, cost: price ? Math.round(quantity * price.perUnit) : null };
}

// Consommation réelle entre deux relevés, comparée à l'estimation.
export function consumptionCheck(state) {
  const [latest, previous] = state?.stockHistory || [];
  if (!latest || !previous) return null;
  const from = new Date(previous.recordedAt || previous.date + "T23:59:59").getTime();
  const to = new Date(latest.recordedAt || latest.date + "T23:59:59").getTime();
  const peopleCount = state.people.length;
  return {
    from: previous.date, to: latest.date,
    kinds: Object.keys(STOCK_KINDS).map((kind) => {
      const added = (state.transactions || []).reduce((sum, transaction) => {
        const time = new Date(transaction.date).getTime();
        return time > from && time <= to ? sum + (Number(transaction.stockAdded?.[kind]) || 0) : sum;
      }, 0);
      const real = Number(previous[kind] || 0) + added - Number(latest[kind] || 0);
      const estimated = countStockDaysAfter(previous.date, latest.date, kind, state.pauses) * dailyStockRate(kind, peopleCount);
      return { kind, ...STOCK_KINDS[kind], real, estimated };
    })
  };
}
