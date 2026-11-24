export default function manifest() {
  return {
    name: "Café des sports", short_name: "Café Sports",
    description: "Le suivi partagé des achats de café et de chocolat",
    start_url: "/", scope: "/", display: "standalone",
    background_color: "#eee4d4", theme_color: "#3d281d", lang: "fr-FR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
    // Appui long sur l'icône de l'app (Android, Chrome) : raccourcis directs.
    shortcuts: [
      { name: "Nouvel achat", short_name: "Achat", url: "/?tab=achat", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Les comptes", short_name: "Comptes", url: "/?tab=comptes", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Relevé de stock", short_name: "Stocks", url: "/?tab=stocks", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] }
    ]
  };
}
