import "./globals.css";
import PwaRegister from "./PwaRegister";

export const metadata = {
  title: "Café des sports",
  description: "Les comptes du café et du chocolat entre copains",
  applicationName: "Café des sports",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Café des sports" }
};
export const viewport = { themeColor: "#3d281d" };
export default function RootLayout({ children }) {
  return <html lang="fr"><body><PwaRegister />{children}</body></html>;
}
