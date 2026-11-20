import type { MetadataRoute } from "next";
import { indexingAllowed, isDemoMode, siteUrl } from "@/config/site";

/**
 * Painel, API, sacola, checkout, pedidos, conta e busca nunca vão para o Google.
 * O resto da loja fica liberado mesmo com a trava de indexação fechada (issue
 * #17): sem `Disallow: /`, o Google consegue ler o `noindex` das páginas (meta e
 * cabeçalho X-Robots-Tag). A linha do sitemap só aparece com a trava aberta.
 */
export default function robots(): MetadataRoute.Robots {
  // Modo demonstração (desenvolvimento e testes): dados fictícios, nada é rastreado.
  if (isDemoMode()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const rules: MetadataRoute.Robots["rules"] = [
    {
      userAgent: "*",
      allow: "/",
      // /pedido: páginas pessoais com link secreto; /finalizar: dados do cliente.
      disallow: ["/admin", "/api", "/carrinho", "/finalizar", "/pedido", "/conta", "/busca"],
    },
  ];
  return indexingAllowed() ? { rules, sitemap: `${siteUrl()}/sitemap.xml` } : { rules };
}
