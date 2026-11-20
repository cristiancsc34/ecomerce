import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { brand } from "@/config/brand";
import { siteUrl } from "@/config/site";
import { colors } from "@/config/tokens";
import { HOME_TITLE } from "@/lib/seo/home";
import { siteRobots } from "@/lib/seo/robots";
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
    // Sem travessão (issue #31); as páginas definem o próprio título.
    default: HOME_TITLE,
    template: `%s | ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: brand.name,
    title: HOME_TITLE,
    description: brand.description,
  },
  // Trava de indexação (issue #17) e modo demonstração: noindex, nofollow em tudo.
  robots: siteRobots(),
};

export const viewport: Viewport = {
  themeColor: colors.white,
  width: "device-width",
  initialScale: 1,
  // Ocupa a tela inteira do iPhone; as barras fixas somam a área segura (env(safe-area-inset-*)).
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-svh">{children}</body>
    </html>
  );
}
