import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { brand } from "@/config/brand";
import { isDemoMode, siteUrl } from "@/config/site";
import { colors } from "@/config/tokens";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Métricas de fallback ajustadas evitam deslocamento quando a fonte carrega.
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${brand.name} — ${brand.slogan}`,
    template: `%s | ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: brand.name,
    title: `${brand.name} — ${brand.slogan}`,
    description: brand.description,
  },
  // Em modo demonstração nada é indexado: os dados são fictícios.
  robots: isDemoMode() ? { index: false, follow: false } : { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: colors.white,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
