import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cantera · Tu próximo cliente empieza aquí", template: "%s · Cantera" },
  description:
    "Encuentra oportunidades, prepara conversaciones y organiza tus clientes en un solo lugar.",
  applicationName: "Cantera",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d0f0e" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a href="#main-content" className="skip-link">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
