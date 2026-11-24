// Export des comptes en tableau classique, à coller dans un mail.
// Les noms complets ne servent qu'ici : l'application garde les prénoms.
import { euro, signed, target } from "./format";

const FULL_NAMES = {
  Antoine: "Antoine Riffort",
  Gilles: "Gilles Patanchon",
  Julien: "Julien Falco",
  Pascal: "Pascal Pointet",
  Seb: "Sebastien Delmas"
};

export const fullName = (person) => FULL_NAMES[person] || person;

const HEADERS = ["Nom", "Retard / avance", "À payer pour compenser"];

// Lignes du tableau, du plus en retard au plus en avance.
export function accountRows(data) {
  const count = data.people.length;
  return [...data.people]
    .sort((a, b) => (data.balances[a] || 0) - (data.balances[b] || 0))
    .map((person) => {
      const balance = data.balances[person] || 0;
      return [fullName(person), signed(balance), balance < 0 ? euro(target(balance, count)) : "—"];
    });
}

const title = () => "Café des sports — comptes au " + new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

// Texte brut aligné avec des espaces (colonnes nettes dans un mail en texte simple).
export function accountsText(data) {
  const rows = accountRows(data);
  const widths = HEADERS.map((header, i) => Math.max(header.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => cells.map((cell, i) => i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i])).join(" | ");
  return [
    title(),
    "",
    line(HEADERS),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...rows.map(line)
  ].join("\n");
}

const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Même tableau en HTML : collé dans Gmail ou Outlook, il devient un vrai tableau.
export function accountsHtml(data) {
  const cell = (tag, value, align) => `<${tag} style="border:1px solid #bbb;padding:4px 10px;text-align:${align}">${escape(value)}</${tag}>`;
  const row = (cells, tag) => "<tr>" + cells.map((value, i) => cell(tag, value, i ? "right" : "left")).join("") + "</tr>";
  return `<p><b>${escape(title())}</b></p><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">`
    + row(HEADERS, "th") + accountRows(data).map((cells) => row(cells, "td")).join("") + "</table>";
}
