// Statistiques calculées à partir de l'historique des achats.

export const monthKey = (date) => {
  const d = new Date(date);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
};

export const monthLabel = (key, style = "long") => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 15).toLocaleDateString("fr-FR", { month: style, ...(style === "long" ? { year: "numeric" } : {}) });
};

// Dépenses totales des `count` derniers mois (le plus ancien en premier).
export function monthlySpending(transactions, count = 6, now = new Date()) {
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15)));
  }
  const totals = Object.fromEntries(months.map((key) => [key, 0]));
  (transactions || []).forEach((transaction) => {
    const key = monthKey(transaction.date);
    if (key in totals) totals[key] += transaction.amount;
  });
  return months.map((key) => ({ key, total: totals[key] }));
}

// Total payé par chaque acheteur, du plus gros au plus petit.
export function buyerTotals(transactions, filter = () => true) {
  const totals = {};
  (transactions || []).filter(filter).forEach((transaction) => {
    totals[transaction.buyer] = (totals[transaction.buyer] || 0) + transaction.amount;
  });
  return Object.entries(totals).map(([person, total]) => ({ person, total })).sort((a, b) => b.total - a.total);
}

// Les trois plus gros acheteurs du mois.
export const monthPodium = (transactions, key = monthKey(new Date())) =>
  buyerTotals(transactions, (transaction) => monthKey(transaction.date) === key).slice(0, 3);

export function averagePurchase(transactions, fallback = 2000) {
  const recent = (transactions || []).slice(0, 20);
  return recent.length ? Math.round(recent.reduce((sum, transaction) => sum + transaction.amount, 0) / recent.length) : fallback;
}

// Solde d'une personne au début du mois : solde actuel moins les mouvements du mois.
export function monthStartBalance(data, person, key = monthKey(new Date())) {
  return (data.balances[person] || 0) - (data.transactions || [])
    .filter((transaction) => monthKey(transaction.date) >= key)
    .reduce((sum, transaction) => sum + (transaction.changes?.[person] || 0), 0);
}

// Passé en avance ce mois-ci (pour la médaille).
export const wentAheadThisMonth = (data, person) =>
  (data.balances[person] || 0) > 0 && monthStartBalance(data, person) <= 0;

// Évolution du solde d'une personne, du plus ancien au plus récent.
export function balanceHistory(data, person) {
  let balance = data.balances[person] || 0;
  const points = [{ date: new Date().toISOString(), balance }];
  for (const transaction of data.transactions || []) { // du plus récent au plus ancien
    const change = transaction.changes?.[person] || 0;
    if (!change) continue;
    points.push({ date: transaction.date, balance: balance - change });
    balance -= change;
  }
  return points.reverse();
}
