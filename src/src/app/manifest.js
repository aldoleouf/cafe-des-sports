export default function manifest() {
  return {
    name: "Café des sports", short_name: "Café Sports",
    description: "Le suivi partagé des achats de café et de chocolat",
    start_url: "/", scope: "/", display: "standalone",
    background_color: "#eee4d4", theme_color: "#3d281d", lang: "fr-FR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
  };
}
