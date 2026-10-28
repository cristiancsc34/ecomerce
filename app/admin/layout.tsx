import type { Metadata } from "next";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { default: `Painel | ${brand.name}`, template: `%s | Painel ${brand.name}` },
  robots: { index: false, follow: false },
};

// O painel depende da sessão (cookies) em toda requisição: pode bloquear na
// navegação em vez de exibir um shell estático.
export const instant = false;

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-cloud">{children}</div>;
}
