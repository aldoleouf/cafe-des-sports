// Image du récapitulatif à partager (WhatsApp…), dessinée dans un canvas
// avec les polices et les couleurs de l'application.
import { euro, signed, target, shortDate } from "./format";
import { nextBuyerOf } from "./ledger";
import { stockOverview } from "./stock";

const WIDTH = 540; // largeur logique, dessinée en 2× pour les écrans de téléphone
const SCALE = 2;
const L = 42; // marge gauche du contenu
const R = WIDTH - 42; // marge droite du contenu

const C = {
  page: "#eee4d4", card: "#3d281d", cardDeep: "#2a1a12", gold: "#d6a34f", goldSoft: "#e6bc71",
  eyebrow: "#d6b783", cream: "#fffaf0", muted: "#e3d2bc", line: "#68452f",
  red: "#f2b4a8", redBg: "#5a3127", green: "#b6dfbd", greenBg: "#2f4a37", track: "#ffffff1c"
};
const SERIF = "Fraunces, Georgia, serif";
const SANS = "'DM Sans', Arial, sans-serif";

const SHORT_LABELS = { coffee: "Café", lunch: "Choco midi", friday: "Choco vendredi" };

async function loadFonts() {
  if (!document.fonts?.load) return;
  const wanted = ["800 30px Fraunces", "700 20px Fraunces", "400 13px 'DM Sans'", "700 16px 'DM Sans'"];
  // On n'attend pas plus d'une seconde et demie : sinon, polices de secours.
  await Promise.race([
    Promise.all(wanted.map((font) => document.fonts.load(font))).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1500))
  ]);
}

// Coupe un texte trop long avec « … » pour qu'il tienne dans maxWidth.
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + "…").width > maxWidth) cut = cut.slice(0, -1);
  return cut.trimEnd() + "…";
}

function text(ctx, value, x, y, { font, color, align = "left", spacing = "0px", maxWidth } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if ("letterSpacing" in ctx) ctx.letterSpacing = spacing;
  const shown = maxWidth ? fit(ctx, value, maxWidth) : value;
  ctx.fillText(shown, x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
  return ctx.measureText(shown).width;
}

const eyebrow = (ctx, value, y) => text(ctx, value, L, y, { font: `700 10px ${SANS}`, color: C.eyebrow, spacing: "2px" });

function separator(ctx, y) {
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(L, y);
  ctx.lineTo(R, y);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// Priorité d'achat : calculée depuis les stocks quand un relevé existe, sinon le choix manuel.
export function purchaseAdvice(data, stocks = stockOverview(data)) {
  if (data.stockHistory?.[0]) {
    const low = stocks.filter((stock) => stock.low).map((stock) => stock.label.toLowerCase());
    return low.length ? "À acheter en priorité : " + low.join(" et ") + "." : "Stocks suffisants : aucun achat urgent pour le moment.";
  }
  return "Idéalement en " + ((data.reserve?.length ? data.reserve : ["Café"]).join(" et ").toLowerCase()) + ".";
}

function drawContent(ctx, data) {
  const people = data.people || [];
  const balances = data.balances || {};
  const count = people.length;
  const next = nextBuyerOf(data);
  const stocks = stockOverview(data);

  // En-tête : emblème, nom de l'application, ballon.
  ctx.strokeStyle = "#b68a50";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#ffffff12";
  ctx.beginPath();
  ctx.arc(L + 26, 70, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  text(ctx, "☕", L + 26, 79, { font: `24px ${SANS}`, color: C.cream, align: "center" });
  text(ctx, "LE COMPTOIR DES COPAINS", L + 68, 60, { font: `700 10px ${SANS}`, color: C.eyebrow, spacing: "2px" });
  const cafeWidth = text(ctx, "Café ", L + 68, 92, { font: `800 30px ${SERIF}`, color: C.cream });
  text(ctx, "des sports", L + 68 + cafeWidth, 92, { font: `800 30px ${SERIF}`, color: C.goldSoft });
  ctx.globalAlpha = 0.55;
  text(ctx, "⚽", R, 62, { font: `24px ${SANS}`, color: C.cream, align: "right" });
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.gold;
  ctx.fillRect(L, 122, R - L, 2);

  // Le prochain au comptoir.
  let y = 160;
  eyebrow(ctx, "PROCHAIN À PASSER AU COMPTOIR", y);
  if (next) {
    text(ctx, next, L, y + 44, { font: `800 38px ${SERIF}`, color: C.cream, maxWidth: R - L });
    const amountWidth = text(ctx, euro(target(balances[next], count)), L, y + 82, { font: `800 26px ${SERIF}`, color: C.goldSoft });
    text(ctx, "à dépenser pour compenser", L + amountWidth + 10, y + 81, { font: `500 13px ${SANS}`, color: C.muted });
  } else {
    text(ctx, "Tout le monde est à jour !", L, y + 44, { font: `800 32px ${SERIF}`, color: C.cream, maxWidth: R - L });
    text(ctx, "Les comptes sont équilibrés.", L, y + 80, { font: `500 15px ${SANS}`, color: C.muted });
  }
  text(ctx, purchaseAdvice(data, stocks), L, y + 112, { font: `500 13px ${SANS}`, color: C.muted, maxWidth: R - L });
  y += 140;

  // Les stocks, quand un relevé existe.
  if (data.stockHistory?.[0]) {
    separator(ctx, y);
    y += 34;
    eyebrow(ctx, "STOCKS ESTIMÉS", y);
    y += 14;
    const gap = 10;
    const width = (R - L - 2 * gap) / 3;
    stocks.forEach((stock, i) => {
      const x = L + i * (width + gap);
      const empty = stock.value !== null && stock.value <= 0;
      roundRect(ctx, x, y, width, 92, 12);
      ctx.fillStyle = stock.low ? C.redBg : "#ffffff10";
      ctx.fill();
      if (stock.low) { ctx.strokeStyle = C.red + "88"; ctx.lineWidth = 1; ctx.stroke(); }
      text(ctx, stock.icon + " " + SHORT_LABELS[stock.kind], x + 12, y + 22, { font: `700 11.5px ${SANS}`, color: C.muted, maxWidth: width - 24 });
      const value = stock.value === null ? "—" : Math.max(0, stock.value).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
      text(ctx, value, x + 12, y + 56, { font: `800 26px ${SERIF}`, color: stock.low ? C.red : C.green });
      const detail = stock.value === null ? "" : empty || !stock.depletion?.date ? "⚠ Rupture" : (stock.low ? "⚠ " : "") + "jusqu'au " + shortDate(stock.depletion.date);
      text(ctx, detail, x + 12, y + 78, { font: `${stock.low ? 700 : 500} 11px ${SANS}`, color: stock.low ? C.red : C.muted, maxWidth: width - 24 });
    });
    y += 92 + 30;
  }

  // Les comptes, du plus en retard au plus en avance.
  separator(ctx, y);
  y += 40;
  text(ctx, "Les comptes du groupe", L, y, { font: `700 20px ${SERIF}`, color: C.gold });
  y += 22;
  const sorted = [...people].sort((a, b) => (balances[a] || 0) - (balances[b] || 0));
  const maxAbs = Math.max(100, ...people.map((person) => Math.abs(balances[person] || 0)));
  for (const person of sorted) {
    const balance = balances[person] || 0;
    const isNext = person === next;
    if (isNext) {
      roundRect(ctx, L - 12, y - 2, R - L + 24, 62, 12);
      ctx.fillStyle = C.gold + "26";
      ctx.fill();
      ctx.strokeStyle = C.gold + "99";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Avatar
    ctx.fillStyle = balance < 0 ? C.redBg : balance > 0 ? C.greenBg : "#ffffff14";
    ctx.beginPath();
    ctx.arc(L + 17, y + 28, 17, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, person.charAt(0).toUpperCase(), L + 17, y + 34, { font: `700 16px ${SERIF}`, color: balance < 0 ? C.red : balance > 0 ? C.green : C.cream, align: "center" });
    // Montant, puis nom tronqué pour ne jamais le chevaucher.
    ctx.font = `700 18px ${SANS}`;
    const amountWidth = ctx.measureText(signed(balance)).width;
    text(ctx, signed(balance), R, y + 22, { font: `700 18px ${SANS}`, color: balance < 0 ? C.red : balance > 0 ? C.green : C.cream, align: "right" });
    text(ctx, person, L + 46, y + 21, { font: `700 16px ${SANS}`, color: C.cream, maxWidth: R - amountWidth - 16 - (L + 46) });
    const status = isNext
      ? "👉 C'est ton tour · " + euro(target(balance, count)) + " à dépenser"
      : balance < 0 ? "À dépenser : " + euro(target(balance, count)) : balance > 0 ? "En avance" : "À jour";
    text(ctx, status, L + 46, y + 38, { font: `${isNext ? 700 : 500} 11.5px ${SANS}`, color: isNext ? C.goldSoft : C.muted, maxWidth: R - L - 46 });
    // Barre de solde
    const barWidth = R - (L + 46);
    roundRect(ctx, L + 46, y + 46, barWidth, 5, 3);
    ctx.fillStyle = C.track;
    ctx.fill();
    if (balance) {
      roundRect(ctx, L + 46, y + 46, Math.max(5, Math.abs(balance) / maxAbs * barWidth), 5, 3);
      ctx.fillStyle = balance < 0 ? C.red : C.green;
      ctx.fill();
    }
    y += 70;
  }

  // Pied de page
  y += 4;
  separator(ctx, y);
  const now = new Date();
  text(ctx, "Récapitulatif au " + now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    + " à " + now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), L, y + 28, { font: `500 12px ${SANS}`, color: C.gold });
  return y + 52;
}

export async function renderRecap(data) {
  await loadFonts();
  // On dessine sur une grande feuille, puis on recadre à la hauteur réellement utilisée.
  const draft = document.createElement("canvas");
  draft.width = WIDTH * SCALE;
  draft.height = 4000 * SCALE;
  const ctx = draft.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";
  const cardBottom = drawContent(ctx, data);
  const height = cardBottom + 16;

  // Fond dessiné après coup, sous le contenu.
  ctx.globalCompositeOperation = "destination-over";
  const gradient = ctx.createLinearGradient(16, 16, WIDTH - 16, cardBottom);
  gradient.addColorStop(0, C.card);
  gradient.addColorStop(1, C.cardDeep);
  roundRect(ctx, 16, 16, WIDTH - 32, cardBottom - 16, 24);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.globalCompositeOperation = "source-over";
  roundRect(ctx, 16, 16, WIDTH - 32, cardBottom - 16, 24);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  canvas.getContext("2d").drawImage(draft, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image")), "image/png"));
}

export async function shareRecap(data) {
  const blob = await renderRecap(data);
  const file = new File([blob], "cafe-des-sports.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ title: "Café des sports — les comptes", text: "Le prochain au comptoir et les comptes du groupe", files: [file] });
  } else {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cafe-des-sports.png";
    link.click();
    URL.revokeObjectURL(url);
    alert("Image créée. Tu peux maintenant la joindre à ta conversation.");
  }
}
